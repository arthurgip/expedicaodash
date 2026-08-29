// Troca o "code" de autorizacao (obtido uma unica vez via login manual no
// navegador do usuario) pelos tokens de acesso do Mercado Livre, e salva o
// refresh_token localmente (nunca versionado) pra uso continuo do servidor.
//
// Uso: node scripts/ml-oauth-exchange.mjs SEU_CODE_AQUI
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

process.loadEnvFile();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const tokensPath = path.join(dataDir, 'ml-tokens.json');

const code = process.argv[2];
if (!code) {
  console.error('Uso: node scripts/ml-oauth-exchange.mjs SEU_CODE_AQUI');
  process.exit(1);
}

const clientId = process.env.ML_CLIENT_ID;
const clientSecret = process.env.ML_CLIENT_SECRET;
const redirectUri = process.env.ML_REDIRECT_URI;

const resp = await fetch('https://api.mercadolibre.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  }),
});

const text = await resp.text();
if (!resp.ok) {
  console.error(`Falhou (${resp.status}):`, text);
  process.exit(1);
}

const tokens = JSON.parse(text);
tokens.obtained_at = Date.now();
console.log('Token obtido com sucesso.');
console.log('  user_id:', tokens.user_id);
console.log('  expires_in (s):', tokens.expires_in);
console.log('  scope:', tokens.scope);

await mkdir(dataDir, { recursive: true });
await writeFile(tokensPath, JSON.stringify(tokens, null, 2), 'utf-8');
console.log(`\nSalvo local em ${tokensPath}`);

// --remote tambem grava nos GitHub Secrets do repositorio (usados pelo
// workflow .github/workflows/dashboard.yml, que nao tem acesso ao arquivo
// local) - precisa do GitHub CLI (`gh`) autenticado com permissao de
// escrever secrets no repo.
if (process.argv.includes('--remote')) {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  const repo = process.env.GH_REPO || 'arthurgip/expedicaodash';

  async function setSecret(name, value) {
    await execFileAsync('gh', ['secret', 'set', name, '--repo', repo, '--body', String(value)]);
    console.log(`  secret ${name} atualizado em ${repo}`);
  }

  await setSecret('ML_ACCESS_TOKEN', tokens.access_token);
  await setSecret('ML_USER_ID', tokens.user_id);
  console.log('Secrets do GitHub atualizados (producao).');
}

// Teste rapido: busca as preferencias de envio (delivery_ranges) com o
// access_token recem obtido.
const prefResp = await fetch(`https://api.mercadolibre.com/users/${tokens.user_id}/shipping_preferences`, {
  headers: { Authorization: `Bearer ${tokens.access_token}` },
});
const prefText = await prefResp.text();
console.log(`\nGET /users/${tokens.user_id}/shipping_preferences -> ${prefResp.status}`);
console.log(prefText);
