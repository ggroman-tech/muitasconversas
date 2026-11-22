import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getAuthUser } from "@/lib/auth/supabase-server";
import { getScheduleOptions } from "@/lib/schedule/server";
import { AgendarView } from "./agendar-view";
import styles from "./agendar.module.css";

export const metadata: Metadata = {
  title: "Agendar troca ou devolução — Muitas Conversas",
};

export default function AgendarPage() {
  return (
    <div className={styles.page}>
      <Link href="/conta" className={styles.back}>
        Voltar para Minha conta
      </Link>
      <div className={styles.intro}>
        <h1 className="h page-title">Agendar troca ou devolução</h1>
        <p className={styles.lead}>
          Entregas e coletas acontecem aos sábados, das 09h às 14h. Os pedidos
          fecham às 08h do sábado.
        </p>
      </div>
      <Suspense fallback={<p role="status">Carregando…</p>}>
        <Agendar />
      </Suspense>
    </div>
  );
}

async function Agendar() {
  if (!(await getAuthUser())) redirect("/entrar?next=/agendar");
  const { data: o, error } = await getScheduleOptions();
  if (error || !o) {
    return (
      <p role="alert" className="alert">
        Não foi possível carregar o agendamento agora. Tente novamente em
        instantes.
      </p>
    );
  }
  return <AgendarView o={o} />;
}
