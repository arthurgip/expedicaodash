// Roda UMA VEZ o ciclo de sync completo, pensado pro GitHub Actions
// (workflow .github/workflows/dashboard.yml): sem processo continuo nem
// disco persistente entre execucoes (igual a antiga funcao serverless do
// Vercel) - por isso usa idworksBrowserClientServerless.mjs (login do zero
// toda vez) e persiste o estado do rastreamento de "enviados hoje" num
// arquivo COMMITADO no repositorio (data/prod-dispatch-state.json), nao em
// disco efemero.
import process from 'node:process';

import { fetchFechadoOrdersServerless } from '../src/idworksBrowserClientServerless.mjs';
import { groupBacklog, trackDispatchedToday } from '../src/aggregate.mjs';
import { buildScheduleReference } from '../src/buildScheduleReference.mjs';
import { readProdDispatchState, writeProdDispatchState, writeCache } from '../src/cache.mjs';

async function main() {
  const account = process.env.IDWORKS_ACCOUNT;
  const email = process.env.IDWORKS_EMAIL;
  const password = process.env.IDWORKS_PASSWORD;
  if (!account || !email || !password) {
    throw new Error('Faltam IDWORKS_ACCOUNT / IDWORKS_EMAIL / IDWORKS_PASSWORD (secrets do repositorio).');
  }
  const webBaseUrl = `https://${account}.idworks.com.br`;

  const fechadoOrders = await fetchFechadoOrdersServerless({ webBaseUrl, email, password });
  const scheduleReference = await buildScheduleReference({
    onWarn: (err) => console.warn(`[ci-sync] Nao consegui buscar horario ao vivo do Mercado Livre, usando fixo: ${err.message}`),
  });

  const now = new Date();
  const prevDispatchState = await readProdDispatchState();
  const { dispatchedToday, state: nextDispatchState } = trackDispatchedToday(prevDispatchState, fechadoOrders, now);
  await writeProdDispatchState(nextDispatchState);

  const payload = {
    generatedAt: now.toISOString(),
    fechado: groupBacklog(fechadoOrders, now),
    shippedToday: dispatchedToday,
    scheduleReference,
  };

  await writeCache(payload);
  console.log(`[ci-sync] OK ${payload.generatedAt} - Fechado total=${payload.fechado.total} enviados hoje=${payload.shippedToday.total}`);
}

main().catch((err) => {
  console.error('[ci-sync] ERRO:', err);
  process.exit(1);
});
