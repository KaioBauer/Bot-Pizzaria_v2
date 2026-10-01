import { z } from "zod";

/**
 * Schemas dos argumentos das tools do agente. Os nomes de campo ficam em
 * snake_case porque são o contrato visto pelo LLM. Valores monetários NÃO
 * fazem parte do contrato: preço é sempre recalculado no servidor.
 */

const id = z.string().uuid({ message: "ID inválido" });

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const itemPedidoSchema = z.object({
  sabores: z
    .array(
      z.object({
        produto_id: id.describe("produto_id do sabor, copiado do cardápio"),
        variacao_id: id.describe(
          "variacao_id do tamanho (tipo 'tamanho') ou da variação única (tipo 'padrao') desse produto"
        ),
      })
    )
    .min(1, "Cada item precisa de pelo menos um sabor")
    .max(2, "No máximo 2 sabores por pizza (meio a meio)")
    .describe("1 sabor; ou 2 sabores para pizza meio a meio, no mesmo tamanho"),
  adicionais: z
    .array(id)
    .max(5)
    .default([])
    .describe("variacao_id de borda/adicionais (tipo 'borda' ou 'adicional') de um dos sabores"),
  quantidade: z.number().int().min(1).max(50),
  observacao: textoOpcional(200).describe("ex.: 'sem cebola'"),
});

export const enderecoSchema = z.object({
  rua: z.string().trim().min(2).max(120),
  numero: z.string().trim().min(1).max(20),
  bairro_id: id.describe("id de um dos bairros atendidos"),
  complemento: textoOpcional(80),
  referencia: textoOpcional(120),
});

export const calcularPedidoArgsSchema = z.object({
  itens: z.array(itemPedidoSchema).min(1).max(30),
  tipo_entrega: z.enum(["entrega", "retirada"]),
  bairro_id: id.nullish().describe("obrigatório quando tipo_entrega = 'entrega'"),
});

const telefoneSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .pipe(
    z
      .string()
      .min(10, "Telefone precisa ter DDD + número")
      .max(13, "Telefone inválido")
  );

export const finalizarPedidoArgsSchema = z
  .object({
    itens: z.array(itemPedidoSchema).min(1).max(30),
    tipo_entrega: z.enum(["entrega", "retirada"]),
    endereco: enderecoSchema.nullish().describe("obrigatório quando tipo_entrega = 'entrega'"),
    forma_pagamento: z.enum(["pix", "dinheiro", "cartao"]),
    troco_para: z
      .number()
      .positive()
      .nullish()
      .describe("valor em reais da nota que o cliente vai usar, só se pagar em dinheiro e precisar de troco"),
    cliente_nome: z.string().trim().min(2).max(80),
    cliente_telefone: telefoneSchema.describe("com DDD, ex.: 11987654321"),
    observacoes: textoOpcional(300).describe("observação geral do pedido"),
  })
  .superRefine((pedido, ctx) => {
    if (pedido.tipo_entrega === "entrega" && !pedido.endereco) {
      ctx.addIssue({
        code: "custom",
        path: ["endereco"],
        message: "Endereço é obrigatório para entrega",
      });
    }
    if (pedido.troco_para != null && pedido.forma_pagamento !== "dinheiro") {
      ctx.addIssue({
        code: "custom",
        path: ["troco_para"],
        message: "Troco só se aplica a pagamento em dinheiro",
      });
    }
  });

export type ItemPedidoArgs = z.output<typeof itemPedidoSchema>;
export type EnderecoArgs = z.output<typeof enderecoSchema>;
export type CalcularPedidoArgs = z.output<typeof calcularPedidoArgsSchema>;
export type FinalizarPedidoArgs = z.output<typeof finalizarPedidoArgsSchema>;

/** Erros do Zod num texto curto que o LLM consegue usar para corrigir. */
export function descreverErrosZod(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(raiz)"}: ${issue.message}`)
    .join("; ");
}
