import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createIdworksClient } from '../src/idworksClient.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envText = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const client = createIdworksClient({
  account: env.IDWORKS_ACCOUNT,
  email: env.IDWORKS_EMAIL,
  password: env.IDWORKS_PASSWORD,
});

const term = process.argv[2] || 'PONCHO HENRIQUE';
const res = await client.get('/sku', { Search: term, Simple: 1 });
const items = Array.isArray(res) ? res : res?.Result ?? [];
console.log(`Found ${items.length} items for "${term}"`);
for (const it of items) {
  console.log(JSON.stringify(it));
}
