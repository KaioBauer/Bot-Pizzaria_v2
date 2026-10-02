/**
 * Cria/atualiza usuários do Supabase Auth com papel (app_metadata.papel).
 *
 *   pnpm usuario impressora          -> usuário do print-agent; senha aleatória gravada
 *                                       direto em apps/print-agent/.env (não é exibida)
 *   pnpm usuario admin email@x.com   -> login do painel; a senha é digitada no terminal
 *   pnpm usuario entregador email@x.com "Nome do Motoboy" [telefone]
 *                                    -> login do motoboy (tela /entrega no celular)
 *
 * Usa a service_role de apps/bot/.env. Rodar no seu terminal (não em CI).
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(resolve(import.meta.dirname, "../.env"));

const EMAIL_IMPRESSORA = "impressora.vianna@example.com";
const ENV_PRINT_AGENT = resolve(import.meta.dirname, "../../print-agent/.env");
const ENV_WEB = resolve(import.meta.dirname, "../../web/.env.local");

const [papel, emailArg, nomeArg, telefoneArg] = process.argv.slice(2);
if (papel !== "impressora" && papel !== "admin" && papel !== "entregador") {
  console.error('Uso: pnpm usuario impressora | pnpm usuario admin email@exemplo.com | pnpm usuario entregador email@exemplo.com "Nome" [telefone]');
  process.exit(1);
}

const servico = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const admin = servico.auth.admin;

async function buscarPorEmail(email: string) {
  for (let pagina = 1; ; pagina++) {
    const { data, error } = await admin.listUsers({ page: pagina, perPage: 200 });
    if (error) throw error;
    const usuario = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (usuario || data.users.length < 200) return usuario ?? null;
  }
}

async function salvarUsuario(email: string, senha: string) {
  const existente = await buscarPorEmail(email);
  const atributos = { password: senha, email_confirm: true, app_metadata: { papel } };
  const { data, error } = existente
    ? await admin.updateUserById(existente.id, atributos)
    : await admin.createUser({ email, ...atributos });
  if (error) throw error;
  return { resultado: existente ? "atualizado" : "criado", id: data.user.id };
}

/** Atualiza (ou acrescenta) chaves num arquivo .env preservando o resto. */
function gravarEnv(caminho: string, valores: Record<string, string>) {
  let conteudo = existsSync(caminho) ? readFileSync(caminho, "utf8") : "";
  for (const [chave, valor] of Object.entries(valores)) {
    const linha = `${chave}=${valor}`;
    const regex = new RegExp(`^${chave}=.*$`, "m");
    conteudo = regex.test(conteudo) ? conteudo.replace(regex, linha) : `${conteudo.trimEnd()}\n${linha}\n`.trimStart();
  }
  writeFileSync(caminho, conteudo);
}

function lerEnv(caminho: string, chave: string): string | undefined {
  if (!existsSync(caminho)) return undefined;
  return new RegExp(`^${chave}=(.*)$`, "m").exec(readFileSync(caminho, "utf8"))?.[1]?.trim();
}

if (papel === "impressora") {
  const senha = randomBytes(24).toString("base64url");
  const { resultado } = await salvarUsuario(EMAIL_IMPRESSORA, senha);
  gravarEnv(ENV_PRINT_AGENT, {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: lerEnv(ENV_PRINT_AGENT, "SUPABASE_ANON_KEY") ?? lerEnv(ENV_WEB, "NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? "",
    IMPRESSORA_EMAIL: EMAIL_IMPRESSORA,
    IMPRESSORA_SENHA: senha,
  });
  console.log(`Usuário da impressora ${resultado}; credenciais gravadas em apps/print-agent/.env`);
} else {
  if (!emailArg) throw new Error(`Informe o e-mail: pnpm usuario ${papel} email@exemplo.com`);
  if (papel === "entregador" && (nomeArg?.trim().length ?? 0) < 2) throw new Error('Informe o nome: pnpm usuario entregador email@exemplo.com "Nome"');
  if (/@(x|exemplo|domotoboy)\.com$/i.test(emailArg) || nomeArg === "Nome do Motoboy") {
    throw new Error("Use o e-mail e o nome de verdade (os do comando eram só exemplo).");
  }
  // Sem terminal interativo (ex.: "!" no Claude Code), o motoboy ganha uma senha
  // gerada, mostrada uma vez no final; o admin precisa digitar a dele.
  const gerada = papel === "entregador" && !process.stdin.isTTY;
  let senha: string;
  if (gerada) {
    senha = `vianna-${randomBytes(4).toString("hex")}`;
  } else {
    if (!process.stdin.isTTY) throw new Error("Rode este comando num terminal (PowerShell), onde dá para digitar a senha.");
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    senha = await terminal.question(`Senha ${papel === "admin" ? "do painel" : "do motoboy"} (mínimo 8 caracteres): `);
    terminal.close();
  }
  if (senha.length < 8) throw new Error("Senha muito curta");
  const { resultado, id } = await salvarUsuario(emailArg, senha);
  if (papel === "entregador") {
    const { error } = await servico
      .from("entregadores")
      .upsert({ user_id: id, nome: nomeArg!.trim(), telefone: telefoneArg?.trim() || null, ativo: true });
    if (error) throw error;
  }
  console.log(`${papel === "admin" ? "Admin" : `Motoboy ${nomeArg}`} (${emailArg}) ${resultado}`);
  if (gerada) console.log(`Senha do motoboy: ${senha}  (passe para ele; dá para trocar rodando o comando de novo)`);
}
