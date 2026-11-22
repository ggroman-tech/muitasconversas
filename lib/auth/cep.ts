/** Só dígitos do CEP; null se não tiver 8 dígitos. (Espelha normalize_cep no SQL.) */
export function normalizeCep(input: string): string | null {
  const digits = (input ?? "").replace(/\D/g, "");
  return digits.length === 8 ? digits : null;
}

export function formatCep(input: string): string {
  const d = (input ?? "").replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}
