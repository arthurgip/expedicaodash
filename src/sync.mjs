import { fetchFechadoOrders } from './idworksBrowserClient.mjs';
import { groupBacklog, trackDispatchedToday } from './aggregate.mjs';
import { buildScheduleReference } from './buildScheduleReference.mjs';
import { writeCache, readDispatchState, writeDispatchState } from './cache.mjs';

export function createSyncService({ account, email, password, intervalSeconds = 90 }) {
  const webBaseUrl = `https://${account}.idworks.com.br`;
  let running = false;
  let timer = null;
  let lastError = null;
  let lastSuccessAt = null;

  // IDStatusOrder=1 (Fechado) tem um bug confirmado na API REST do idworks:
  // o filtro sempre devolve 0 mesmo com pedidos Fechado reais existindo (a
  // mesma chamada, byte a byte, so funciona quando sai de um navegador de
  // verdade - ver src/idworksBrowserClient.mjs). Contorno: busca via
  // automacao de navegador reaproveitando uma sessao persistente.
  async function fetchFechado() {
    return fetchFechadoOrders({ webBaseUrl, email, password });
  }

  // So loga o aviso na primeira falha consecutiva (evita spam de log a cada
  // ciclo enquanto o token ML continuar expirado).
  let mlScheduleWarned = false;
  async function buildScheduleReferenceLogged() {
    let warned = false;
    const reference = await buildScheduleReference({
      onWarn: (err) => {
        warned = true;
        if (!mlScheduleWarned) {
          console.warn(`[sync] Nao consegui buscar horario ao vivo do Mercado Livre, usando fixo: ${err.message}`);
        }
      },
    });
    mlScheduleWarned = warned;
    return reference;
  }

  async function runOnce() {
    const fechadoOrders = await fetchFechado();
    const scheduleReference = await buildScheduleReferenceLogged();

    const now = new Date();
    const fechado = groupBacklog(fechadoOrders, now);
    const prevDispatchState = await readDispatchState();
    const { dispatchedToday: shippedToday, state: nextDispatchState } = trackDispatchedToday(prevDispatchState, fechadoOrders, now);
    await writeDispatchState(nextDispatchState);

    const payload = {
      generatedAt: now.toISOString(),
      fechado,
      shippedToday,
      scheduleReference,
    };

    await writeCache(payload);
    lastError = null;
    lastSuccessAt = now.toISOString();
    return payload;
  }

  async function tick() {
    if (running) return;
    running = true;
    try {
      await runOnce();
      console.log(`[sync] OK ${new Date().toISOString()}`);
    } catch (err) {
      lastError = err.message;
      console.error(`[sync] ERRO: ${err.message}`);
    } finally {
      running = false;
    }
  }

  function start() {
    tick();
    timer = setInterval(tick, intervalSeconds * 1000);
  }

  function stop() {
    if (timer) clearInterval(timer);
  }

  function status() {
    return { running, lastError, lastSuccessAt };
  }

  return { start, stop, status, runOnce };
}
