// Cliente REST para a API do HUB idworks.
// Base URL: https://{account}.api-idworks.com.br/1.0
// Auth: POST /user/signin/local -> {token|accessToken}, depois Bearer <token>.
// Confirmado contra a API real da conta "gip" em 2026-08-06 (ver scripts/discover-*.mjs).

const MIN_DELAY_MS = 400; // espaçamento entre chamadas pra nao bater rate limit (429 visto em rajadas)

export function createIdworksClient({ account, email, password }) {
  const baseUrl = `https://${account}.api-idworks.com.br/1.0`;
  let token = null;
  let lastCallAt = 0;

  async function pace() {
    const wait = lastCallAt + MIN_DELAY_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
  }

  async function login() {
    await pace();
    const resp = await fetch(`${baseUrl}/user/signin/local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`Login idworks falhou (${resp.status}): ${text.slice(0, 300)}`);
    const data = JSON.parse(text);
    token = data.token || data.accessToken;
    if (!token) throw new Error(`Login idworks sem token na resposta: ${text.slice(0, 300)}`);
  }

  async function get(path, params = {}, _retried = false) {
    if (!token) await login();
    await pace();

    const url = new URL(`${baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (resp.status === 401 && !_retried) {
      token = null;
      await login();
      return get(path, params, true);
    }

    if (resp.status === 429) {
      const retryAfter = Number(resp.headers.get('Retry-After') || '2');
      await new Promise((r) => setTimeout(r, (retryAfter || 2) * 1000));
      return get(path, params, _retried);
    }

    const text = await resp.text();
    if (!resp.ok) throw new Error(`GET ${path} falhou (${resp.status}): ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }

  /** Pagina um endpoint de listagem ate a pagina vir vazia ou atingir maxPages. */
  async function getAllPages(path, params, { maxPages = 8 } = {}) {
    const all = [];
    for (let page = 1; page <= maxPages; page++) {
      const res = await get(path, { ...params, Page: page });
      const items = Array.isArray(res) ? res : res?.Result ?? [];
      if (!items.length) break;
      all.push(...items);
      if (items.length < 2000) break; // pagina nao cheia = ultima pagina
      if (page === maxPages) {
        console.warn(`[idworksClient] getAllPages(${path}) atingiu maxPages=${maxPages} — pode haver mais dados nao coletados.`);
      }
    }
    return all;
  }

  return { get, getAllPages, baseUrl };
}
