// Cliente para a API do Mercado Livre - busca o horario real de corte e
// coleta (GET /users/{id}/shipping/schedule/cross_docking), que muda por
// dia da semana e e calculado pelo proprio ML (roteamento com a
// transportadora), nao e algo que da pra hardcodar com confianca.
//
// LIMITACAO CONHECIDA: a autorizacao OAuth feita nao devolveu refresh_token
// (so access_token, valido 6h). Sem refresh_token, depois de 6h essa busca
// volta a falhar ate alguem reautorizar manualmente (rodar o fluxo de
// scripts/ml-oauth-exchange.mjs de novo). Por isso runOnce() do sync.mjs
// SEMPRE tem o horario estatico do scheduleConfig.mjs como fallback - se
// isso falhar, o painel continua funcionando com o horario fixo.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tokensPath = path.join(__dirname, '..', 'data', 'ml-tokens.json');

const WEEKDAY_PT = {
  monday: 'Segunda',
  tuesday: 'Terça',
  wednesday: 'Quarta',
  thursday: 'Quinta',
  friday: 'Sexta',
  saturday: 'Sábado',
  sunday: 'Domingo',
};
const WEEKDAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const WEEKDAY_ABBR = { monday: 'Seg', tuesday: 'Ter', wednesday: 'Qua', thursday: 'Qui', friday: 'Sex', saturday: 'Sáb', sunday: 'Dom' };

// No GitHub Actions (disco nao persiste entre execucoes) os tokens vem de
// secrets do repositorio, injetados como env vars - o usuario reautoriza
// manualmente (seção 3 do Handoff) e atualiza os secrets ML_ACCESS_TOKEN /
// ML_USER_ID a cada ~6h (sem refresh_token). Local continua lendo do
// arquivo, mais simples pra dev.
async function loadTokens() {
  if (process.env.ML_ACCESS_TOKEN && process.env.ML_USER_ID) {
    return { access_token: process.env.ML_ACCESS_TOKEN, user_id: process.env.ML_USER_ID };
  }
  const text = await readFile(tokensPath, 'utf-8');
  return JSON.parse(text);
}

/**
 * Busca o cronograma real de corte/coleta (cross_docking) da API do ML e
 * converte pro mesmo formato de "dayLines" que o scheduleConfig.mjs usa
 * (dias consecutivos com o mesmo horario viram um grupo so, ex: "Seg a Qui").
 */
export async function fetchMercadoLivreDayLines() {
  const tokens = await loadTokens();

  const resp = await fetch(`https://api.mercadolibre.com/users/${tokens.user_id}/shipping/schedule/cross_docking`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!resp.ok) {
    throw new Error(`ML shipping/schedule falhou (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
  }
  const data = await resp.json();

  const perDay = WEEKDAY_ORDER.map((day) => {
    const info = data.schedule?.[day];
    const d = info?.detail?.[0];
    if (!info?.work || !d) return { day, work: false };
    return { day, work: true, cutoff: d.cutoff, from: d.from, to: d.to };
  });

  // agrupa dias consecutivos com exatamente o mesmo horario numa linha so
  const dayLines = [];
  let i = 0;
  while (i < perDay.length) {
    const cur = perDay[i];
    if (!cur.work) { i++; continue; }
    let j = i;
    while (
      j + 1 < perDay.length &&
      perDay[j + 1].work &&
      perDay[j + 1].cutoff === cur.cutoff &&
      perDay[j + 1].from === cur.from &&
      perDay[j + 1].to === cur.to
    ) {
      j++;
    }
    const label = i === j
      ? WEEKDAY_PT[perDay[i].day]
      : `${WEEKDAY_ABBR[perDay[i].day]} a ${WEEKDAY_ABBR[perDay[j].day]}`;
    dayLines.push({
      days: label,
      segments: [
        { icon: 'clock', time: cur.cutoff, label: 'Corte' },
        { icon: 'truck', time: `${cur.from}–${cur.to}`, label: 'Coleta' },
      ],
    });
    i = j + 1;
  }

  return dayLines;
}
