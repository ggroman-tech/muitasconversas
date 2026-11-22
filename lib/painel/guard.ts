import "server-only";
import { redirect } from "next/navigation";
import { canManage, getStaff } from "./db";

/** Páginas só de admin/ops: driver volta para a rota de sábado; não-staff para /conta. */
export async function requireManager() {
  const staff = await getStaff();
  if (!staff) redirect("/conta");
  if (!canManage(staff.role)) redirect("/painel");
  return staff;
}
