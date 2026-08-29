const TZ = 'America/Sao_Paulo';
const REFRESH_MS = 30_000;

// Cores aproximadas das marcas de cada marketplace (pedido explicito: as
// barras do Fechado devem lembrar a cor de cada canal).
const CHANNEL_COLOR = {
  'Mercado Livre': '#FFE600',
  'Shopee': '#EE4D2D',
  'Shein': '#E85D75',
  'Temu': '#FF6A00',
  'Tiktok': '#FE2C55',
  'Magalu': '#0086FF',
  'Nuvem Shop': '#34D399',
};
const FALLBACK_COLOR = 'var(--text-muted)';

function channelColor(name) {
  return CHANNEL_COLOR[name] || FALLBACK_COLOR;
}

const ICONS = {
  clock: '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 3.2"/></svg>',
  truck: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="7" width="12" height="9"/><path d="M13 10h4l3.5 3.2V16H13z"/><circle cx="6" cy="18.3" r="1.7"/><circle cx="17" cy="18.3" r="1.7"/></svg>',
  moto: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="17" r="2.6"/><circle cx="18.5" cy="17" r="2.6"/><path d="M5 17h4l2.6-5.5h4L18.5 17M9.6 11.5l1.6-2.5h3"/></svg>',
  point: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-7.4 7-12a7 7 0 10-14 0c0 4.6 7 12 7 12z"/><circle cx="12" cy="9" r="2.2"/></svg>',
};

// Cor de cada TIPO de marcador na linha do tempo (nao muda por canal - o
// canal ja e identificado pelo cabecalho do card).
const ICON_COLOR = {
  clock: 'var(--text-muted)',
  truck: 'var(--s1, #3987e5)',
  moto: 'var(--warning)',
  point: 'var(--s7, #9085e9)',
};

function fmtClock(d) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d);
}
function fmtDateLine(d) {
  const s = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long', day: '2-digit', month: 'long' }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function fmtHm(iso) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

function tickClock() {
  const now = new Date();
  document.getElementById('clock').innerHTML = `${ICONS.clock}<span>${fmtClock(now)}</span>`;
  document.getElementById('dateLine').textContent = fmtDateLine(now);
}

const fmtDm = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit' });

function laneLabel(lane) {
  if (lane.dateKey === null) return 'Sem prazo definido';
  const label = fmtDm.format(new Date(`${lane.dateKey}T12:00:00Z`)).replace('.', '');
  if (lane.isToday) return `Hoje · ${label}`;
  if (lane.isPast) return `Atrasado · ${label}`;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function renderFechado(fechado) {
  document.getElementById('fechadoTotal').textContent = fechado.total;
  const list = document.getElementById('fechadoList');
  list.innerHTML = '';

  if (!fechado.lanes.length) {
    list.innerHTML = '<div class="empty-state">Nenhum pedido fechado aguardando envio agora.</div>';
    return;
  }

  const max = Math.max(...fechado.lanes.flatMap((l) => l.groups.map((g) => g.count)));

  for (const lane of fechado.lanes) {
    const laneEl = document.createElement('div');
    laneEl.className = `date-lane ${lane.isPast ? 'past' : ''} ${lane.isToday ? 'today' : ''}`;

    const barsHtml = lane.groups.map((g) => {
      const pct = Math.max(4, Math.round((g.count / max) * 100));
      return `
        <div class="bar-row">
          ${g.logoUrl ? `<img class="channel-logo" src="${g.logoUrl}" alt="" />` : `<span class="channel-logo"></span>`}
          <div class="bar-main">
            <div class="bar-top">
              <span class="bar-name">${g.channel}${g.modality ? `<span class="modality-tag">${g.modality}</span>` : ''}</span>
              <span class="count">${g.count}</span>
            </div>
            <div class="bar-track">
              <div class="bar-fill" style="width:${pct}%;background:${lane.isPast ? 'var(--critical)' : channelColor(g.channel)}"></div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    laneEl.innerHTML = `
      <div class="date-lane-label">${laneLabel(lane)}</div>
      <div class="bar-list">${barsHtml}</div>
    `;
    list.appendChild(laneEl);
  }
}

function pendingByChannel(fechado) {
  const map = new Map();
  for (const g of (fechado?.lanes || []).flatMap((l) => l.groups)) {
    map.set(g.channel, (map.get(g.channel) || 0) + g.count);
  }
  return map;
}

function renderEnviados(shippedToday, fechado) {
  document.getElementById('enviadosTotal').textContent = shippedToday.total;
  const list = document.getElementById('enviadosList');
  list.innerHTML = '';

  const pending = pendingByChannel(fechado);

  // Uniao dos canais que aparecem em enviados hoje OU no backlog pendente -
  // um canal com 0 enviados mas com pendencia ainda precisa aparecer aqui.
  const channels = new Map();
  for (const c of shippedToday.byChannel) channels.set(c.channel, c);
  for (const ch of pending.keys()) {
    if (!channels.has(ch)) channels.set(ch, { channel: ch, logoUrl: null, count: 0 });
  }

  if (!channels.size) {
    list.innerHTML = '<div class="empty-state">Nenhum envio registrado hoje ainda.</div>';
    return;
  }

  const ordered = [...channels.values()].sort((a, b) => b.count - a.count);

  for (const c of ordered) {
    const shipped = c.count;
    const stillPending = pending.get(c.channel) || 0;
    const totalFlow = shipped + stillPending;
    const shippedPct = totalFlow ? Math.round((shipped / totalFlow) * 100) : 0;

    const row = document.createElement('div');
    row.className = 'hourly-row';
    row.innerHTML = `
      <div class="hourly-top">
        ${c.logoUrl ? `<img class="channel-logo" src="${c.logoUrl}" alt="" />` : '<span></span>'}
        <span class="hourly-name">${c.channel}</span>
        <span class="progress-counts">
          <b>${shipped}</b> enviados
          ${stillPending ? `<span class="pending-count">· ${stillPending} pendentes</span>` : ''}
        </span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width:${shippedPct}%;background:${channelColor(c.channel)}"></div>
      </div>
    `;
    list.appendChild(row);
  }
}

// Cada segmento vira uma colunazinha: icone+horario em cima, a palavra
// (Corte / Coleta / Entrega) escrita por extenso embaixo.
function renderSegments(segments) {
  return `<div class="seg-row">${segments
    .map((seg) => `
      <div class="seg-col">
        <div class="seg-top">
          <span class="chip-icon" style="color:${ICON_COLOR[seg.icon]}">${ICONS[seg.icon]}</span>
          <span class="chip-time">${seg.time}</span>
        </div>
        <div class="seg-label">${seg.label}</div>
      </div>
    `).join('')}</div>`;
}

function renderDetailedCard(s) {
  const dayLines = s.dayLines || [];
  const card = document.createElement('div');
  card.className = 'schedule-card';
  card.innerHTML = `
    <div class="schedule-channel">${s.channel}</div>
    ${s.driver ? `<div class="driver-tag">${s.driver}</div>` : ''}

    <div class="route-group-row">
      ${dayLines.map((d) => `
        <div class="route-group">
          <div class="route-group-days">${d.days}${d.driver ? ` · ${d.driver}` : ''}</div>
          ${d.segments?.length ? renderSegments(d.segments) : ''}
          ${d.note ? `<div class="route-group-note">${d.note}</div>` : ''}
        </div>
      `).join('')}
    </div>

    ${s.notes?.length ? `<ul class="schedule-notes">${s.notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}
  `;
  return card;
}

// Canais "simples" (sem horario fixo, so um prazo em dias) cabem todos
// juntos num card so - economiza espaco pra ML/Shopee, que tem muito mais
// detalhe e precisam de mais lugar.
function renderCombinedCard(simpleChannels) {
  const card = document.createElement('div');
  card.className = 'schedule-card schedule-card-combined';
  card.innerHTML = `
    <div class="combined-rows">
      ${simpleChannels.map((s) => `
        <div class="combined-row">
          <span class="combined-channel">${s.channel}</span>
          <span class="combined-note">${(s.notes || []).join(' ')}</span>
        </div>
      `).join('')}
    </div>
  `;
  return card;
}

function renderSchedule(scheduleReference) {
  const list = document.getElementById('scheduleList');
  list.innerHTML = '';

  const detailed = (scheduleReference || []).filter((s) => (s.dayLines || []).length > 0);
  const simple = (scheduleReference || []).filter((s) => !(s.dayLines || []).length);

  for (const s of detailed) list.appendChild(renderDetailedCard(s));
  if (simple.length) list.appendChild(renderCombinedCard(simple));
}

function setSyncStatus(state, text) {
  const dot = document.getElementById('syncDot');
  dot.className = `sync-dot ${state}`;
  document.getElementById('syncText').textContent = text;
}

let scheduleRendered = false;

// dashboard.json e um arquivo ESTATICO (gerado pelo ciclo de sync - local
// via Express, producao via GitHub Actions) - nao ha endpoint de API, so
// esse arquivo, servido igual nos dois ambientes. Por isso a "saude" do
// sync so da pra inferir pela IDADE do arquivo (sem erro nem timestamp de
// tentativa - se o ultimo ciclo falhou, o arquivo so fica mais velho, o que
// ja aparece aqui). Producao roda a cada ~5-10min (GitHub Actions), por
// isso o limiar de "desatualizado" e bem mais folgado que o antigo ciclo
// local de 90s.
async function refresh() {
  try {
    const resp = await fetch('data/dashboard.json', { cache: 'no-store' });
    if (!resp.ok) {
      setSyncStatus('error', 'aguardando primeira sincronização…');
      return;
    }
    const data = await resp.json();
    renderFechado(data.fechado);
    renderEnviados(data.shippedToday, data.fechado);
    if (!scheduleRendered) {
      renderSchedule(data.scheduleReference);
      scheduleRendered = true;
    }

    const ageMin = Math.round((Date.now() - new Date(data.generatedAt).getTime()) / 60000);
    if (ageMin > 20) {
      setSyncStatus('stale', `dados de ${fmtHm(data.generatedAt)} (${ageMin}min atrás)`);
    } else {
      setSyncStatus('', `atualizado ${fmtHm(data.generatedAt)}`);
    }
  } catch (err) {
    setSyncStatus('error', 'falha ao carregar dashboard');
  }
}

tickClock();
setInterval(tickClock, 1000);
refresh();
setInterval(refresh, REFRESH_MS);

// recarrega a pagina inteira de tempos em tempos (tela fixa 24/7 - evita vazamento de memoria do navegador)
setTimeout(() => location.reload(), 6 * 60 * 60 * 1000);
