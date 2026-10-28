import { describe, expect, it } from "vitest";
import { escalaDoTamanho, espalhar, recorteDoSetor, setorDaFatia } from "./geometria";

describe("geometria da montagem", () => {
  it("espalhar é determinístico pela semente", () => {
    expect(espalhar("bacon", 8)).toEqual(espalhar("bacon", 8));
    expect(espalhar("bacon", 8)).not.toEqual(espalhar("milho", 8));
  });

  it("pedaços ficam dentro da pizza e do setor", () => {
    const setor = setorDaFatia(1, 4); // 90°–180°: quadrante inferior direito
    for (const p of espalhar("calabresa", 10, setor)) {
      expect(Math.hypot(p.x - 50, p.y - 50)).toBeLessThanOrEqual(38.01);
      expect(p.x).toBeGreaterThanOrEqual(50);
      expect(p.y).toBeGreaterThanOrEqual(50);
    }
  });

  it("gera a quantidade pedida", () => {
    expect(espalhar("x", 12)).toHaveLength(12);
  });

  it("pizza inteira não tem recorte; fatia tem polígono a partir do centro", () => {
    expect(recorteDoSetor(setorDaFatia(0, 1))).toBeUndefined();
    expect(recorteDoSetor(setorDaFatia(0, 2))).toMatch(/^polygon\(50\.00% 50\.00%, /);
  });

  it("escala cresce com o tamanho", () => {
    expect(escalaDoTamanho(0, 4)).toBeCloseTo(0.74);
    expect(escalaDoTamanho(3, 4)).toBe(1);
    expect(escalaDoTamanho(0, 1)).toBe(1);
  });
});
