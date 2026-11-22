import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isbn13Checksum, normalizeHeader, normalizeIsbn, parseCsv, parseLibibCsv } from "../../lib/catalog/libib-csv";

const fx = (n: string) => readFileSync(join(__dirname, "fixtures", n), "utf8");

describe("parseCsv", () => {
  it("trata aspas, aspas escapadas, quebra de linha em campo e BOM", () => {
    const t = parseCsv('﻿a,b\r\n"x, y","l1\nl2 ""q"""\r\n');
    expect(t).toEqual([["a", "b"], ["x, y", 'l1\nl2 "q"']]);
  });
  it("detecta ponto e vírgula", () => {
    expect(parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("isbn", () => {
  it("valida checksum e converte ISBN-10", () => {
    expect(isbn13Checksum("9788535911664")).toBe(true);
    expect(normalizeIsbn("85-08-04055-5")).toBe("9788508040551".slice(0, 12) + "1");
    expect(normalizeIsbn("1234567890123")).toBeNull();
    expect(normalizeIsbn("")).toBeNull();
  });
});

describe("parseLibibCsv (fixture)", () => {
  const r = parseLibibCsv(fx("libib-exemplo.csv"));
  const by = (t: string) => r.rows.find((x) => x.title === t)!;

  it("lê livros válidos e ignora não-livros e linhas sem título", () => {
    expect(r.rows.map((x) => x.title)).toEqual([
      "Dom Casmurro", "Capitães da Areia", "Torto Arado", "Quarto de Despejo", "Sem ISBN Aqui", "ISBN Quebrado",
    ]);
    expect(r.skipped).toBe(2);
  });
  it("mapeia campos", () => {
    const d = by("Dom Casmurro");
    expect(d.isbn13).toBe("9788535911664");
    expect(d.libib_ref).toBe("9788535911664");
    expect(d.copies).toBe(2);
    expect(d.published_year).toBe(2016);
    expect(d.genres).toEqual(["Romance", "Clássicos"]);
    expect(d.description).toContain("\n");
    expect(d.publisher).toBe("Companhia das Letras");
  });
  it("usa ISBN-10 quando não há ISBN-13; tags com ;", () => {
    const q = by("Quarto de Despejo");
    expect(q.isbn13).toMatch(/^978\d{10}$/);
    expect(isbn13Checksum(q.isbn13!)).toBe(true);
    expect(q.genres).toEqual(["Memórias", "Biografia"]);
    expect(q.copies).toBe(1);
  });
  it("sem ISBN: ref derivada estável e vários autores", () => {
    const s = by("Sem ISBN Aqui");
    expect(s.isbn13).toBeNull();
    expect(s.libib_ref).toMatch(/^lib:[0-9a-f]{16}$/);
    expect(s.authors).toEqual(["Autora Fictícia", "Outro Autor"]);
    expect(parseLibibCsv(fx("libib-exemplo.csv")).rows[4].libib_ref).toBe(s.libib_ref);
  });
  it("avisa ISBN inválido e copies inválido, sem derrubar a linha", () => {
    const b = by("ISBN Quebrado");
    expect(b.isbn13).toBeNull();
    expect(b.copies).toBe(1);
    expect(r.warnings.join("\n")).toMatch(/ISBN inválido/);
    expect(r.warnings.join("\n")).toMatch(/copies "abc"/);
  });
});

describe("tolerância a cabeçalhos", () => {
  it("aceita nomes em português, maiúsculas e acentos", () => {
    expect(normalizeHeader(" Título ")).toBe("titulo");
    const r = parseLibibCsv("Título;Autores;ISBN;Editora;Ano;Gêneros;Cópias\nO Cortiço;Aluísio Azevedo;9788508040551;Ática;1890;Romance;3");
    expect(r.rows[0]).toMatchObject({ title: "O Cortiço", authors: ["Aluísio Azevedo"], publisher: "Ática", published_year: 1890, genres: ["Romance"], copies: 3 });
  });
  it("sem coluna de título falha com mensagem clara", () => {
    expect(() => parseLibibCsv("a,b\n1,2")).toThrow(/título/);
  });
});
