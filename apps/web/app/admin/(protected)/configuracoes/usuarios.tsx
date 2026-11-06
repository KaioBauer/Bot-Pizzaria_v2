"use client";

import { Bike, Check, Copy, KeyRound, Loader2, Printer, ShieldCheck, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import type { EntregadorPainel } from "@pizzaria/db";
import { formatarTelefone } from "@pizzaria/shared";
import { Aviso, Botao, Campo, Cartao, cn, estiloEntrada, Selo } from "../../../../components/ui";
import {
  criarUsuarioAction,
  definirAcessoUsuarioAction,
  listarUsuariosAction,
  trocarSenhaUsuarioAction,
  type UsuarioPainel,
} from "./usuarios-actions";

const PAPEL = {
  admin: { rotulo: "Administrador", Icone: ShieldCheck, tom: "violeta" },
  entregador: { rotulo: "Motoboy", Icone: Bike, tom: "info" },
  impressora: { rotulo: "Impressora", Icone: Printer, tom: "neutro" },
} as const;

const quando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "nunca entrou";

type SenhaMostrada = { nome: string; email: string; senha: string; papel: UsuarioPainel["papel"] };

/**
 * Usuários e acessos: administradores (painel) e motoboys (/entrega). Criar,
 * gerar nova senha e desativar/reativar — desativar não apaga (histórico de
 * entregas fica). A senha aparece uma vez só, para passar à pessoa.
 */
export function SecaoUsuarios({ meuId, entregadores }: { meuId: string; entregadores: EntregadorPainel[] }) {
  const [usuarios, setUsuarios] = useState<UsuarioPainel[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [adicionando, setAdicionando] = useState(false);
  const [senhaMostrada, setSenhaMostrada] = useState<SenhaMostrada | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const estatisticas = new Map(entregadores.map((e) => [e.id, e]));

  const carregar = useCallback(async () => {
    const r = await listarUsuariosAction();
    if (r.ok) {
      setUsuarios(r.dados);
      setErro(null);
    } else setErro(r.erro);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function novaSenha(u: UsuarioPainel) {
    setOcupado(`senha:${u.id}`);
    const r = await trocarSenhaUsuarioAction(u.id);
    setOcupado(null);
    if (!r.ok) return setErro(r.erro);
    setSenhaMostrada({ nome: u.nome ?? u.email, email: u.email, senha: r.dados.senha, papel: u.papel });
  }

  async function alternarAcesso(u: UsuarioPainel) {
    if (u.ativo && confirmar !== u.id) return setConfirmar(u.id);
    setConfirmar(null);
    setOcupado(`ativo:${u.id}`);
    const r = await definirAcessoUsuarioAction(u.id, !u.ativo);
    setOcupado(null);
    if (!r.ok) return setErro(r.erro);
    await carregar();
  }

  return (
    <div className="grid gap-4 border-b border-zinc-200/70 pb-8 last:border-0 lg:grid-cols-[17rem_1fr] lg:gap-10">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900">Usuários e acessos</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
          <b className="font-medium text-zinc-700">Administradores</b> entram no painel. <b className="font-medium text-zinc-700">Motoboys</b> entram em{" "}
          <code className="font-mono">/entrega</code> no celular para iniciar e confirmar entregas.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">Desativar corta o acesso na hora, mas mantém o histórico de entregas.</p>
      </div>

      <Cartao>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3.5 sm:px-6">
          <p className="text-[13px] text-zinc-500">{usuarios ? `${usuarios.length} usuário(s)` : "Carregando..."}</p>
          {!adicionando && (
            <Botao tamanho="sm" onClick={() => setAdicionando(true)}>
              <UserPlus className="size-3.5" /> Adicionar usuário
            </Botao>
          )}
        </div>

        {erro && (
          <div className="px-5 pt-4 sm:px-6">
            <Aviso>
              <span className="flex items-start justify-between gap-3">
                {erro}
                <button type="button" onClick={() => setErro(null)} aria-label="Fechar aviso">
                  <X className="size-4" />
                </button>
              </span>
            </Aviso>
          </div>
        )}

        {senhaMostrada && <SenhaGerada {...senhaMostrada} aoFechar={() => setSenhaMostrada(null)} />}

        {adicionando && (
          <FormNovoUsuario
            aoCancelar={() => setAdicionando(false)}
            aoCriar={async (criado) => {
              setAdicionando(false);
              setSenhaMostrada(criado);
              await carregar();
            }}
          />
        )}

        {usuarios === null && !erro ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-zinc-500">
            <Loader2 className="size-4 animate-spin" /> Carregando usuários...
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {(usuarios ?? []).map((u) => {
              const papel = u.papel ? PAPEL[u.papel] : null;
              const Icone = papel?.Icone ?? ShieldCheck;
              const stats = estatisticas.get(u.id);
              const sistema = u.papel === "impressora";
              const eu = u.id === meuId;
              return (
                <li key={u.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 sm:px-6", !u.ativo && "opacity-60")}>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 ring-1 ring-zinc-900/5 ring-inset">
                    <Icone className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-zinc-900">
                      {u.nome ?? (sistema ? "Impressora da cozinha" : u.email)}
                      {papel ? <Selo tom={papel.tom}>{papel.rotulo}</Selo> : <Selo tom="aviso">Sem acesso</Selo>}
                      {eu && <Selo>Você</Selo>}
                      {!u.ativo && <Selo tom="perigo">Desativado</Selo>}
                    </p>
                    <p className="truncate text-[13px] text-zinc-500">
                      {u.email}
                      {u.telefone ? ` · ${formatarTelefone(u.telefone)}` : ""}
                    </p>
                    <p className="text-[12px] text-zinc-400">
                      {sistema ? "Usuário do sistema (print-agent)" : `Último acesso: ${quando(u.ultimoAcesso)}`}
                      {stats && ` · ${stats.entregasHoje} entrega(s) hoje${stats.emRota ? ` · ${stats.emRota} em rota agora` : ""}`}
                    </p>
                  </div>
                  {!sistema && u.papel && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Botao
                        variante="secundario"
                        tamanho="sm"
                        aria-busy={ocupado === `senha:${u.id}`}
                        disabled={ocupado !== null}
                        onClick={() => void novaSenha(u)}
                      >
                        <KeyRound className="size-3.5" /> Nova senha
                      </Botao>
                      {!eu && (
                        <Botao
                          variante={u.ativo ? "perigo" : "secundario"}
                          tamanho="sm"
                          aria-busy={ocupado === `ativo:${u.id}`}
                          disabled={ocupado !== null}
                          onClick={() => void alternarAcesso(u)}
                          onBlur={() => setConfirmar((c) => (c === u.id ? null : c))}
                        >
                          {u.ativo ? (confirmar === u.id ? "Confirmar?" : "Desativar") : "Reativar"}
                        </Botao>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>
    </div>
  );
}

function FormNovoUsuario({ aoCancelar, aoCriar }: { aoCancelar: () => void; aoCriar: (s: SenhaMostrada) => Promise<void> }) {
  const [papel, setPapel] = useState<"entregador" | "admin">("entregador");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    iniciar(async () => {
      const r = await criarUsuarioAction({ nome, email, papel, telefone: papel === "entregador" ? telefone : undefined, senha: senha || undefined });
      if (!r.ok) return setErro(r.erro);
      await aoCriar({ nome: nome.trim(), email: email.trim().toLowerCase(), senha: r.dados.senha, papel });
    });
  }

  return (
    <form onSubmit={enviar} className="space-y-4 border-b border-zinc-100 bg-zinc-50/60 px-5 py-5 sm:px-6">
      <div className="inline-flex rounded-lg bg-white p-1 ring-1 ring-zinc-200" role="radiogroup" aria-label="Tipo de usuário">
        {(["entregador", "admin"] as const).map((p) => {
          const { rotulo, Icone } = PAPEL[p];
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={papel === p}
              onClick={() => setPapel(p)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                papel === p ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900"
              )}
            >
              <Icone className="size-3.5" /> {rotulo}
            </button>
          );
        })}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome">
          <input className={estiloEntrada} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} required autoComplete="off" />
        </Campo>
        <Campo rotulo="E-mail" dica="É o login da pessoa.">
          <input className={estiloEntrada} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
        </Campo>
        {papel === "entregador" && (
          <Campo rotulo="Telefone (opcional)">
            <input className={estiloEntrada} inputMode="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(47) 99999-8888" />
          </Campo>
        )}
        <Campo rotulo="Senha (opcional)" dica="Em branco, o sistema gera uma senha e mostra uma vez.">
          <input className={estiloEntrada} type="text" value={senha} onChange={(e) => setSenha(e.target.value)} minLength={8} maxLength={72} autoComplete="new-password" />
        </Campo>
      </div>
      {papel === "admin" && (
        <Aviso tom="aviso">Administrador tem acesso total: pedidos, cardápio, configurações, Pix e usuários.</Aviso>
      )}
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex gap-2">
        <Botao type="submit" aria-busy={salvando} disabled={salvando}>
          <UserPlus className="size-3.5" /> {salvando ? "Criando..." : `Criar ${papel === "admin" ? "administrador" : "motoboy"}`}
        </Botao>
        <Botao type="button" variante="fantasma" onClick={aoCancelar} disabled={salvando}>
          Cancelar
        </Botao>
      </div>
    </form>
  );
}

function SenhaGerada({ nome, email, senha, papel, aoFechar }: SenhaMostrada & { aoFechar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const onde = papel === "entregador" ? "/entrega no celular" : "/admin";
  return (
    <div className="border-b border-zinc-100 px-5 py-4 sm:px-6">
      <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200/70 ring-inset">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-emerald-900">Acesso de {nome} pronto</p>
            <p className="mt-0.5 text-[13px] text-emerald-800">
              Login: <b className="font-medium">{email}</b> · entra em <code className="font-mono">{onde}</code>
            </p>
          </div>
          <button type="button" onClick={aoFechar} className="text-emerald-700 hover:text-emerald-900" aria-label="Fechar">
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="rounded-lg bg-white px-3 py-2 font-mono text-[15px] font-semibold tracking-wide text-zinc-900 ring-1 ring-emerald-200">{senha}</code>
          <Botao
            variante="secundario"
            tamanho="sm"
            onClick={() =>
              void navigator.clipboard?.writeText(`Login: ${email}\nSenha: ${senha}`).then(() => {
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
              })
            }
          >
            {copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copiado ? "Copiado" : "Copiar login e senha"}
          </Botao>
        </div>
        <p className="mt-2 text-[12px] text-emerald-800">Anote ou envie agora: a senha não aparece de novo (dá para gerar outra).</p>
      </div>
    </div>
  );
}
