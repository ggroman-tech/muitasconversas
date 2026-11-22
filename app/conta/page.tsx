import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
  createSupabaseServerClient,
  getAuthUser,
} from "@/lib/auth/supabase-server";
import { ContaView } from "./conta-view";

export const metadata: Metadata = { title: "Minha conta — Muitas Conversas" };

export default function ContaPage() {
  return (
    <Suspense
      fallback={
        <>
          <h1 className="h page-title">Minha conta</h1>
          <p role="status">Carregando sua conta…</p>
        </>
      }
    >
      <Conta />
    </Suspense>
  );
}

async function Conta() {
  if (!(await getAuthUser())) redirect("/entrar?next=/conta");
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

  return <ContaView a={a} />;
}
