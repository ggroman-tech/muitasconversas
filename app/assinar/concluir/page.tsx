import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { claimPreapproval, getPaymentInfo, MP_ID_RE } from "@/lib/assinatura/server";
import { deriveSubscriptionState } from "@/lib/assinatura/state";
import { formatBRL, formatDateOnly } from "@/lib/auth/format";
import { createSupabaseServerClient, getAuthUser } from "@/lib/auth/supabase-server";
import styles from "@/lib/auth/ui.module.css";
import { VerifyPayment } from "../verify-payment";

export const metadata: Metadata = { title: "Pagamento da assinatura — Muitas Conversas" };

type SP = { preapproval_id?: string };

export default function ConcluirPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <Suspense fallback={<p role="status">Carregando…</p>}>
      <Concluir searchParams={searchParams} />
    </Suspense>
  );
}

type LooseRpc = { rpc: (fn: string, args?: object) => Promise<{ data: unknown; error: unknown }> };

/**
 * Página oficial de retorno do Mercado Pago (back_url do plano):
 *   https://muitasconversas.vercel.app/assinar/concluir
 * O Mercado Pago acrescenta ?preapproval_id=...; sem login, o middleware manda para /entrar
 * e devolve para cá depois, com o parâmetro preservado.
 */
async function Concluir({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const pid = sp.preapproval_id && MP_ID_RE.test(sp.preapproval_id) ? sp.preapproval_id : undefined;

  const user = await getAuthUser();
  if (!user) {
    const back = pid ? `/assinar/concluir?preapproval_id=${pid}` : "/assinar/concluir";
    redirect(`/entrar?next=${encodeURIComponent(back)}`);
  }
  const supabase = await createSupabaseServerClient();

  // Vincula a assinatura devolvida pelo Mercado Pago ao cliente logado (o webhook pode chegar antes ou depois).
  const claim = pid ? await claimPreapproval(supabase, pid) : null;

  let { data: account } = await supabase.from("my_account").select("*").maybeSingle();
  if (account?.subscription_status === "canceled") {
    // Quem cancelou e quer assinar de novo precisa de uma assinatura pendente para receber o novo pagamento.
    await (supabase as unknown as LooseRpc).rpc("resubscribe");
    ({ data: account } = await supabase.from("my_account").select("*").maybeSingle());
  }
  if (!account) redirect("/assinar");
  if (account.subscription_status === "active") {
    const st = deriveSubscriptionState({
      status: account.subscription_status,
      currentPeriodEnd: account.current_period_end,
    });
    if (st.hasAccess) redirect("/conta");
  }

  const payment = await getPaymentInfo(supabase);
  const state = deriveSubscriptionState({
    status: account.subscription_status,
    currentPeriodEnd: account.current_period_end,
    payment,
    justReturned: claim === "waiting_confirmation" || claim === "already_linked" || claim === "linked",
  });
  const { data: checkoutUrl } = await (supabase as unknown as LooseRpc).rpc("mp_checkout_url");
  const payUrl = typeof checkoutUrl === "string" && checkoutUrl ? checkoutUrl : null;
  const firstName = account.full_name.split(" ")[0];

  return (
    <>
      <h1 className={styles.h1}>
        {state.key === "verifying" ? "Verificando o seu pagamento" : "Pagamento da assinatura"}
      </h1>
      <p className={styles.lead}>
        Olá, {firstName}! Assinatura de {formatBRL(account.plan_price_cents)} a cada 30 dias.
      </p>

      <div className={styles.card} role="status">
        <p>
          <strong>Situação: {state.label}.</strong> {state.description}
        </p>
        {account.current_period_end && state.key === "expired" ? (
          <p className={styles.muted}>Pago até {formatDateOnly(account.current_period_end)}.</p>
        ) : null}

        {state.canPay && payUrl ? (
          <p>
            Pague no Mercado Pago, em ambiente seguro, usando o mesmo e-mail desta conta ({user.email}). Depois de
            pagar, volte para esta página.
            <br />
            <a href={payUrl} className={styles.button}>
              Pagar a assinatura
            </a>
          </p>
        ) : null}
        {state.canPay && !payUrl ? (
          <p className={styles.muted}>O pagamento ainda não está disponível. Tente novamente mais tarde.</p>
        ) : null}

        {state.canVerify ? (
          <VerifyPayment
            preapprovalId={pid}
            auto={state.key === "verifying" || Boolean(pid)}
            buttonClass={state.canPay ? styles.buttonGhost : styles.button}
          />
        ) : null}
      </div>

      <Link href="/conta" className={styles.link}>
        Ir para minha conta
      </Link>
    </>
  );
}
