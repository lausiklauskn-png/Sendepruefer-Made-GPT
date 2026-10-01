/* Offline-Vorrat: ausschließlich mitgelieferte Ressourcen im eigenen Scope.
 * Geprüfte Mail-/Dateiinhalte und KI-Anfragen werden niemals gecacht.
 */
const CACHE_PREFIX = "sende-pruefer-" + encodeURIComponent(new URL(self.registration.scope).pathname) + "-";
const CACHE_VERSION = CACHE_PREFIX + "v43";
const CORE = ["./", "index.html", "start.html", "assets/start.css?v=1", "sende-pruefer.html", "handbuch.html", "anleitung.html", "inhaltspruefung.html", "icons/sende-pruefer-bild-gross.webp", "koeder.txt", "LIESMICH.md", "manifest.json", "icons/favicon-32.png", "icons/favicon-48.png", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/marke-72.png", "icons/sende-pruefer-bild.webp", "sicherheit.html", "impressum.html", "datenschutz.html", "assets/ablehnung.js", "assets/abschirmung.js", "assets/anbieter.js", "assets/anhaenge.js", "assets/inhaltspruefung.js", "assets/injection-ui.js", "assets/pruefer-anhang.js", "assets/pruefer-formate.js", "assets/pruefer-mail.js", "assets/pruefer.js", "assets/sbkim-init.js", "assets/schluesseltresor.js", "assets/siegel-inhalt.js", "assets/tresor-ui.js", "modules/01_storage.js", "modules/02_spore.js", "modules/03_embedding.js", "modules/04_match.js", "modules/05_anastomose.js", "modules/05b_nostr_relay.js", "modules/07_apoptose.js", "modules/15_membran.js", "modules/16_siegel.js", "modules/16b_andock_wizard.js", "modules/23_rendezvous.js", "modules/23_rendezvous_ui.js", "modules/25_pseudonym.js", "modules/noble-secp256k1.js", "vendor/pdfjs/pdf.min.js", "vendor/pdfjs/pdf.worker.min.js", "vendor/tesseract/lang/deu.traineddata", "vendor/tesseract/lang/eng.traineddata", "vendor/tesseract/lang/rus.traineddata", "vendor/tesseract/tesseract-core-lstm.wasm.js", "vendor/tesseract/tesseract-core-relaxedsimd-lstm.wasm.js", "vendor/tesseract/tesseract-core-simd-lstm.wasm.js", "vendor/tesseract/tesseract.min.js", "vendor/tesseract/worker.min.js", "beispiele/Testbild-versteckte-Anweisung.png", "beispiele/Testdatei-unsichtbarer-Text.pdf", "handbuch/01-postfach.jpg", "handbuch/02-einfuegen.jpg", "handbuch/03-original.jpg", "handbuch/04-ki-sicht.jpg", "handbuch/05-namen.jpg", "handbuch/06-aufgaben.jpg", "handbuch/07-wege.jpg", "handbuch/08-antwort.jpg", "handbuch/09-abschirmen.jpg", "handbuch/10-knoten.jpg", "handbuch/11-handy.jpg", "handbuch/12-selbsttest.jpg", "handbuch/szenen.json", "assets/installieren.js?v=1"];
const URLS = new Set(CORE.map(u => new URL(u, self.registration.scope).href));
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE_VERSION).then(c => Promise.all(CORE.map(u =>
    c.add(new Request(new URL(u, self.registration.scope).href, { cache: "reload" })))))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("message", e => {
  if (!e.data || e.data.type !== "sp-offline-status" || !e.ports || !e.ports[0]) return;
  e.waitUntil(caches.open(CACHE_VERSION).then(async c => {
    const gefunden = await Promise.all(CORE.map(u => c.match(new URL(u, self.registration.scope).href)));
    const fehlt = CORE.filter((u, i) => !gefunden[i]);
    e.ports[0].postMessage({ bereit: fehlt.length === 0, fehlt: fehlt.length, gesamt: CORE.length });
  }).catch(() => e.ports[0].postMessage({ bereit: false, fehlt: CORE.length, gesamt: CORE.length })));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || !URLS.has(e.request.url)) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const kopie = r.clone(); e.waitUntil(caches.open(CACHE_VERSION).then(c => c.put(e.request, kopie)).catch(() => {})); }
    return r;
  }).catch(() => caches.open(CACHE_VERSION).then(async c => {
    const r = await c.match(e.request);
    return r || new Response("Diese App-Ressource ist offline noch nicht verfügbar.", { status: 503, headers: { "content-type": "text/plain;charset=utf-8" } });
  })));
});
