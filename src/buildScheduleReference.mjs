import { SCHEDULE_REFERENCE } from './scheduleConfig.mjs';
import { fetchMercadoLivreDayLines } from './mlClient.mjs';

// O horario de corte/coleta do ML muda por dia da semana e e calculado
// pelo proprio Mercado Livre - busca ao vivo via API sempre que possivel.
// Se falhar por qualquer motivo (token expirado, sem refresh_token, rede),
// cai pro horario estatico do scheduleConfig.mjs sem quebrar o painel.
//
// Compartilhado entre os tres pontos de sync (local, CI/GitHub Actions) pra
// nao duplicar essa logica.
export async function buildScheduleReference({ onWarn } = {}) {
  const reference = SCHEDULE_REFERENCE.map((s) => ({ ...s }));
  try {
    const liveDayLines = await fetchMercadoLivreDayLines();
    const ml = reference.find((s) => s.channel === 'Mercado Livre');
    if (ml) {
      // Flex nao vem desse endpoint (e um modo a parte, nao faz parte do
      // cronograma cross_docking) - preserva a linha estatica do Flex, so
      // troca o corte/coleta pelo dado ao vivo.
      const nonLiveLines = (ml.dayLines || []).filter((d) => /flex/i.test(d.days));
      ml.dayLines = [...liveDayLines, ...nonLiveLines];
    }
  } catch (err) {
    onWarn?.(err);
  }
  return reference;
}
