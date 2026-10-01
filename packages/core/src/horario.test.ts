import { describe, expect, it } from "vitest";
import { descreverHorarios, momentoLocal, proximaAbertura, situacaoLoja } from "./horario";
import { configDeTeste } from "./testes/fixtures";

// 2026-10-02 é sexta-feira. São Paulo = UTC-3 (sem horário de verão).
const emSaoPaulo = (dataHora: string) => new Date(`${dataHora}-03:00`);

describe("momentoLocal", () => {
  it("converte para o fuso da loja", () => {
    const m = momentoLocal(new Date("2026-10-03T01:30:00Z"), "America/Sao_Paulo");
    expect(m).toEqual({ diaSemana: 5, minutos: 22 * 60 + 30, texto: "02/10/2026 22:30" });
  });
});

describe("situacaoLoja", () => {
  const config = configDeTeste({ horarios: [{ diaSemana: 5, abre: "18:00", fecha: "23:00" }] });

  it.each([
    ["2026-10-02T17:59", false],
    ["2026-10-02T18:00", true],
    ["2026-10-02T22:59", true],
    ["2026-10-02T23:00", false],
    ["2026-10-03T19:00", false], // sábado sem turno
  ])("%s -> aberta=%s", (instante, aberta) => {
    expect(situacaoLoja(config, emSaoPaulo(instante)).aberta).toBe(aberta);
  });

  it("turno que passa da meia-noite vale até o horário de fechar do dia seguinte", () => {
    const madrugada = configDeTeste({ horarios: [{ diaSemana: 5, abre: "18:00", fecha: "01:00" }] });
    expect(situacaoLoja(madrugada, emSaoPaulo("2026-10-02T23:30")).aberta).toBe(true);
    expect(situacaoLoja(madrugada, emSaoPaulo("2026-10-03T00:59")).aberta).toBe(true);
    expect(situacaoLoja(madrugada, emSaoPaulo("2026-10-03T01:00")).aberta).toBe(false);
    expect(situacaoLoja(madrugada, emSaoPaulo("2026-10-02T00:30")).aberta).toBe(false); // madrugada de sexta é turno de quinta
  });

  it("pausa manual fecha mesmo dentro do horário", () => {
    const pausada = { ...config, aceitandoPedidos: false };
    expect(situacaoLoja(pausada, emSaoPaulo("2026-10-02T20:00"))).toEqual({ aberta: false, motivo: "pausada" });
  });

  it("informa o motivo fora do horário", () => {
    expect(situacaoLoja(config, emSaoPaulo("2026-10-02T10:00"))).toEqual({ aberta: false, motivo: "fora_do_horario" });
  });
});

describe("descreverHorarios", () => {
  it("lista todos os dias, com fechado e 24h", () => {
    const texto = descreverHorarios([
      { diaSemana: 1, abre: "18:00", fecha: "23:00" },
      { diaSemana: 1, abre: "11:00", fecha: "14:00" },
      { diaSemana: 2, abre: "00:00", fecha: "23:59" },
    ]);
    expect(texto.split("\n")).toEqual([
      "Dom: fechado",
      "Seg: 11:00–14:00, 18:00–23:00",
      "Ter: 24h",
      "Qua: fechado",
      "Qui: fechado",
      "Sex: fechado",
      "Sáb: fechado",
    ]);
  });
});

describe("proximaAbertura", () => {
  const turnos = [
    { diaSemana: 5, abre: "18:00", fecha: "23:00" }, // sexta
    { diaSemana: 0, abre: "11:00", fecha: "15:00" }, // domingo
  ];
  it.each([
    ["2026-10-02T10:00", "hoje às 18:00"], // sexta de manhã
    ["2026-10-02T23:30", "domingo às 11:00"], // sexta à noite
    ["2026-10-03T12:00", "amanhã às 11:00"], // sábado
    ["2026-10-04T16:00", "sexta às 18:00"], // domingo depois de fechar
  ])("%s -> %s", (instante, esperado) => {
    expect(proximaAbertura(turnos, emSaoPaulo(instante), "America/Sao_Paulo")).toBe(esperado);
  });

  it("sem turnos devolve null", () => {
    expect(proximaAbertura([], new Date(), "America/Sao_Paulo")).toBeNull();
  });
});
