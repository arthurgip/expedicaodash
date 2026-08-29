// Referencia estatica de horarios de corte e coleta, informada pelo usuario
// (nao vem de nenhuma API - e regra operacional/comercial de cada canal).
// O corte REAL por pedido continua vindo ao vivo do idworks
// (ShippingEstimateHandlingLimitDate, exibido como "DT est. exp." no
// backlog) - este painel e so uma referencia visual pra equipe.
//
// dayLines: CADA dia/grupo de dias (ou modalidade que vale todo dia, tipo
//   Flex) vira a sua PROPRIA linha - nunca junta regras diferentes numa
//   linha so.
//   segments: {icon, time, label} - label e a PALAVRA por extenso (Corte /
//     Coleta / Entrega), mostrada embaixo do icone+horario.
//   note: texto livre complementar (ex: o que acontece depois do corte).
//   icon: 'clock' (corte - so horario, sem veiculo),
//         'truck' (coleta - veiculo vem buscar aqui),
//         'moto' (entrega mesmo dia - Flex/Entrega Direta),
//         'point' (nos somos ponto de coleta / sem veiculo vindo ate aqui)
export const SCHEDULE_REFERENCE = [
  {
    channel: 'Mercado Livre',
    dayLines: [
      {
        days: 'Seg a Sex',
        segments: [
          { icon: 'clock', time: '09:45', label: 'Corte' },
          { icon: 'truck', time: '10:45–12:45', label: 'Coleta' },
        ],
      },
      {
        days: 'Sábado',
        segments: [
          { icon: 'clock', time: '06:00', label: 'Corte' },
          { icon: 'truck', time: '09:00–11:00', label: 'Coleta' },
        ],
      },
      {
        days: 'Flex — todo dia',
        segments: [
          { icon: 'clock', time: '13:00', label: 'Corte' },
          { icon: 'moto', time: '18:00', label: 'Entrega' },
        ],
      },
    ],
  },
  {
    channel: 'Shopee',
    dayLines: [
      {
        days: 'Entrega Direta — todo dia',
        segments: [
          { icon: 'clock', time: '13:00', label: 'Corte' },
          { icon: 'moto', time: '18:00', label: 'Entrega' },
        ],
      },
      {
        days: 'Padrão — ter a sex',
        segments: [{ icon: 'clock', time: '13:00', label: 'Corte' }],
        note: 'Depois do corte → próximo dia útil.',
      },
      { days: 'Padrão — sábado', segments: [], note: 'Próximo dia útil (meta: despachar 20% no sábado).' },
      { days: 'Padrão — domingo', segments: [], note: '2 dias úteis (até terça, se não for feriado).' },
      { days: 'Padrão — segunda', segments: [], note: 'Próximo dia útil (até terça, se não for feriado).' },
      { days: 'Padrão — feriado', segments: [], note: 'Próximo dia útil.' },
    ],
  },
  {
    channel: 'Shein',
    dayLines: [],
    notes: ['Sem corte fixo — 1 dia útil de prazo.', 'Próximo dia útil.'],
  },
  {
    channel: 'Temu',
    dayLines: [],
    notes: ['Sem corte fixo — 1 dia útil de prazo.', 'Próximo dia útil.'],
  },
  {
    channel: 'Tiktok',
    dayLines: [],
    notes: ['Sem corte fixo — 2 dias úteis de prazo.', 'Próximo dia útil.'],
  },
  {
    channel: 'Nuvem Shop',
    dayLines: [],
    notes: ['Sem corte fixo — 1 dia útil de prazo.', 'Próximo dia útil.'],
  },
];
