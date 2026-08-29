import process from 'node:process';
process.loadEnvFile();

import { createSyncService } from '../src/sync.mjs';
import { closeBrowser } from '../src/idworksBrowserClient.mjs';

const sync = createSyncService({
  account: process.env.IDWORKS_ACCOUNT,
  email: process.env.IDWORKS_EMAIL,
  password: process.env.IDWORKS_PASSWORD,
});

const payload = await sync.runOnce();
console.log('generatedAt:', payload.generatedAt);
console.log('\nFECHADO total:', payload.fechado.total, 'past:', payload.fechado.totalPast);
for (const lane of payload.fechado.lanes) {
  console.log(`  [${lane.dateKey ?? 'sem-prazo'}]${lane.isPast ? ' ATRASADO' : ''}${lane.isToday ? ' HOJE' : ''}`);
  for (const g of lane.groups) console.log(`    ${g.groupKey}: ${g.count}`);
}
console.log('\nENVIADOS HOJE total:', payload.shippedToday.total);
for (const c of payload.shippedToday.byChannel) console.log(`  ${c.channel}: ${c.count}`);

const ml = payload.scheduleReference.find((s) => s.channel === 'Mercado Livre');
console.log('\nMercado Livre dayLines (ao vivo se a busca no ML funcionou):');
console.log(JSON.stringify(ml.dayLines, null, 2));

await closeBrowser();
process.exit(0);
