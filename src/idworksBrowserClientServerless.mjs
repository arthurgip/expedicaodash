// Versao serverless (Vercel) da busca do Fechado via navegador. Diferente
// de src/idworksBrowserClient.mjs (uso local, com profile/sessao
// persistente), aqui cada chamada e uma funcao isolada, sem disco
// persistente - login do zero toda vez. Por isso e mais lenta (~15-20s) e
// so faz sentido rodar de tempos em tempos (a cada poucos minutos), nao a
// cada 90s como no local.
import chromium from '@sparticuz/chromium';
import { chromium as playwrightChromium } from 'playwright-core';

async function dismissCookieBanner(page) {
  const banner = page.locator('text=Permitir cookies no site');
  try {
    await banner.waitFor({ state: 'visible', timeout: 3_000 });
  } catch {
    return;
  }
  await page.locator('button').filter({ hasText: /^Aceitar$/ }).click();
  await banner.waitFor({ state: 'hidden', timeout: 4_000 }).catch(() => {});
}

async function login(page, webBaseUrl, email, password) {
  const resp = await page.goto(`${webBaseUrl}/#/signin`, { waitUntil: 'domcontentloaded' });
  await dismissCookieBanner(page);
  // O bundle JS da SPA demora mais pra baixar/executar nesse ambiente
  // serverless (CPU mais fraca/fria) do que num PC local - espera o campo
  // aparecer diretamente (auto-wait do Playwright), em vez de confiar em
  // "networkidle" (pouco confiavel com SPAs que tem chamadas de fundo).
  try {
    await page.locator('#basic_email').waitFor({ state: 'visible', timeout: 30_000 });
  } catch (err) {
    const title = await page.title().catch(() => '?');
    const bodyText = await page.locator('body').innerText({ timeout: 2000 }).catch(() => '?');
    const status = resp?.status();
    throw new Error(
      `login falhou ao achar #basic_email | goto status=${status} | url=${page.url()} | title="${title}" | body(300)="${bodyText.slice(0, 300).replace(/\s+/g, ' ')}"`
    );
  }
  await page.locator('#basic_email').fill(email);
  await page.locator('#basic_password').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.hash.includes('signin'), { timeout: 25_000 });
}

async function clickThroughSalesMenu(page) {
  const pedidosLink = page.locator('li.ant-menu-item').filter({ hasText: /^Pedidos$/ });
  if (await pedidosLink.first().isVisible().catch(() => false)) {
    await pedidosLink.first().click();
    return;
  }
  const vendasMenu = page.locator('div.ant-menu-submenu-title').filter({ hasText: /^Vendas$/ });
  await vendasMenu.first().click();
  await pedidosLink.first().waitFor({ state: 'visible', timeout: 8_000 });
  await pedidosLink.first().click();
}

async function goToOrders(page) {
  await dismissCookieBanner(page);
  await clickThroughSalesMenu(page);
  await dismissCookieBanner(page);
  await page.getByPlaceholder('Pesquisar').waitFor({ timeout: 8_000 });
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
  await dropdown.waitFor({ state: 'visible', timeout: 8_000 });
  await dropdown.locator('.ant-select-item-option').first().waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});
  await page.keyboard.type(optionText);
  await dropdown.locator('.ant-select-item-option').first().waitFor({ state: 'visible', timeout: 4_000 }).catch(() => {});
  const option = dropdown.locator('.ant-select-item-option').filter({ hasText: optionText }).first();
  await option.click();
  await page.keyboard.press('Escape');
}

async function attemptFetch(browser, webBaseUrl, email, password) {
  const page = await browser.newPage();
  try {
    await login(page, webBaseUrl, email, password);
    await goToOrders(page);

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

// O carregamento da SPA e instavel nesse ambiente serverless (CPU
// fria/compartilhada) - falha uma fatia real das vezes so no login. Como
// cada tentativa e independente (pagina nova), vale tentar de novo dentro
// da mesma execucao antes de desistir, aproveitando o mesmo browser ja
// aberto (evita pagar o custo de lancar o Chromium de novo).
export async function fetchFechadoOrdersServerless({ webBaseUrl, email, password }, { retries = 2 } = {}) {
  const browser = await playwrightChromium.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    let lastErr;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await attemptFetch(browser, webBaseUrl, email, password);
      } catch (err) {
        lastErr = err;
        console.warn(`[idworksBrowserClientServerless] tentativa ${attempt}/${retries} falhou: ${err.message}`);
      }
    }
    throw lastErr;
  } finally {
    await browser.close();
  }
}
