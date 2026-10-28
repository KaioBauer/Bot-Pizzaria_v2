import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BASE_SALGADA, CAMADAS_BASE, ehDoce, miniaturaDoSabor, visuaisDaDescricao, visuaisDoSabor, visualDoNome, VISUAIS } from "./biblioteca";

const chaves = (d: string) => visuaisDaDescricao(d).map((v) => v.chave);

describe("biblioteca de camadas", () => {
  it("lê a descrição dos sabores na ordem de camadas (cobertura, pedaços, salpicado)", () => {
    expect(chaves("Mussarela, bacon, milho e orégano")).toEqual(["mussarela", "bacon", "milho", "oregano"]);
    expect(chaves("Molho de tomate, queijo fior di latte, tomate cereja, manjericão e orégano")).toEqual([
      "mussarela",
      "tomate-cereja",
      "manjericao",
      "oregano",
    ]);
  });

  it("separa chocolate branco e preto", () => {
    expect(chaves("Mussarela, leite condensado, chocolate branco e chocolate preto")).toEqual([
      "mussarela",
      "chocolate-branco",
      "chocolate-preto",
      "leite-condensado",
    ]);
  });

  it("ignora o que não conhece e descrições vazias", () => {
    expect(chaves("350ml")).toEqual([]);
    expect(visuaisDaDescricao(null)).toEqual([]);
  });

  it("acha o visual pelo nome do ingrediente cadastrado", () => {
    expect(visualDoNome("Calabresa")?.chave).toBe("calabresa");
    expect(visualDoNome("Pimentão")?.chave).toBe("pimentao");
  });

  it("muçarela extra tem camada própria (senão não aparece sobre a da base)", () => {
    expect(visualDoNome("Muçarela extra")?.chave).toBe("mussarela-extra");
    expect(visualDoNome("Muçarela extra")?.assadaUrl).toMatch(/gratinada/);
  });

  it("sabor não repete a muçarela (salgada já tem na base; doce não leva)", () => {
    expect(visuaisDoSabor("Mussarela, calabresa e orégano", "Calabresa").map((v) => v.chave)).toEqual(["calabresa", "oregano"]);
    expect(visuaisDoSabor("Mussarela, leite condensado e chocolate preto", "Brigadeiro").map((v) => v.chave)).toEqual([
      "chocolate-preto",
      "leite-condensado",
    ]);
  });

  it("base salgada = molho + muçarela, por baixo de tudo", () => {
    expect(BASE_SALGADA.map((v) => v.chave)).toEqual(["base-molho", "base-queijo"]);
    expect(BASE_SALGADA.every((v) => v.ordem < 0)).toBe(true);
  });

  it("reconhece doce pela categoria", () => {
    expect(ehDoce("Doces")).toBe(true);
    expect(ehDoce("Pizzas Doces")).toBe(true);
    expect(ehDoce("Salgadas")).toBe(false);
  });

  it("miniatura do sabor é o recheio principal", () => {
    expect(miniaturaDoSabor("Mussarela, calabresa, cebola e orégano", "Calabresa")).toMatch(/calabresa\.webp$/);
    expect(miniaturaDoSabor("Mussarela e orégano", "Mussarela")).toMatch(/mussarela\.webp$/);
  });

  it("todas as imagens existem em public/", () => {
    const publico = join(__dirname, "..", "..", "public");
    const urls = [...Object.values(CAMADAS_BASE), ...Object.values(VISUAIS).flatMap((v) => [v.url, v.assadaUrl ?? v.url])];
    for (const u of urls) expect(existsSync(join(publico, u)), u).toBe(true);
  });
});
