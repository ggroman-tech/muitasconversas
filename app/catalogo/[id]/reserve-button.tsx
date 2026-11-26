"use client";

import { useFormStatus } from "react-dom";

/** Botão de envio com estado "enviando": evita clique duplo e dá retorno imediato. */
export function ReserveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Enviando…" : label}
    </button>
  );
}
