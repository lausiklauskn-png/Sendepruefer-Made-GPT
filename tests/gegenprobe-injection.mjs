/* Reale gezielte Mutationen in Wegwerfkopien. Nur der passende rote Test zählt. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cases = [
  ['Befundfreigabe entfernt', 'assets/inhaltspruefung.js', 'if (r.befunde.length && !bestaetigt)', 'if (false)', 'tests/injection.mjs', 'Befund verlangt bewusste Freigabe'],
  ['Unvollständige Prüfung freigegeben', 'assets/inhaltspruefung.js', 'if (!r || r.abdeckung !== "geprueft")', 'if (!r)', 'tests/injection.mjs', 'Teilprüfung kann nicht freigegeben werden'],
  ['Zusatzbefunde nicht zentral übernommen', 'assets/inhaltspruefung.js', 'merge(r, v.befunde || []);', 'merge(r, []);', 'tests/injection.mjs', 'Später LSB-Fund steht im zentralen Bericht'],
  ['Freigabe nur am Maskentext gebunden', 'assets/injection-ui.js', 'return r.freigabeKey || r.text;', 'return r.text;', 'tests/freigabe-ui.mjs', 'Gleicher Maskentext erlaubt keine geänderten Originaldaten'],
  ['Originaländerung nach API-Aufruf ignoriert', 'sende-pruefer.html', 'pruefung(m).freigabeKey !== r.freigabeKey', 'false', 'tests/freigabe-ui.mjs', 'Verzögerte Antwort überschreibt geänderte Originaldaten nicht'],
];
let failures = 0;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-gegenprobe-'));
try {
  for (const [name, file, anchor, replacement, suite, expected] of cases) {
    const copy = path.join(temp, 'app'); fs.rmSync(copy, { recursive: true, force: true });
    fs.cpSync(root, copy, { recursive: true, filter: source => !['node_modules', '.git'].includes(path.basename(source)) });
    const target = path.join(copy, file), source = fs.readFileSync(target, 'utf8');
    if (source.split(anchor).length !== 2) { failures++; console.log('✗ ROT: Toter oder mehrdeutiger Anker: ' + name); continue; }
    fs.writeFileSync(target, source.replace(anchor, replacement));
    const run = spawnSync(process.execPath, [suite], { cwd: copy, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 60000 });
    const caught = run.status === 1 && (run.stdout || '').includes('✗ ROT: ' + expected);
    if (!caught) failures++;
    console.log((caught ? '✓ gefangen: ' : '✗ ROT: Nicht gezielt gefangen: ') + name);
  }
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
console.log(`${cases.length - failures} Mutationen gezielt gefangen · ${failures} Fehler`);
process.exitCode = failures ? 1 : 0;
