/** Corta o texto em fim de frase (até `max` caracteres). Devolve também se houve corte. */
export function truncateAtSentence(text: string, max = 600): { head: string; truncated: boolean } {
  const t = text.trim();
  if (t.length <= max) return { head: t, truncated: false };
  const window = t.slice(0, max);
  const m = [...window.matchAll(/[.!?…](?=\s|$)["”')\]]*/g)];
  const last = m.at(-1);
  // só aceita o corte em fim de frase se aproveitar boa parte do trecho; senão corta na última palavra
  if (last && last.index !== undefined && last.index + last[0].length >= max * 0.5) {
    return { head: window.slice(0, last.index + last[0].length).trim(), truncated: true };
  }
  const sp = window.lastIndexOf(" ");
  return { head: `${window.slice(0, sp > 0 ? sp : max).trim()}…`, truncated: true };
}

/** "12992175687" -> "(12) 99217-5687"; devolve o original se não reconhecer. */
export function formatPhoneBR(raw: string | null | undefined): string {
  if (!raw) return "";
  let d = raw.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}
