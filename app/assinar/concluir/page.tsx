import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { formatBRL } from "@/lib/auth/format";
import { createSupabaseServerClient, getAuthUser } from "@/lib/auth/supabase-server";
import styles from "@/lib/auth/ui.module.css";

export const metadata: Metadata = { title: "Cadastro recebido — Muitas Conversas" };

type SP = { preapproval_id?: string };

export default function ConcluirPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <Suspense fallback={<p role="status">Carregando…</p>}>
      <Concluir searchParams={searchParams} />
    </Suspense>
  );
}

type LooseRpc = { rpc: (fn: string, args?: object) => Promise<{ data: unknown; error: unknown }> };

async function Concluir({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await getAuthUser();
  if (!user) redirect("/assinar");
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const rpc = supabase as unknown as LooseRpc;

  // Retorno do checkout do Mercado Pago: vincula a assinatura ao cliente logado (o webhook pode chegar antes ou depois).
  let claim: string | null = null;
  if (sp.preapproval_id) {
    const { data } = await rpc.rpc("claim_mp_preapproval", { p_id: sp.preapproval_id });
    claim = (data as { result?: string } | null)?.result ?? null;
  }
  const { data: checkoutUrl } = await rpc.rpc("mp_checkout_url");
  const { data: account } = await supabase.from("my_account").select("*").maybeSingle();
  if (!account) redirect("/assinar");
  if (account.subscription_status === "active") redirect("/conta");

  return (
    <>
      <h1 className={styles.h1}>Cadastro recebido</h1>
      <p className={styles.lead}>
        Obrigado, {account.full_name.split(" ")[0]}! Sua assinatura ({formatBRL(account.plan_price_cents)} a cada 30 dias)
        foi criada e está <strong>aguardando o pagamento</strong>.
      </p>
      {claim === "waiting_confirmation" || claim === "already_linked" ? (
        <p role="status" className={styles.card}>
          Recebemos o seu pagamento no Mercado Pago e estamos aguardando a confirmação. Isso costuma levar
          poucos instantes: <Link href="/assinar/concluir" className={styles.link}>atualizar esta página</Link>.
        </p>
      ) : null}
      {typeof checkoutUrl === "string" && checkoutUrl ? (
        <p className={styles.card}>
          O pagamento é feito no Mercado Pago, em ambiente seguro. Use o mesmo e-mail desta conta ({user.email}) se o
          Mercado Pago pedir um e-mail. Depois de pagar, voltamos para cá e liberamos o seu acesso.
          <br />
          <a href={checkoutUrl} className={styles.button}>
            Pagar a assinatura
          </a>
        </p>
      ) : (
        <p className={styles.card}>
          O pagamento ainda não está disponível. Assim que for liberado, você poderá concluir pela sua conta.
        </p>
      )}
      <Link href="/conta" className={styles.link}>
        Ir para minha conta
      </Link>
    </>
  );
}
