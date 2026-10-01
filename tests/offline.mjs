/* Echter SW-Code mit Speicher-/Netzadaptern; kein Browser-CacheStorage-Test. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
function ok(s, yes) { yes ? pass++ : fail++; console.log((yes ? '✓ ' : '✗ ROT: ') + s); }
function worker({ scope = 'https://example.test/Sende-Pruefer/', failURL = null } = {}) {
  const data = new Map(), handlers = {}, deleted = [];
  let skip = 0, claim = 0, offline = false;
  const cache = key => {
    if (!data.has(key)) data.set(key, new Map());
    const m = data.get(key);
    return {
      async add(q) { if (q.url === failURL) throw new Error('TEST-DOWNLOAD'); m.set(q.url, new Response('ASSET')); },
      async match(q) { return m.get(typeof q === 'string' ? q : q.url)?.clone(); },
      async put(q, r) { m.set(typeof q === 'string' ? q : q.url, r); }
    };
  };
  const c = vm.createContext({ URL, Request, Response, Set, Promise,
    self: { registration: { scope }, clients: { claim() { claim++; } }, skipWaiting() { skip++; }, addEventListener(t, f) { handlers[t] = f; } },
    caches: { open: async k => cache(k), keys: async () => [...data.keys()], delete: async k => { deleted.push(k); return data.delete(k); } },
    fetch: async () => { if (offline) throw new Error('TEST-OFFLINE'); return new Response('ONLINE'); }
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), c);
  const core = vm.runInContext('CORE', c), prefix = vm.runInContext('CACHE_PREFIX', c), version = vm.runInContext('CACHE_VERSION', c);
  return { data, handlers, core, prefix, version, deleted, skip: () => skip, claim: () => claim, offline: v => { offline = v; }, scope };
}
async function event(w, type, values = {}) {
  const promises = []; let answer;
  const e = { ...values, waitUntil(p) { promises.push(p); }, respondWith(p) { answer = p; } };
  w.handlers[type](e);
  if (answer) answer = await answer;
  await Promise.all(promises);
  return answer;
}
async function state(w) {
  let out;
  await event(w, 'message', { data: { type: 'sp-offline-status' }, ports: [{ postMessage(x) { out = x; } }] });
  return out;
}
const w = worker();
ok('Alle Offline-Ressourcen existieren im Paket', w.core.every(u => u === './' || fs.existsSync(path.join(ROOT, u.split('?')[0]))));
ok('Inhaltsprüfung und Freigabe stehen im Vorrat', w.core.includes('assets/inhaltspruefung.js') && w.core.includes('assets/injection-ui.js'));
ok('PDF.js, OCR-WASM und drei Sprachen stehen im Vorrat', ['vendor/pdfjs/pdf.worker.min.js', 'vendor/tesseract/tesseract-core-lstm.wasm.js', 'vendor/tesseract/lang/deu.traineddata', 'vendor/tesseract/lang/eng.traineddata', 'vendor/tesseract/lang/rus.traineddata'].every(x => w.core.includes(x)));
ok('Vorrat enthält nur eigene relative Ressourcen', w.core.every(x => !/^https?:|^\/|\.\./.test(x)));
ok('Ohne installierte Ressourcen kein Offline-bereit-Status', !(await state(w)).bereit);
await event(w, 'install');
ok('Erfolgreiche Installation speichert alle Ressourcen', w.data.get(w.version).size === w.core.length);
ok('skipWaiting erst nach erfolgreicher Installation', w.skip() === 1);
ok('Vollständiger Vorrat meldet Offline bereit', (await state(w)).bereit);
w.data.get(w.version).delete(new URL('vendor/tesseract/lang/deu.traineddata', w.scope).href);
ok('Ein fehlendes Sprachmodell entwertet Offline bereit', !(await state(w)).bereit && (await state(w)).fehlt === 1);
await event(w, 'install');
w.data.set(w.prefix + 'v40', new Map()); w.data.set('auslieferung-pruefer-v1', new Map());
const other = worker({ scope: 'https://example.test/Andere-Sender-App/' });
w.data.set(other.version, new Map());
await event(w, 'activate');
ok('Aktivierung löscht ausschließlich alte Caches dieses Scopes', w.deleted.length === 1 && w.deleted[0] === w.prefix + 'v40');
ok('Fremder Prüfercache und anderer Sendercache bleiben erhalten', w.data.has('auslieferung-pruefer-v1') && w.data.has(other.version));
ok('Aktivierung übernimmt eigene Clients', w.claim() === 1);
w.offline(true);
const r = await event(w, 'fetch', { request: new Request(new URL('sende-pruefer.html', w.scope)) });
ok('Offline liefert eigene HTML-Ressource aus Cache', r.status === 200 && await r.text() === 'ASSET');
w.data.get(w.version).delete(new URL('vendor/tesseract/worker.min.js', w.scope).href);
const missing = await event(w, 'fetch', { request: new Request(new URL('vendor/tesseract/worker.min.js', w.scope)) });
ok('Fehlender OCR-Worker liefert 503 statt HTML als JavaScript', missing.status === 503 && !String(await missing.text()).includes('<html'));
ok('KI-POST wird nicht abgefangen oder gecacht', await event(w, 'fetch', { request: new Request('https://api.anthropic.com/v1/messages', { method: 'POST', body: 'privat' }) }) === undefined);
ok('Auch POST an einen eigenen Ressourcenpfad wird nicht abgefangen', await event(w, 'fetch', { request: new Request(new URL('sende-pruefer.html', w.scope), { method: 'POST', body: 'privat' }) }) === undefined);
ok('Fremde GET-Anfrage wird nicht abgefangen', await event(w, 'fetch', { request: new Request('https://outside.test/x') }) === undefined);
ok('Unbekannter lokaler Benutzerdatenpfad wird nicht gecacht', await event(w, 'fetch', { request: new Request(new URL('private-mail.txt', w.scope)) }) === undefined);
const bad = worker({ failURL: new URL('vendor/tesseract/lang/deu.traineddata', w.scope).href });
let installFailed = false; try { await event(bad, 'install'); } catch { installFailed = true; }
ok('Fehlgeschlagener Download lässt Installation scheitern', installFailed && bad.skip() === 0);
ok('Teilweise Installation meldet niemals Offline bereit', !(await state(bad)).bereit);
console.log(`\n${pass} bestanden · ${fail} Fehler · Service-Worker-Testmodell, keine Browser-Abnahme`);
process.exitCode = fail ? 1 : 0;
