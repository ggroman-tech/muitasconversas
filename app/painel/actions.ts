"use server";

import { revalidatePath } from "next/cache";
import { canManage, getStaff, painelClient } from "@/lib/painel/db";
import { isCondition, painelErrorMessage, UUID_RE } from "@/lib/painel/errors";
import type { ActionState } from "@/lib/painel/types";

const err = (message: string): ActionState => ({ status: "error", message });

function field(fd: FormData, name: string) {
  return String(fd.get(name) ?? "").trim();
}

/** Confirmar entrega: admin, ops e driver. */
export async function confirmDeliveryAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await getStaff();
  if (!staff) return err("Sem permissão. Entre com uma conta da equipe.");
  const visitId = field(fd, "visit_id");
  if (!UUID_RE.test(visitId)) return err("Visita inválida.");
  const supabase = await painelClient();
  const { error } = await supabase.rpc("confirm_delivery", { p_visit_id: visitId });
  if (error) return err(painelErrorMessage(error));
  revalidatePath("/painel");
  return { status: "ok", message: "Entrega confirmada." };
}

/** Registrar devolução: admin/ops. */
export async function registerReturnAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await getStaff();
  if (!staff || !canManage(staff.role)) return err("Sem permissão para registrar devoluções.");
  const loanId = field(fd, "loan_id");
  const condition = field(fd, "condition");
  if (!UUID_RE.test(loanId)) return err("Empréstimo inválido.");
  if (!isCondition(condition)) return err("Escolha a condição do livro: bom, regular ou danificado.");
  const supabase = await painelClient();
  const { error } = await supabase.rpc("register_return", { p_loan_id: loanId, p_condition: condition });
  if (error) return err(painelErrorMessage(error));
  revalidatePath("/painel");
  revalidatePath("/painel/atrasos");
  return { status: "ok", message: "Devolução registrada." };
}

/** Marcar visita como falha (motivo obrigatório): admin/ops. */
export async function markVisitFailedAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await getStaff();
  if (!staff || !canManage(staff.role)) return err("Sem permissão para marcar falha de entrega.");
  const visitId = field(fd, "visit_id");
  const reason = field(fd, "reason").slice(0, 500);
  if (!UUID_RE.test(visitId)) return err("Visita inválida.");
  if (!reason) return err("Informe o motivo da falha (ex.: ninguém em casa).");
  const supabase = await painelClient();
  const { error } = await supabase.rpc("mark_visit_failed", { p_visit_id: visitId, p_reason: reason });
  if (error) return err(painelErrorMessage(error));
  revalidatePath("/painel");
  return { status: "ok", message: "Visita marcada como falha." };
}

/** Cancelar visita: admin/ops (podem cancelar mesmo depois do prazo do cliente). */
export async function cancelVisitAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await getStaff();
  if (!staff || !canManage(staff.role)) return err("Sem permissão para cancelar visitas.");
  const visitId = field(fd, "visit_id");
  const reason = field(fd, "reason").slice(0, 500);
  if (!UUID_RE.test(visitId)) return err("Visita inválida.");
  const supabase = await painelClient();
  const { error } = await supabase.rpc("cancel_visit", { p_visit_id: visitId, p_reason: reason || null });
  if (error) return err(painelErrorMessage(error));
  revalidatePath("/painel");
  revalidatePath("/painel/sabados");
  return { status: "ok", message: "Visita cancelada." };
}

/** Gerar sábados: admin/ops. */
export async function generateSaturdaysAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await getStaff();
  if (!staff || !canManage(staff.role)) return err("Sem permissão para gerar sábados.");
  const raw = field(fd, "weeks");
  const weeks = Number(raw);
  if (!/^\d+$/.test(raw) || weeks < 1 || weeks > 26) return err("Informe um número de semanas entre 1 e 26.");
  const supabase = await painelClient();
  const { data, error } = await supabase.rpc("generate_delivery_days", { p_weeks: weeks });
  if (error) return err(painelErrorMessage(error));
  revalidatePath("/painel/sabados");
  const d = (data ?? {}) as { days_created?: number; windows_created?: number };
  const days = d.days_created ?? 0;
  const wins = d.windows_created ?? 0;
  return {
    status: "ok",
    message:
      days === 0 && wins === 0
        ? "Nada a criar: os próximos sábados já existem."
        : `${days} ${days === 1 ? "sábado criado" : "sábados criados"} e ${wins} ${wins === 1 ? "janela criada" : "janelas criadas"}.`,
  };
}

/** Vincular manualmente uma assinatura do Mercado Pago a um cliente: admin/ops. */
export async function linkMpPreapprovalAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await getStaff();
  if (!staff || !canManage(staff.role)) return err("Sem permissão para vincular assinaturas.");
  const preId = field(fd, "preapproval_id");
  const customerId = field(fd, "customer_id");
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(preId)) return err("Assinatura do Mercado Pago inválida.");
  if (!UUID_RE.test(customerId)) return err("Escolha o cliente.");
  const supabase = await painelClient();
  const { data, error } = await supabase.rpc("staff_link_mp_preapproval", { p_preapproval_id: preId, p_customer_id: customerId });
  if (error) return err(painelErrorMessage(error));
  const result = (data as { result?: string } | null)?.result;
  if (result && result !== "ok") {
    const m: Record<string, string> = {
      already_linked: "Essa assinatura já está vinculada a um cliente.",
      no_subscription: "Esse cliente não tem assinatura em aberto.",
      customer_already_linked: "Esse cliente já tem uma assinatura do Mercado Pago vinculada.",
      unknown_preapproval: "Assinatura do Mercado Pago não encontrada.",
    };
    return err(m[result] ?? "Não foi possível vincular.");
  }
  revalidatePath("/painel/assinaturas");
  return { status: "ok", message: "Assinatura vinculada." };
}
