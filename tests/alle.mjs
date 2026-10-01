/* 0 = vollständig bestanden, 1 = Fehler, 2 = Browserteil ungeprüft.
 * --node beschränkt den angeforderten Umfang ausdrücklich auf Node-Prüfungen.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0, skipped = 0;
const suites = ['tests/injection.mjs', 'tests/offline.mjs', 'tests/freigabe-ui.mjs', 'tests/smoke.mjs'];
if (!process.argv.includes('--node')) suites.push('tests/browser-injection.mjs');
for (const file of suites) {
  const r = spawnSync(process.execPath, [file], { cwd: root, env: { ...process.env, SP_NUR_NODE: process.argv.includes('--node') ? '1' : '' }, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  if (r.status === 2) skipped++; else if (r.status !== 0) failures++;
}
console.log(`\n${process.argv.includes('--node') ? 'Node-Umfang' : 'Gesamtumfang'}: ${failures} fehlerhafte Prüfläufe · ${skipped} nicht vollständig ausführbare Prüfläufe.`);
process.exitCode = failures ? 1 : skipped ? 2 : 0;
