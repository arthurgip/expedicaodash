// Captura TODAS as chamadas de rede relacionadas a pedidos que a tela real
// do idworks faz ao filtrar Status=Fechado, pra achar qual delas de fato
// devolve os 101 registros (a REST /orders simples nao esta batendo).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siblingSrc = path.join(__dirname, '..', '..', '..', 'Rotina - Impressão de Pedidos', 'src');

const { openSession } = await import(`file://${path.join(siblingSrc, 'session.js')}`);
const { goToOrders, openAdvancedFilter, searchByStatusAndChannel, readTotalCount } = await import(`file://${path.join(siblingSrc, 'orders.js')}`);

const captured = [];

async function main() {
  const { context, page } = await openSession({ headless: true });

  page.on('response', async (resp) => {
    const url = resp.url();
    const method = resp.request().method();
    if (!/order/i.test(url) || url.includes('.js') || url.includes('.css')) return;
    let bodyInfo = '';
    let json = null;
    try {
      json = await resp.json();
      const arr = Array.isArray(json) ? json : json?.Result;
      if (Array.isArray(arr)) bodyInfo = `array[${arr.length}]`;
      else bodyInfo = `keys:${Object.keys(json || {}).slice(0, 8).join(',')}`;
    } catch {
      bodyInfo = '(nao-JSON ou vazio)';
    }
    captured.push({ method, url, status: resp.status(), bodyInfo, json });
  });

  await goToOrders(page);
  await openAdvancedFilter(page);
  await searchByStatusAndChannel(page, { status: 'Fechado' });
  await page.waitForTimeout(2000);

  const total = await readTotalCount(page);
  console.log('Total mostrado na tela (badge "N Registros"):', total);

  console.log('\nTodas as chamadas relacionadas a "order" capturadas:');
  for (const c of captured) {
    console.log(`[${c.method} ${c.status}] ${c.bodyInfo}  ${decodeURIComponent(c.url).slice(0, 200)}`);
  }

  const winner = captured.find((c) => c.url.includes('/orders?') && c.bodyInfo.startsWith('array['));
  if (winner) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path.join(__dirname, 'fechado-sample.json'), JSON.stringify(winner.json.slice(0, 3), null, 2), 'utf-8');
    console.log('\nAmostra de 3 pedidos salva em scripts/fechado-sample.json');
    console.log('Campos do 1o item:', Object.keys(winner.json[0]).join(', '));
  }

  await context.close();
}

main().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
