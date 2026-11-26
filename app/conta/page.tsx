import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
  createSupabaseServerClient,
  getAuthUser,
} from "@/lib/auth/supabase-server";
import { getPaymentInfo } from "@/lib/assinatura/server";
import { ContaView } from "./conta-view";

export const metadata: Metadata = { title: "Minha conta" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default function ContaPage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense
      fallback={
        <>
          <h1 className="h page-title">Minha conta</h1>
          <p role="status">Carregando sua conta…</p>
        </>
      }
    >
      <Conta searchParams={searchParams} />
    </Suspense>
  );
}

async function Conta({ searchParams }: { searchParams: SP }) {
  if (!(await getAuthUser())) redirect("/entrar?next=/conta");
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: a, error } = await supabase
    .from("my_account")
    .select("*")
    .maybeSingle();
  if (error) {
    return (
      <>
        <h1 className="h page-title">Minha conta</h1>
        <p role="alert" className="alert">
          Não foi possível carregar sua conta agora. Tente novamente em
          instantes.
        </p>
      </>
    );
  }
  if (!a) redirect("/assinar");

  // Sempre busca: mesmo ativa, a assinatura pode ter "cancelamento solicitado".
  const pay = await getPaymentInfo(supabase);
  return <ContaView a={a} pay={pay} justActivated={sp.ativada === "1" && a.subscription_status === "active"} />;
}
