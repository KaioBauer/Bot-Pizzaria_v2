import type { ConfiguracaoLoja, TurnoFuncionamento } from "@pizzaria/shared";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
const DIA_POR_SIGLA: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export interface MomentoLocal {
  diaSemana: number;
  minutos: number;
  /** "dd/mm/aaaa HH:MM" no fuso da loja */
  texto: string;
}

export function momentoLocal(agora: Date, fusoHorario: string): MomentoLocal {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: fusoHorario,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(agora)
      .map((parte) => [parte.type, parte.value])
  );
  const hora = Number(partes.hour);
  const minuto = Number(partes.minute);
  return {
    diaSemana: DIA_POR_SIGLA[partes.weekday ?? ""] ?? 0,
    minutos: hora * 60 + minuto,
    texto: `${partes.day}/${partes.month}/${partes.year} ${partes.hour}:${partes.minute}`,
  };
}

function paraMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** O turno cobre esse momento? Turnos com `fecha <= abre` viram a meia-noite. */
export function turnoCobre(turno: TurnoFuncionamento, momento: MomentoLocal): boolean {
  const abre = paraMinutos(turno.abre);
  const fecha = paraMinutos(turno.fecha);
  if (fecha > abre) {
    return momento.diaSemana === turno.diaSemana && momento.minutos >= abre && momento.minutos < fecha;
  }
  const diaSeguinte = (turno.diaSemana + 1) % 7;
  return (
    (momento.diaSemana === turno.diaSemana && momento.minutos >= abre) ||
    (momento.diaSemana === diaSeguinte && momento.minutos < fecha)
  );
}

export type SituacaoLoja =
  | { aberta: true }
  | { aberta: false; motivo: "pausada" | "fora_do_horario" };

export function situacaoLoja(config: ConfiguracaoLoja, agora: Date): SituacaoLoja {
  if (!config.aceitandoPedidos) return { aberta: false, motivo: "pausada" };
  const momento = momentoLocal(agora, config.fusoHorario);
  return config.horarios.some((turno) => turnoCobre(turno, momento))
    ? { aberta: true }
    : { aberta: false, motivo: "fora_do_horario" };
}

/** "Seg a Dom: 18:00–23:00" etc., uma linha por dia com turno. */
export function descreverHorarios(horarios: TurnoFuncionamento[]): string {
  const linhas = DIAS.map((dia, indice) => {
    const turnos = horarios
      .filter((t) => t.diaSemana === indice)
      .sort((a, b) => a.abre.localeCompare(b.abre))
      .map((t) => (t.abre === "00:00" && t.fecha === "23:59" ? "24h" : `${t.abre}–${t.fecha}`));
    return `${dia}: ${turnos.length ? turnos.join(", ") : "fechado"}`;
  });
  return linhas.join("\n");
}

const DIAS_EXTENSO = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"] as const;

/**
 * Próxima abertura a partir de agora: "hoje às 18:00", "amanhã às 18:00",
 * "sexta às 18:00". null se não houver nenhum turno cadastrado.
 */
export function proximaAbertura(horarios: TurnoFuncionamento[], agora: Date, fusoHorario: string): string | null {
  if (horarios.length === 0) return null;
  const momento = momentoLocal(agora, fusoHorario);
  for (let deslocamento = 0; deslocamento <= 7; deslocamento++) {
    const dia = (momento.diaSemana + deslocamento) % 7;
    const candidatos = horarios
      .filter((t) => t.diaSemana === dia && (deslocamento > 0 || paraMinutos(t.abre) > momento.minutos))
      .sort((a, b) => a.abre.localeCompare(b.abre));
    const turno = candidatos[0];
    if (!turno) continue;
    const quando = deslocamento === 0 ? "hoje" : deslocamento === 1 ? "amanhã" : DIAS_EXTENSO[dia];
    return `${quando} às ${turno.abre}`;
  }
  return null;
}
