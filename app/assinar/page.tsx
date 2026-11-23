import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/lib/auth/login-form";
import { createSupabaseServerClient, getAuthUser } from "@/lib/auth/supabase-server";
import styles from "@/lib/auth/ui.module.css";
import { SignupForm } from "./signup-form";
import { PLAN_PRICE_FULL } from "@/lib/plan";

export const metadata: Metadata = { title: "Assinar — Muitas Conversas" };

export default function AssinarPage() {
  return (
    <div className={styles.signup}>
      <div className={styles.signupMain}>
        <h1 className={styles.h1}>Assine e comece a ler</h1>
        <Suspense fallback={<p role="status">Carregando…</p>}>
          <Etapa />
        </Suspense>
      </div>
      <aside className={styles.summary} aria-labelledby="resumo-titulo">
        <h2 id="resumo-titulo" className={styles.h2}>Resumo</h2>
        <div className={styles.sumRow}>
          <span>Assinatura de 30 dias</span>
          <strong>{PLAN_PRICE_FULL}</strong>
        </div>
        <div className={styles.sumRow}>
          <span>Frete</span>
          <strong>Incluso</strong>
        </div>
        <hr className={styles.sumRule} />
        <ul className={styles.list}>
          <li>1 livro por vez, por até 28 dias corridos ou troca aos sábados</li>
          <li>Trocas aos sábados, das 09h às 14h</li>
          <li>Pedidos e cancelamentos até sexta-feira, às 08h</li>
          <li>Lembretes por e-mail 7, 3 e 1 dia antes da devolução</li>
          <li>Pagamento por cartão de crédito</li>
          <li>Encontros cobrados à parte</li>
        </ul>
        <span className={styles.sumNote}>
          Veja todas as <Link href="/regras" className={styles.link}>regras do serviço</Link>.
        </span>
      </aside>
    </div>
  );
}

async function Etapa() {
  const user = await getAuthUser();

  if (!user) {
    return (
      <>
        <p className={styles.lead}>
          Passo 1 de 2: confirme seu e-mail. Enviamos um link de acesso, sem senha.
        </p>
        <div className={styles.card}>
          <LoginForm next="/assinar" submitLabel="Confirmar e-mail" />
        </div>
        <p className={styles.muted}>
          Já é assinante?{" "}
          <Link href="/entrar" className={styles.link}>
            Entrar
          </Link>
        </p>
      </>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: account } = await supabase.from("my_account").select("customer_id").maybeSingle();
  if (account) redirect("/conta");

  const { data: config } = await supabase.rpc("signup_config");
  if (!config) {
    return (
      <p role="alert" className={styles.errorBox}>
        Não foi possível carregar o cadastro agora. Tente novamente em instantes.
      </p>
    );
  }

  return (
    <>
      <p className={styles.lead}>Passo 2 de 2: seus dados e endereço de entrega.</p>
      <SignupForm email={user.email ?? ""} config={config} />
    </>
  );
}
