import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

process.loadEnvFile();

const account = process.env.IDWORKS_ACCOUNT;
const email = process.env.IDWORKS_EMAIL;
const password = process.env.IDWORKS_PASSWORD;
const baseUrl = `https://${account}.api-idworks.com.br/1.0`;

async function login() {
  const resp = await fetch(`${baseUrl}/user/signin/local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await resp.json();
  return data.token || data.accessToken;
}

const PII_KEYS = new Set(['name', 'consumername', 'email', 'phone', 'cpf', 'cnpj', 'address', 'street', 'zipcode', 'cep', 'document', 'receivername', 'buyername']);
function maskPii(obj) {
  if (Array.isArray(obj)) return obj.map(maskPii);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = PII_KEYS.has(k.toLowerCase()) ? '***' : maskPii(v);
    return out;
  }
  return obj;
}

async function main() {
  const token = await login();
  console.log('Login OK. Buscando detalhe do pedido 19843753 (Enviado)...');
  const resp = await fetch(`${baseUrl}/orders/19843753`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await resp.text();
  if (!resp.ok) {
    console.error(`Erro ${resp.status}: ${text.slice(0, 500)}`);
    process.exit(1);
  }
  const data = JSON.parse(text);
  const masked = maskPii(data);
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const outPath = path.join(__dirname, 'discovery-order-detail.json');
  await writeFile(outPath, JSON.stringify(masked, null, 2), 'utf-8');
  console.log('Chaves de topo:', Object.keys(Array.isArray(data) ? data[0] : data).join(', '));
  console.log('Salvo em', outPath);
}

main().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
