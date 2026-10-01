/**
 * Cria/atualiza usuários do Supabase Auth com papel (app_metadata.papel).
 *
 *   pnpm usuario impressora          -> usuário do print-agent; senha aleatória gravada
 *                                       direto em apps/print-agent/.env (não é exibida)
 *   pnpm usuario admin email@x.com   -> login do painel; a senha é digitada no terminal
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

const [papel, emailArg] = process.argv.slice(2);
if (papel !== "impressora" && papel !== "admin") {
  console.error("Uso: pnpm usuario impressora | pnpm usuario admin email@exemplo.com");
  process.exit(1);
}

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
}).auth.admin;

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
  const { error } = existente
    ? await admin.updateUserById(existente.id, atributos)
    : await admin.createUser({ email, ...atributos });
  if (error) throw error;
  return existente ? "atualizado" : "criado";
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
  const resultado = await salvarUsuario(EMAIL_IMPRESSORA, senha);
  gravarEnv(ENV_PRINT_AGENT, {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: lerEnv(ENV_PRINT_AGENT, "SUPABASE_ANON_KEY") ?? lerEnv(ENV_WEB, "NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? "",
    IMPRESSORA_EMAIL: EMAIL_IMPRESSORA,
    IMPRESSORA_SENHA: senha,
  });
  console.log(`Usuário da impressora ${resultado}; credenciais gravadas em apps/print-agent/.env`);
} else {
  if (!emailArg) throw new Error("Informe o e-mail: pnpm usuario admin email@exemplo.com");
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  const senha = await terminal.question("Senha do painel (mínimo 8 caracteres): ");
  terminal.close();
  if (senha.length < 8) throw new Error("Senha muito curta");
  console.log(`Admin ${emailArg} ${await salvarUsuario(emailArg, senha)}`);
}
