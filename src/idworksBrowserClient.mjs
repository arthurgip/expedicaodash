// Busca pedidos "Fechado" via automacao de navegador (Playwright), nao via
// REST direto.
//
// Motivo: GET /orders?IDStatusOrder=1 tem um bug confirmado na API REST do
// idworks - devolve sempre 0 registros, mesmo quando existem pedidos Fechado
// de verdade (confirmado: a tela real mostrava 101, o REST devolvia 0).
// Reproduzimos byte-a-byte a chamada que a SPA faz (mesmo token, mesma
// query string, mesmos headers) via fetch direto do Node e AINDA ASSIM deu
// 0 - so funciona quando a chamada sai de um navegador de verdade (a SPA
// roda em HTTP/2 via Chromium/Edge; o fetch nativo do Node usa HTTP/1.1).
// Como nao ha workaround conhecido do lado da nossa aplicacao, usamos a
// propria tela do idworks como fonte de dados so pra esse status.
//
// Os demais status (Enviado, Entregue) filtram normalmente via REST puro
// (ver idworksClient.mjs) - so o Fechado precisa desse contorno.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.join(__dirname, '..', '.browser-profile');

let contextPromise = null;

function getContext() {
  if (!contextPromise) {
    contextPromise = chromium.launchPersistentContext(PROFILE_DIR, {
      headless: true,
      channel: 'msedge',
    });
  }
  return contextPromise;
}

async function dismissCookieBanner(page) {
  const banner = page.locator('text=Permitir cookies no site');
  try {
    await banner.waitFor({ state: 'visible', timeout: 4_000 });
  } catch {
    return;
  }
  await page.locator('button').filter({ hasText: /^Aceitar$/ }).click();
  await banner.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function ensureLoggedIn(page, webBaseUrl, email, password) {
  await page.goto(`${webBaseUrl}/#/`);
  await dismissCookieBanner(page);
  if (!page.url().includes('signin')) return;

  await page.goto(`${webBaseUrl}/#/signin`);
  await dismissCookieBanner(page);
  await page.locator('#basic_email').fill(email);
  await page.locator('#basic_password').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.hash.includes('signin'), { timeout: 30_000 });
}

async function clickThroughSalesMenu(page) {
  const pedidosLink = page.locator('li.ant-menu-item').filter({ hasText: /^Pedidos$/ });
  if (await pedidosLink.first().isVisible().catch(() => false)) {
    await pedidosLink.first().click();
    return;
  }
  const vendasMenu = page.locator('div.ant-menu-submenu-title').filter({ hasText: /^Vendas$/ });
  await vendasMenu.first().click();
  await pedidosLink.first().waitFor({ state: 'visible', timeout: 10_000 });
  await pedidosLink.first().click();
}

async function goToOrders(page, webBaseUrl) {
  if (!page.url().startsWith(webBaseUrl)) {
    await page.goto(`${webBaseUrl}/#/`);
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    await dismissCookieBanner(page);
    try {
      await clickThroughSalesMenu(page);
      await dismissCookieBanner(page);
      await page.getByPlaceholder('Pesquisar').waitFor({ timeout: 10_000 });
      return;
    } catch {
      if (attempt === 3) throw new Error('Não consegui abrir a tela de Pedidos após 3 tentativas.');
      await page.waitForTimeout(1_000);
    }
  }
}

async function selectAntdOption(page, labelText, optionText) {
  const rect = await page.evaluate((label) => {
    function directText(el) {
      return Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    }
    const drawer = document.querySelector('.ant-drawer-body');
    const all = Array.from(drawer.querySelectorAll('*'));
    const lbl = all.find((el) => directText(el) === label);
    if (!lbl) return null;
    let wrapper = lbl.parentElement;
    for (let i = 0; i < 5 && wrapper; i++) {
      const select = wrapper.querySelector('.ant-select');
      if (select) {
        const r = select.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      wrapper = wrapper.parentElement;
    }
    return null;
  }, labelText);

  if (!rect) throw new Error(`Campo "${labelText}" não encontrado no filtro avançado.`);
  await page.mouse.click(rect.x, rect.y);
  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
  await dropdown.waitFor({ state: 'visible', timeout: 10_000 });
  await dropdown.locator('.ant-select-item-option').first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  await page.keyboard.type(optionText);
  await dropdown.locator('.ant-select-item-option').first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
  const option = dropdown.locator('.ant-select-item-option').filter({ hasText: optionText }).first();
  await option.click();
  await page.keyboard.press('Escape');
}

/**
 * Filtra Status pedido = Fechado (todos os canais) e devolve o JSON completo
 * que a API retornou pra tela - mesmos campos do REST normal (SalesChannelName,
 * ShippingEstimateHandlingLimitDate, etc.).
 */
export async function fetchFechadoOrders({ webBaseUrl, email, password }) {
  const context = await getContext();

  // Sempre abre uma aba NOVA (nunca reaproveita entre ciclos): reaproveitar
  // a mesma pagina reproduz um bug ja documentado nessa mesma automacao (ver
  // Handoff.md do projeto irmao "Rotina - Impressao de Pedidos", secao "BUG
  // DO LOTE 2") onde a SEGUNDA busca na mesma aba trava/nao dispara o
  // request de novo. O contexto (login/profile) continua persistente entre
  // ciclos - so a aba e descartavel.
  for (const p of context.pages()) {
    await p.close().catch(() => {});
  }
  const page = await context.newPage();

  try {
    await ensureLoggedIn(page, webBaseUrl, email, password);
    await goToOrders(page, webBaseUrl);

    await page.keyboard.press('Escape');
    await page.locator('button[title="Filtrar"]').click();
    await page.waitForSelector('.ant-drawer-body', { state: 'visible' });
    await page.getByRole('button', { name: 'Limpar', exact: true }).click();

    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/orders?') && resp.url().includes('IDStatusOrder=1') && resp.request().method() === 'GET',
      { timeout: 20_000 }
    );

    await selectAntdOption(page, 'Status pedido', 'Fechado');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();

    const resp = await responsePromise;
    return await resp.json();
  } finally {
    await page.close().catch(() => {});
  }
}

export async function closeBrowser() {
  if (!contextPromise) return;
  const context = await contextPromise;
  await context.close();
  contextPromise = null;
}
