import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

process.loadEnvFile();

import { createSyncService } from './sync.mjs';

// Rede de seguranca: o dashboard tem que ficar de pe numa tela fixa 24/7.
// Um erro inesperado num ciclo de sync (ex: timeout do Playwright) nao pode
// derrubar o processo inteiro - so aquele ciclo falha e tenta de novo no
// proximo (ja tratado em sync.mjs), mas isso aqui cobre qualquer rejeicao
// que escape desse tratamento.
process.on('unhandledRejection', (err) => {
  console.error('[server] unhandledRejection (ignorado, processo continua):', err);
});
process.on('uncaughtException', (err) => {
  console.error('[server] uncaughtException (ignorado, processo continua):', err);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const SYNC_INTERVAL_SECONDS = Number(process.env.SYNC_INTERVAL_SECONDS || 90);

const account = process.env.IDWORKS_ACCOUNT;
const email = process.env.IDWORKS_EMAIL;
const password = process.env.IDWORKS_PASSWORD;

if (!account || !email || !password) {
  console.error('Faltam IDWORKS_ACCOUNT / IDWORKS_EMAIL / IDWORKS_PASSWORD no .env');
  process.exit(1);
}

const sync = createSyncService({ account, email, password, intervalSeconds: SYNC_INTERVAL_SECONDS });

const app = express();
// public/data/dashboard.json e escrito pelo ciclo de sync (src/cache.mjs) e
// servido aqui como arquivo estatico - o mesmo caminho relativo que o
// GitHub Pages serve em producao (dashboard.js busca sempre "data/dashboard.json",
// nao importa o ambiente).
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`Dashboard Expedição rodando em http://localhost:${PORT}`);
  sync.start();
});
