// Descoberta contra a API REST real do idworks (https://{account}.api-idworks.com.br/1.0).
// So GET - nao grava nada. Mascara PII do cliente antes de salvar em arquivo.
//
// Uso:
//   node scripts/discover-orders.mjs

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

process.loadEnvFile();

const account = process.env.IDWORKS_ACCOUNT;
const email = process.env.IDWORKS_EMAIL;
const password = process.env.IDWORKS_PASSWORD;

if (!account || !email || !password) {
  console.error('Preencha .env (IDWORKS_ACCOUNT / IDWORKS_EMAIL / IDWORKS_PASSWORD) antes de rodar.');
  process.exit(1);
}

const baseUrl = `https://${account}.api-idworks.com.br/1.0`;

async function login() {
  const resp = await fetch(`${baseUrl}/user/signin/local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Login falhou (${resp.status}): ${text.slice(0, 500)}`);
  }
  const data = JSON.parse(text);
  const token = data.token || data.accessToken;
  if (!token) throw new Error(`Resposta de login sem token: ${text.slice(0, 500)}`);
  return token;
}

async function get(token, pathName, params = {}) {
  const url = new URL(`${baseUrl}${pathName}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`${resp.status} ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

const PII_KEYS = new Set([
  'name', 'consumername', 'email', 'phone', 'cpf', 'cnpj', 'address',
  'street', 'zipcode', 'cep', 'document', 'receivername', 'buyername',
]);

function maskPii(obj) {
  if (Array.isArray(obj)) return obj.slice(0, 2).map(maskPii);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = PII_KEYS.has(k.toLowerCase()) ? '***' : maskPii(v);
    }
    return out;
  }
  return obj;
}

function asItems(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.Result)) return res.Result;
  if (res && Array.isArray(res.Items)) return res.Items;
  return [];
}

async function main() {
  console.log(`Base URL: ${baseUrl}`);
  console.log('Autenticando...');
  const token = await login();
  console.log('OK, token obtido.\n');

  console.log('GET /orders (default, sem filtro de status)...');
  let defaultOrders;
  try {
    defaultOrders = await get(token, '/orders', { Page: 1 });
  } catch (e) {
    console.error('  Falhou:', e.message);
  }
  const defaultItems = asItems(defaultOrders);
  console.log(`  ${defaultItems.length} registro(s) na pagina 1 (default)`);
  if (defaultItems[0]) {
    console.log('  Campos do 1o registro:', Object.keys(defaultItems[0]).join(', '));
  }

  const statusSeen = new Map();
  const channelFieldCandidates = new Set();
  const sampleByStatus = {};

  function scan(list) {
    for (const o of list) {
      if (!o || typeof o !== 'object') continue;
      const sid = o.IDStatusOrder;
      const sname = o.StatusOrder ?? o.Status;
      if (sid !== undefined) {
        if (!statusSeen.has(String(sid))) statusSeen.set(String(sid), new Set());
        statusSeen.get(String(sid)).add(String(sname));
        if (!sampleByStatus[String(sid)]) sampleByStatus[String(sid)] = maskPii(o);
      }
      for (const key of ['OrderFrom', 'Channel', 'Canal', 'Marketplace', 'Origin', 'IDIntegration', 'IntegrationName', 'Integration']) {
        if (o[key] !== undefined && o[key] !== null && o[key] !== '') {
          channelFieldCandidates.add(`${key}=${o[key]}`);
        }
      }
    }
  }

  scan(defaultItems);

  console.log('\nTestando IDStatusOrder de 1 a 25...');
  for (let sid = 1; sid <= 25; sid++) {
    try {
      const res = await get(token, '/orders', { IDStatusOrder: sid, Page: 1 });
      const items = asItems(res);
      if (items.length) {
        scan(items);
        console.log(`  IDStatusOrder=${sid}: ${items.length} pedido(s) -> status="${items[0].StatusOrder ?? items[0].Status}"`);
      }
    } catch (e) {
      console.log(`  IDStatusOrder=${sid}: erro ${e.message}`);
    }
  }

  console.log('\nGET /orders/package (amostra)...');
  try {
    const pkgs = await get(token, '/orders/package', { Page: 1 });
    const pkgItems = asItems(pkgs);
    console.log(`  ${pkgItems.length} registro(s).`);
    if (pkgItems[0]) console.log('  Campos:', Object.keys(pkgItems[0]).join(', '));
  } catch (e) {
    console.log('  Falhou:', e.message);
  }

  const out = {
    statusSeen: Object.fromEntries([...statusSeen.entries()].map(([k, v]) => [k, [...v]])),
    channelFieldCandidatesSeen: [...channelFieldCandidates].sort(),
    sampleOrdersByStatus: sampleByStatus,
  };

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const outPath = path.join(__dirname, 'discovery-output.json');
  await writeFile(outPath, JSON.stringify(out, null, 2), 'utf-8');
  console.log(`\nResultado salvo em ${outPath}`);
  console.log('PII (nome/email/telefone/documento/endereco) mascarada como "***".');
}

main().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
