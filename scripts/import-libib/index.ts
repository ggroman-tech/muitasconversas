/**
 * Importa um CSV exportado do Libib para o catálogo.
 *
 *   npx tsx scripts/import-libib/index.ts <caminho.csv> [--dry-run]
 *
 * Env: SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY.
 * Libib é só fonte: este script nunca escreve de volta nem apaga exemplares.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { parseLibibCsv } from "../../lib/catalog/libib-csv";

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry-run");
  const path = args.find((a) => !a.startsWith("--"));
  if (!path) {
    console.error("Uso: tsx scripts/import-libib/index.ts <arquivo.csv> [--dry-run]");
    process.exit(2);
  }

  const { rows, warnings, skipped, unmappedHeaders } = parseLibibCsv(readFileSync(path, "utf8"));
  console.log(`Linhas válidas: ${rows.length} | ignoradas: ${skipped} | exemplares: ${rows.reduce((s, r) => s + r.copies, 0)}`);
  if (unmappedHeaders.length) console.log(`Colunas não mapeadas (guardadas só em raw): ${unmappedHeaders.join(", ")}`);
  warnings.forEach((w) => console.warn("aviso:", w));
  if (rows.length === 0) throw new Error("Nenhuma linha válida; abortando para não retirar o acervo.");
  if (dry) return;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const batch_id = randomUUID();
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, batch_id }));
    const { error } = await sb.from("catalog_staging").insert(chunk);
    if (error) throw new Error(`Falha ao gravar staging: ${error.message}`);
  }
  const { data, error } = await sb.rpc("import_catalog", { p_batch_id: batch_id });
  if (error) throw new Error(`import_catalog falhou: ${error.message}`);
  console.log("Importação concluída:", JSON.stringify(data));
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
