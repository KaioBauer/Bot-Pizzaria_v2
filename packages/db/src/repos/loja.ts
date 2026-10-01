import { paraCentavos, type LojaRepo } from "@pizzaria/shared";
import { exigir, type Db } from "../client";

export function criarLojaRepo(db: Db): LojaRepo {
  return {
    async configuracao() {
      const [config, horarios, bairros] = await Promise.all([
        db.from("configuracoes").select("*").single(),
        db.from("horarios_funcionamento").select("dia_semana, abre, fecha"),
        db.from("bairros_entrega").select("id, nome, taxa").eq("ativo", true).order("nome"),
      ]);
      const c = exigir(config, "Erro ao carregar configurações");

      return {
        nomePizzaria: c.nome_pizzaria,
        telefone: c.telefone,
        endereco: c.endereco,
        fusoHorario: c.fuso_horario,
        pedidoMinimoCentavos: paraCentavos(c.pedido_minimo),
        aceitandoPedidos: c.aceitando_pedidos,
        pixExpiracaoMinutos: c.pix_expiracao_minutos,
        horarios: exigir(horarios, "Erro ao carregar horários").map((h) => ({
          diaSemana: h.dia_semana,
          abre: h.abre.slice(0, 5),
          fecha: h.fecha.slice(0, 5),
        })),
        bairros: exigir(bairros, "Erro ao carregar bairros").map((b) => ({
          id: b.id,
          nome: b.nome,
          taxaCentavos: paraCentavos(b.taxa),
        })),
      };
    },
  };
}
