import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const publicDataDir = path.join(__dirname, '..', 'public', 'data');
const dashboardJsonPath = path.join(publicDataDir, 'dashboard.json');
const dispatchStatePath = path.join(dataDir, 'dispatch-state.json');
const prodDispatchStatePath = path.join(dataDir, 'prod-dispatch-state.json');

// O dashboard final vira um arquivo JSON estatico servido direto (Express
// local via express.static, ou GitHub Pages em producao) - dashboard.js
// busca esse mesmo caminho relativo nos dois ambientes, sem precisar de
// nenhum endpoint de API.
export async function writeCache(data) {
  await mkdir(publicDataDir, { recursive: true });
  await writeFile(dashboardJsonPath, JSON.stringify(data, null, 2), 'utf-8');
}

// Estado do rastreamento de "enviados hoje" (ver trackDispatchedToday em
// aggregate.mjs) - precisa persistir entre ciclos de sync (snapshot do
// backlog Fechado do ciclo anterior + acumulado do dia). Local (dev) e
// producao (CI/GitHub Actions) usam arquivos separados de propósito - um
// teste rodado localmente nao deve contaminar o acumulado do dia que esta
// commitado no repositorio.
export async function readDispatchState() {
  return readJsonOrNull(dispatchStatePath);
}

export async function writeDispatchState(state) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dispatchStatePath, JSON.stringify(state, null, 2), 'utf-8');
}

export async function readProdDispatchState() {
  return readJsonOrNull(prodDispatchStatePath);
}

export async function writeProdDispatchState(state) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(prodDispatchStatePath, JSON.stringify(state, null, 2), 'utf-8');
}

async function readJsonOrNull(filePath) {
  try {
    const text = await readFile(filePath, 'utf-8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}
