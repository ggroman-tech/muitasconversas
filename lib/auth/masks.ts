/** Máscara de telefone do Brasil: "(21) 99999-0000". Números com mais de 11 dígitos (ex.: com 55) ficam sem máscara. */
export function formatPhoneBr(input: string): string {
  const d = (input ?? "").replace(/\D/g, "");
  if (d.length > 11) return input;
  if (d.length <= 2) return d.length ? `(${d}` : "";
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  const cut = d.length === 11 ? 5 : 4;
  return `(${ddd}) ${rest.slice(0, cut)}-${rest.slice(cut)}`;
}

/** Telefone guardado só com dígitos -> texto de exibição: "(12) 99217-5687"; com 55 na frente: "+55 (12) 99217-5687". */
export function formatPhoneDisplay(input: string | null | undefined): string {
  const d = (input ?? "").replace(/\D/g, "");
  if (!d) return "";
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return `+55 ${formatPhoneBr(d.slice(2))}`;
  const f = formatPhoneBr(d);
  return f || (input ?? "");
}
