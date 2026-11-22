import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { formatBRL } from "@/lib/auth/format";
import { createSupabaseServerClient, getAuthUser } from "@/lib/auth/supabase-server";
import styles from "@/lib/auth/ui.module.css";

export const metadata: Metadata = { title: "Cadastro recebido — Muitas Conversas" };

export default function ConcluirPage() {
  return (
    <Suspense fallback={<p role="status">Carregando…</p>}>
      <Concluir />
    </Suspense>
  );
}

async function Concluir() {
  if (!(await getAuthUser())) redirect("/assinar");
  const supabase = await createSupabaseServerClient();
  const { data: account } = await supabase.from("my_account").select("*").maybeSingle();
  if (!account) redirect("/assinar");
  if (account.subscription_status === "active") redirect("/conta");

  return (
    <>
      <h1 className={styles.h1}>Cadastro recebido</h1>
      <p className={styles.lead}>
        Obrigado, {account.full_name.split(" ")[0]}! Sua assinatura ({formatBRL(account.plan_price_cents)} por mês)
        foi criada e está <strong>aguardando o pagamento</strong>.
      </p>
      {/* PONTO DE EXTENSÃO (frente D): exibir aqui o Pix / link de pagamento
          gerado por startBilling() em lib/auth/billing.ts. */}
      <p className={styles.card}>
        O pagamento ainda não está disponível nesta etapa. Assim que for liberado, você poderá concluir pela sua
        conta.
      </p>
      <Link href="/conta" className={styles.link}>
        Ir para minha conta
      </Link>
    </>
  );
}
