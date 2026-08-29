// Funcoes puras de agregacao dos pedidos do idworks para o dashboard.
// Fuso horario de referencia: America/Sao_Paulo (operacao é no Brasil).

const TZ = 'America/Sao_Paulo';

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const hourFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', hour12: false });

/** 'YYYY-MM-DD' na hora de Sao Paulo para uma Date/ISO-string qualquer. */
function spDateKey(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return dateFmt.format(d); // en-CA -> YYYY-MM-DD
}

function spHour(input) {
  const d = input instanceof Date ? input : new Date(input);
  return Number(hourFmt.format(d).replace('24', '0'));
}

/**
 * 'YYYY-MM-DD' lendo direto o dia em UTC da string ISO, sem converter fuso.
 * Uso: campos que sao DATA PURA (sem horario real), como
 * ShippingEstimateHandlingLimitDate - o idworks serializa como um instante
 * UTC (varia por canal: Shopee/Shein/Tiktok mandam "23:59:59Z", Mercado
 * Livre manda "00:00:00Z"), mas o valor pretendido e sempre o DIA, nao um
 * horario real. Converter esse instante pro fuso de Sao Paulo (UTC-3) so
 * funciona por coincidencia quando o horario embutido e proximo da meia-noite
 * "pra frente" (23:59:59Z); quando vem "00:00:00Z" (Mercado Livre) ou perto
 * disso (Temu, "00:29:59Z"), subtrair 3h cruza pro dia anterior e o pedido
 * aparece atrasado um dia antes da hora. Ler o dia UTC puro evita o problema
 * pros dois formatos.
 */
function utcDateKey(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// Modalidades "mesmo dia" que merecem aparecer separadas do canal padrao,
// identificadas pelo nome da transportadora (SupplierNameCorporateName) -
// confirmado com dados reais que "Shopee Entrega Direta" aparece como
// transportadora distinta de "Spx Express Br Private Limited" (Shopee
// padrao). Mercado Livre Flex ainda nao foi visto num pedido real (a conta
// nao tinha nenhum Flex no backlog no momento do desenvolvimento), mas o
// padrao de nome esperado e incluido preventivamente.
const SAME_DAY_MODALITY_REGEX = /direta|flex|turbo/i;

function modalityLabel(order) {
  const supplier = order.SupplierNameCorporateName || '';
  if (SAME_DAY_MODALITY_REGEX.test(supplier)) {
    const match = supplier.match(SAME_DAY_MODALITY_REGEX)[0];
    return match[0].toUpperCase() + match.slice(1).toLowerCase();
  }
  return null;
}

function groupByChannel(orders) {
  const byGroup = new Map();
  for (const o of orders) {
    const modality = modalityLabel(o);
    const channel = o.SalesChannelName || 'Outros';
    const groupKey = modality ? `${channel} · ${modality}` : channel;
    if (!byGroup.has(groupKey)) {
      byGroup.set(groupKey, { groupKey, channel, modality, logoUrl: o.SalesChannelLogoUrl || null, count: 0 });
    }
    byGroup.get(groupKey).count += 1;
  }
  return [...byGroup.values()].sort((a, b) => b.count - a.count);
}

/**
 * Agrupa o backlog (pedidos aguardando envio) em RAIAS POR DATA (DT est.
 * exp. = ShippingEstimateHandlingLimitDate) - uma raia por dia-limite,
 * mais antigo primeiro (ex: raia "atrasado" se algum pedido tiver data
 * passada, depois "hoje", depois os dias seguintes). Dentro de cada raia,
 * os pedidos sao agrupados por canal - e por modalidade "mesmo dia" quando
 * a transportadora indicar isso (ex: Shopee Entrega Direta vira uma barra
 * separada de "Shopee" padrao).
 *
 * Esse campo do idworks e uma DATA, nao um instante preciso (confirmado com
 * dados reais: vem tipicamente como meia-noite UTC do dia-limite, ex:
 * "2026-08-07T00:00:00.000Z"). Por isso a raia e sempre por DIA (fuso Sao
 * Paulo), nunca por horario exato.
 */
export function groupBacklog(orders, now = new Date()) {
  const nowDateKey = spDateKey(now);
  const byDate = new Map(); // dateKey|null -> pedidos[]

  for (const o of orders) {
    const limitRaw = o.ShippingEstimateHandlingLimitDate;
    const dateKey = limitRaw ? utcDateKey(limitRaw) : null;
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey).push(o);
  }

  const dateKeys = [...byDate.keys()].filter((k) => k !== null).sort();
  const lanes = dateKeys.map((dateKey) => ({
    dateKey,
    isPast: dateKey < nowDateKey,
    isToday: dateKey === nowDateKey,
    groups: groupByChannel(byDate.get(dateKey)),
  }));
  // pedidos sem DT est. exp. (ex: canal "idworks" manual) vao numa raia
  // propria no final, sem urgencia associada.
  if (byDate.has(null)) {
    lanes.push({ dateKey: null, isPast: false, isToday: false, groups: groupByChannel(byDate.get(null)) });
  }

  const allGroups = lanes.flatMap((l) => l.groups);
  return {
    lanes,
    total: allGroups.reduce((sum, g) => sum + g.count, 0),
    totalPast: lanes.filter((l) => l.isPast).flatMap((l) => l.groups).reduce((sum, g) => sum + g.count, 0),
  };
}

function snapshotFechado(orders) {
  const map = {};
  for (const o of orders) {
    map[o.IDOrder] = {
      channel: o.SalesChannelName || 'Outros',
      modality: modalityLabel(o),
      logoUrl: o.SalesChannelLogoUrl || null,
    };
  }
  return map;
}

function groupsToResult(groups) {
  const byChannelList = Object.values(groups).sort((a, b) => b.count - a.count);
  return { byChannel: byChannelList, total: byChannelList.reduce((s, c) => s + c.count, 0) };
}

/**
 * "Enviados hoje" = pedidos que SUMIRAM do backlog Fechado desde o ciclo
 * anterior de sync, acumulado ao longo do dia (fuso Sao Paulo).
 *
 * Por que nao usar o status oficial "Enviado" (IDStatusOrder=7) da idworks:
 * esse status so muda quando a transportadora/marketplace CONFIRMA o envio,
 * o que pode demorar horas ou dias dependendo do canal (Shopee/Shein
 * especialmente) - confirmado com dados reais: um dia inteiro de despacho
 * aparecia com so 3-4 pedidos "Enviado" no fim do dia, quase todos Mercado
 * Livre, porque os outros canais ainda nao tinham confirmado. O momento em
 * que o pedido sai do backlog Fechado (fila "aguardando envio") reflete
 * melhor o instante real em que foi processado/despachado no galpao.
 *
 * Limitacao conhecida: um pedido tambem pode sair do Fechado por ser
 * cancelado/devolvido antes do despacho fisico - caso raro, fica contado
 * como despachado mesmo assim (nao da pra distinguir sem consultar o pedido
 * individualmente).
 *
 * Precisa de estado entre ciclos (snapshot do Fechado anterior + acumulado
 * do dia) - por isso recebe/devolve `state` explicito em vez de calcular
 * tudo a partir dos pedidos atuais.
 */
export function trackDispatchedToday(prevState, fechadoOrders, now = new Date()) {
  const todayKey = spDateKey(now);
  const currentSnapshot = snapshotFechado(fechadoOrders);

  const isFreshDay = !prevState || prevState.date !== todayKey;
  const groups = isFreshDay ? {} : { ...prevState.groups };
  const prevSnapshot = isFreshDay ? null : prevState.snapshot || {};
  const prevIds = prevSnapshot ? Object.keys(prevSnapshot) : [];

  // Guarda contra falha de coleta (o Fechado usa Playwright, ja documentado
  // como instavel as vezes - ver Handoff.md secao 1b): se o backlog anterior
  // tinha um volume minimamente relevante e a maior parte sumiu de uma vez
  // so, e mais provavel ter sido uma coleta incompleta/falha do que despacho
  // real - nesse caso NAO atualiza nada (nem o acumulado, nem o snapshot) e
  // tenta de novo no proximo ciclo, pra nao inflar o dia inteiro por engano.
  const disappeared = prevIds.filter((id) => !currentSnapshot[id]);
  const suspiciousDrop = prevIds.length >= 10 && disappeared.length / prevIds.length > 0.6;

  if (suspiciousDrop) {
    console.warn(
      `[trackDispatchedToday] queda suspeita no backlog Fechado (${disappeared.length}/${prevIds.length} sumiram de uma vez) - ignorando esse ciclo, provavel falha de coleta.`
    );
    return { dispatchedToday: groupsToResult(groups), state: prevState };
  }

  if (prevSnapshot) {
    for (const id of disappeared) {
      const info = prevSnapshot[id];
      const groupKey = info.modality ? `${info.channel} · ${info.modality}` : info.channel;
      if (!groups[groupKey]) {
        groups[groupKey] = {
          groupKey,
          channel: info.channel,
          modality: info.modality,
          logoUrl: info.logoUrl,
          count: 0,
          hourly: Array.from({ length: 24 }, () => 0),
        };
      }
      groups[groupKey].count += 1;
      groups[groupKey].hourly[spHour(now)] += 1;
    }
  }

  const state = { date: todayKey, groups, snapshot: currentSnapshot };
  return { dispatchedToday: groupsToResult(groups), state };
}

export { spDateKey };
