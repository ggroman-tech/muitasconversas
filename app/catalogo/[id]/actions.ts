"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { catalogClient } from "@/lib/catalog/server";
import { reserveErrorMessage } from "@/lib/catalog/types";

export async function reservar(bookId: string) {
  const sb = await catalogClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(`/catalogo/${bookId}`)}`);

  const { error } = await sb.rpc("reserve_book", { p_book_id: bookId });
  if (error) redirect(`/catalogo/${bookId}?erro=${encodeURIComponent(reserveErrorMessage(error))}`);
  revalidatePath(`/catalogo/${bookId}`);
  revalidatePath("/catalogo");
  redirect(`/catalogo/${bookId}?ok=1`);
}
