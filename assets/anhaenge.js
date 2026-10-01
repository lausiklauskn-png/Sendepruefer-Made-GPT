/* Sende-Prüfer — Anhänge prüfen (Klaus 2026-09-28: „Anhänge, hin und zurück").
 *
 * Eine Mail bekommt Anhänge (📎, oder aus einer .eml mit Anhang). Jeder
 * Anhang wird geprüft: was steckt darin, das man nicht sieht? Die Prüfung
 * läuft auf dem Gerät, nichts davon geht ins Netz.
 *
 * ⚠ KEIN VIRENSCANNER UND KEINE STEGANOGRAFIE-SUCHE. Gesucht werden
 * Strukturen, die sich ohne Deutung erkennen lassen: Daten hinter dem
 * Bildende, Metadaten, Skripte, Makros, Aktionen, Verweise nach außen, eine
 * Endung, die nicht zum Dateikopf passt — und Angaben im TEXT einer Datei
 * (SVG, Word, Excel, PowerPoint), die Modul 25 wie im Mailtext findet.
 *
 * ⚠ BENANNTE GRENZEN dieser Fassung: Text IN einem Bild liest seit Stufe 2 A
 * die Texterkennung auf dem Gerät (Tesseract aus vendor/tesseract/); liest sie
 * nichts, heißt es „Text im Bild ungeprüft", nie sauber. Der Seitentext eines PDFs schon (bis 100 Seiten, pdf.js aus
 * vendor/pdfjs/) — fehlt pdf.js, heißt er „ungeprüft". An die KI geht weiterhin
 * nur der Mailtext, keine Datei.
 *
 * Die app-eigene Auswertung ergänzt den gemeinsamen Prüfkern; diese
 * Datei hängt sich über einen Beobachter in die Leseansicht und liest die
 * Mail über die globalen Namen des Seiten-Skripts (aktuell, jetztSpeichern,
 * finde, mailNamen). Fehlt diese Datei, läuft die Seite wie vorher.
 *
 * Die Prüfung selbst steht in assets/pruefer-anhang.js, PDF-Befunde in
 * assets/pruefer-formate.js, die KI-Anweisungen in assets/pruefer-mail.js —
 * alle drei byte-1:1 aus dem Auslieferungsprüfer,
 * dort pflegen, hier neu kopieren. Diese Datei trägt nur die Oberfläche.
 */
(function (welt) {
  "use strict";

  /* ══ DER PRÜFTEIL STEHT IN assets/pruefer-anhang.js — byte-1:1 aus dem
   * Auslieferungsprüfer, dort gepflegt, hier per SHA-256 gepinnt
   * (Klaus 2026-09-29: „bitte so"). Diese Datei trägt nur noch die
   * Oberfläche. Die Seite ist voll; der Prüfteil wird deshalb von HIER
   * nachgeladen, nicht über eine eigene Zeile in der Seite. */
  if (typeof document === "undefined") return;
  /* Reihenfolge: PDF-Prüfer → Mail-Prüfer (trägt die Liste der
   * KI-Anweisungen, die auch im Seitentext eines PDFs gesucht wird) →
   * Anhang-Prüfer. Fehlt einer der ersten zwei, läuft es weiter — der
   * Anhang-Prüfer nennt dann, was ungeprüft blieb. */
  function laden(pfad, da) {
    return da() ? Promise.resolve(true) : new Promise(function (res) {
      var s = document.createElement("script"); s.src = pfad;
      s.onload = function () { res(!!da()); }; s.onerror = function () { res(false); };
      document.head.append(s);
    });
  }
  var bereit = laden("assets/pruefer-formate.js", function () { return welt.PrueferFormate; })
    .then(function () { return laden("assets/pruefer-mail.js", function () { return welt.PrueferMail; }); })
    .then(function () { return laden("assets/pruefer.js", function () { return welt.Auslieferungspruefer; }); })
    .then(function () { return laden("assets/pruefer-anhang.js", function () { return welt.PrueferAnhang; }); })
    .then(function (da) {
      if (!da) throw new Error("fehlt");
      /* pdf.js liegt im eigenen Ordner vendor/pdfjs/ (Klaus 2026-09-30: die
       * App läuft für sich allein, ohne Workflow PDF daneben). Nicht im
       * Installations-Vorrat; geholt erst, wenn ein PDF kommt. */
      if (welt.PrueferAnhang.pfade) welt.PrueferAnhang.pfade({ pdfjs: new URL("vendor/pdfjs/", location.href).href, tesseract: new URL("vendor/tesseract/", location.href).href });
      return welt.PrueferAnhang;
    });
  function pruefe(name, bytes) {
    var I = welt.SPInhalt;
    if (!I) return Promise.resolve({ art: "unbekannt", artName: "ungeprüft", befunde: [], hinweise: ["Der Inhaltsprüfer fehlt."], grenzen: ["Der Inhaltsprüfer fehlt."], abdeckung: "ungeprueft", status: "ungeprueft", sicher: false });
    var zuGross = bytes.byteLength > 25 * 1024 * 1024;
    return bereit.then(function (A) {
      if (zuGross) return { art: A.artVon(new Uint8Array(bytes)), artName: "zu große Datei", befunde: [], text: null, sicher: false, abdeckung: "ungeprueft", grenzen: ["Datei über 25 MiB nicht geöffnet."], hinweise: [] };
      return A.pruefe(name, bytes);
    }, function () {
      return { art: "unbekannt", artName: "nicht geprüft", befunde: [], text: "", sicher: false,
        prueferFehlt: true, hinweise: ["Der Anhang-Prüfer (assets/pruefer-anhang.js) ist nicht geladen — dieser Anhang ist UNGEPRÜFT, nicht sauber."] };
    }).then(function (r) { return I.datei(r, name); }).catch(function () {
      return I.datei({ art: "unbekannt", befunde: [], text: null, hinweise: ["Dateiprüfung fehlgeschlagen — ungeprüft."], sicher: false }, name);
    });
  }
  function artVon(b) { return welt.PrueferAnhang ? welt.PrueferAnhang.artVon(b) : "unbekannt"; }
  function gross(n) { return welt.PrueferAnhang ? welt.PrueferAnhang.gross(n) : n + " Bytes"; }
  var API = welt.SPAnhangUI = {};

  /* ══ SICHERE FASSUNG — ein Bild wird auf einer Leinwand neu gezeichnet.
   * Übrig bleiben nur die Bildpunkte: keine Metadaten, kein Anhängsel, bei
   * SVG kein Skript. Eine SVG wird dabei zum PNG. */
  function sichereFassung(a) {
    var ist = artVon(new Uint8Array(0));
    return a.blob.arrayBuffer().then(function (x) {
      ist = artVon(new Uint8Array(x));
      var blob = ist === "svg" ? new Blob([x], { type: "image/svg+xml" }) : new Blob([x], { type: a.typ || "image/*" });
      var url = URL.createObjectURL(blob);
      return new Promise(function (res, rej) {
        var img = new Image();
        img.onload = function () { res(img); }; img.onerror = function () { rej(new Error("Das Bild ließ sich nicht zeichnen.")); };
        img.src = url;
      }).then(function (img) {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth || 800, h = img.naturalHeight || 600, c = document.createElement("canvas");
        c.width = w; c.height = h; c.getContext("2d").drawImage(img, 0, 0, w, h);
        var png = ist === "png" || ist === "svg" || ist === "gif";
        return new Promise(function (res) { c.toBlob(res, png ? "image/png" : "image/jpeg", 0.92); }).then(function (neu) {
          var stamm = String(a.name).replace(/\.[^.]*$/, "") || "bild";
          return { blob: neu, name: stamm + "-sicher." + (png ? "png" : "jpg") };
        });
      });
    });
  }

  /* ══ OBERFLÄCHE */
  var g = function (n) { try { return welt.eval("typeof " + n + " !== 'undefined' ? " + n + " : null"); } catch (_e) { return null; } };
  function el(tag, attrs) {
    var e = document.createElement(tag), k;
    for (k in attrs || {}) { var v = attrs[k]; if (v == null || v === false) continue;
      if (k === "class") e.className = v; else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); }
    for (var i = 2; i < arguments.length; i++) if (arguments[i] != null) e.append(arguments[i]);   // Namen sind Text, nie HTML
    return e;
  }
  var ergebnisse = new Map(); // Anhang-id, Blob-Identität und Dateiname binden den Stand.
  function ergebnis(a) {
    var alt = ergebnisse.get(a.id);
    if (!alt || alt.blob !== a.blob || alt.name !== a.name) {
      var eintrag = { blob: a.blob, name: a.name, ergebnis: null };
      eintrag.promise = Promise.resolve().then(function () {
        if (a.blob.size > 25 * 1024 * 1024) return welt.SPInhalt.datei({ art: "unbekannt", befunde: [], text: null, abdeckung: "ungeprueft", grenzen: ["Datei über 25 MiB nicht geöffnet."], hinweise: [] }, a.name);
        return a.blob.arrayBuffer().then(function (x) { return pruefe(a.name, x); });
      }).catch(function () {
        return { name: a.name, art: "unbekannt", artName: "ungeprüft", befunde: [], text: null, sicher: false, hinweise: [], grenzen: ["Datei nicht lesbar oder Inhaltsprüfer fehlt."], abdeckung: "ungeprueft", status: "ungeprueft", methoden: [] };
      }).then(function (r) { eintrag.ergebnis = r; return r; });
      ergebnisse.set(a.id, eintrag); alt = eintrag;
    }
    return alt.promise;
  }
  function angabenPruefen(m, a, r) {
    var finde = g("finde"), mailNamen = g("mailNamen");
    var funde = r.text && finde ? finde(r.text, mailNamen ? mailNamen(m) : []) : [];
    r.befunde = r.befunde.filter(function (f) { return f.kennung !== "ANHANG-ANGABEN"; });
    if (funde.length && welt.SPInhalt) {
      var z = {}; funde.forEach(function (f) { z[f.sorte] = (z[f.sorte] || []).concat(f.wert); });
      welt.SPInhalt.ergaenze(r, [{ kennung: "ANHANG-ANGABEN", satz: "Im Text der Datei stehen " + funde.length + " Angabe(n), die im Mailtext verdeckt würden: " + Object.keys(z).map(function (s) { return z[s].length + "× " + s + " (" + z[s].slice(0, 3).join(", ") + ")"; }).join(" · ") + ". In der Datei selbst bleiben sie stehen." }]);
    } else if (welt.SPInhalt) welt.SPInhalt.ergaenze(r, []);
    return funde;
  }
  function aktualisiereAngaben(m) {
    berichtStand(m).forEach(function (e, i) {
      if (!e.ergebnis || !welt.SPInhalt) return;
      var a = m.anhaenge[i], li = Array.from(document.querySelectorAll("#anhang-liste > li")).find(function (x) { return x.dataset.anhang === a.id; });
      if (!li) return;
      li.dataset.befunde = String(e.ergebnis.befunde.length);
      var liste = li.querySelector(".anhang-befunde");
      Array.from(liste.querySelectorAll('[data-kennung="OHNE"],[data-kennung="UNGEPRUEFT"]')).forEach(function (x) { x.remove(); });
      var alt = li.querySelector('[data-kennung="ANHANG-ANGABEN"]'); if (alt) alt.remove();
      var f = e.ergebnis.befunde.find(function (x) { return x.kennung === "ANHANG-ANGABEN"; });
      li.dataset.angaben = String(e.ergebnis.text && g("finde") ? g("finde")(e.ergebnis.text, g("mailNamen") ? g("mailNamen")(m) : []).length : 0);
      if (f) liste.append(el("li", { "data-kennung": f.kennung }, f.satz));
      if (!e.ergebnis.befunde.length) liste.append(el("li", { "data-kennung": e.ergebnis.abdeckung === "geprueft" ? "OHNE" : "UNGEPRUEFT" }, e.ergebnis.abdeckung === "geprueft" ? "Keine Hinweise im genannten Prüfumfang." : "Keine Hinweise im geprüften Teil; die Datei ist nicht vollständig geprüft."));
      var stand = li.querySelector("[data-anhang-status]"); if (stand) { stand.textContent = welt.SPInhalt.zusammenfassung(e.ergebnis); stand.className = "meldung " + (e.ergebnis.status === "unauffaellig" ? "gut" : "warn"); }
    });
  }
  function berichtStand(m) {
    return (m.anhaenge || []).map(function (a) {
      var e = ergebnisse.get(a.id);
      var r = e && e.blob === a.blob && e.name === a.name ? e.ergebnis : null;
      if (r) angabenPruefen(m, a, r);
      return { name: a.name, ergebnis: r };
    });
  }
  function berichtText(m) {
    var I = welt.SPInhalt;
    if (!I) return "Inhaltsprüfer fehlt — ungeprüft.";
    var mail = g("ganzeMail"), eintraege = [];
    if (mail) eintraege.push({ name: "Mailinhalt (eigener Auftrag ausgenommen)", ergebnis: I.text(mail(m), "Mailinhalt") });
    return I.bericht(eintraege.concat(berichtStand(m)));
  }
  function neueId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function speichern(m) { var f = g("jetztSpeichern"); if (f) f(m); }
  function hinzufuegen(m, dateien) {
    m.anhaenge = m.anhaenge || [];
    for (var i = 0; i < dateien.length; i++) {
      var d = dateien[i];
      m.anhaenge.push({ id: neueId(), name: d.name || "anhang", typ: d.type || "", groesse: d.size, blob: d });
    }
    speichern(m); zeichne();
  }
  function herunterladen(blob, name) {
    var a = document.createElement("a"), u = URL.createObjectURL(blob);
    a.href = u; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
    welt.__spAnhangLetzter = name;
  }

  /* Welche Datei nimmt DIESER Browser beim Teilen an? Gefragt wird mit
     navigator.canShare — derselben Frage, die Chrome, Safari (iOS) und Edge
     beantworten; eine Liste von Dateiarten je Browser wird nicht geraten.
     Drei Ausgänge: "ja" · "nein" · "ohne" (der Browser kann gar nicht teilen). */
  function teilbar(a) {
    if (!navigator.share) return "ohne";
    if (!navigator.canShare) return "nein";
    try { return navigator.canShare({ files: [new File([a.blob], a.name, { type: a.typ || a.blob.type || "" })] }) ? "ja" : "nein"; }
    catch (_e) { return "nein"; }
  }
  var TEILBAR_TEXT = { ja: "📤 geht beim Teilen mit", nein: "✗ dieser Browser teilt diese Art nicht — nur über „Als .eml speichern“ oder ⬇ einzeln", ohne: "Teilen gibt es in diesem Browser nicht — nur über „Als .eml speichern“ oder ⬇ einzeln" };

  /* ══ WAS JETZT TUN · DIE STELLE IM BILD (Klaus 2026-10-01) ══════════════
     „… nur noch eine Handlungsoption bereitstellen, sodass jemand weiß, was er
     machen soll, falls er in Panik gerät." Die Schritte kommen aus dem
     Prüfkern (wasTun), je Art einmal. Und bei einem Bild wird die Stelle in
     einer KOPIE rot markiert — die Datei bleibt unverändert. */
  function wasTunKasten(kennung) {
    var A = welt.PrueferAnhang, sch = A && A.wasTun ? A.wasTun(kennung) : [];
    if (!sch.length) return null;
    var ol = el("ol", { style: "margin:4px 0 0;padding-left:1.4em" });
    sch.forEach(function (x) { ol.append(el("li", null, x)); });
    return el("li", { "data-was-tun": kennung, style: "border-left:3px solid #2a8a5a;padding:4px 8px;list-style:none" }, el("b", null, "Was jetzt tun"), ol);
  }
  function ruhigAnhaengen(liste, befunde, schon) {
    befunde.forEach(function (x) {
      if (schon[x.kennung]) return;
      var k = wasTunKasten(x.kennung); if (k) { schon[x.kennung] = true; liste.append(k); }
    });
  }
  function markiertAnhaengen(liste, a, befunde) {
    var A = welt.PrueferAnhang;
    if (!A || !A.markieren || !A.marken(befunde).length) return;
    a.blob.arrayBuffer().then(function (x) { return A.markieren(x, befunde); }).then(function (c) {
      if (!c || !document.contains(liste)) return;
      var url = c.toDataURL("image/jpeg", 0.88), stamm = String(a.name).replace(/\.[^.]*$/, "") || "bild";
      liste.append(el("li", { "data-markiert": String(c.__marken || 0), style: "list-style:none" },
        el("img", { src: url, alt: a.name + " — die Stelle ist rot markiert", style: "max-width:100%;max-height:60vh;border-radius:6px;display:block;margin:4px 0" }),
        el("span", { class: "gedaempft" }, "Rot markiert: die Stelle im Bild, an der der Befund steht. Eine Kopie zum Ansehen — der Anhang selbst ist unverändert. "),
        el("button", { class: "knopf", type: "button", "data-markiert-speichern": "", onclick: function () {
          fetch(url).then(function (r) { return r.blob(); }).then(function (b) { herunterladen(b, stamm + "-markiert.jpg"); });
        } }, "⬇ Markierte Kopie speichern")));
    }, function () {});
  }
  function zeile(m, a) {
    var li = el("li", { class: "anhang", "data-anhang": a.id },
      el("div", { class: "anhang-kopf" }, el("b", { class: "anhang-name" }, a.name),
        el("span", { class: "gedaempft", "data-anhang-art": "" }, " · " + gross(a.groesse || 0) + " · wird geprüft …")));
    var liste = el("ul", { class: "befunde anhang-befunde" }), fuss = el("div", { class: "werkzeug", style: "margin:6px 0 0" }),
      meldung = el("p", { class: "meldung", "data-anhang-meldung": "" });
    var tb = teilbar(a);
    li.dataset.teilbar = tb;
    li.append(el("p", { "data-teilbar": tb, style: "margin:4px 0 0" }, TEILBAR_TEXT[tb]), liste, fuss, meldung);
    ergebnis(a).then(function (r) {
      if (!welt.SPInhalt) { li.querySelector("[data-anhang-art]").textContent = " · Inhaltsprüfung fehlt — ungeprüft"; return; }
      var funde = angabenPruefen(m, a, r);
      li.dataset.befunde = String(r.befunde.length); li.dataset.angaben = String(funde.length); li.dataset.art = r.art;
      li.querySelector("[data-anhang-art]").textContent = " · " + gross(a.groesse || 0) + " · " + r.artName;
      liste.before(el("p", { class: "meldung " + (r.status === "unauffaellig" ? "gut" : "warn"), "data-anhang-status": "" }, welt.SPInhalt.zusammenfassung(r)));
      r.befunde.forEach(function (x) { liste.append(el("li", { "data-kennung": x.kennung }, el("span", { class: "sorte" }, x.kennung), x.satz)); });
      var schon = {};
      ruhigAnhaengen(liste, r.befunde, schon);
      markiertAnhaengen(liste, a, r.befunde);
      if (!r.befunde.length && !funde.length) liste.append(el("li", { "data-kennung": r.abdeckung === "geprueft" ? "OHNE" : "UNGEPRUEFT" },
        r.abdeckung === "geprueft" ? "Keine Hinweise im genannten Prüfumfang." : "Keine Hinweise im geprüften Teil; die Datei ist nicht vollständig geprüft."));
      r.grenzen.forEach(function (h) { liste.append(el("li", { class: "gedaempft", "data-pruefgrenze": "" }, h)); });
      r.hinweise.forEach(function (h) { liste.append(el("li", { class: "gedaempft", "data-hinweis": "" }, h)); });
      if (r.sicher) fuss.append(el("button", { class: "knopf", type: "button", "data-sicher": "", onclick: function () {
        sichereFassung(a).then(function (s) {
          herunterladen(s.blob, s.name);
          meldung.className = "meldung gut";
          meldung.textContent = "Gespeichert: " + s.name + " (" + gross(s.blob.size) + "). Neu gezeichnet — " +
            "Metadaten und Anhängsel sollen entfallen; Text im Bild und PNG-Pixelverstecke können erhalten bleiben. Die neue Datei erneut prüfen.";
        }, function (e) { meldung.className = "meldung warn"; meldung.textContent = e.message; });
      } }, "🧼 Bild ohne Zusatzdaten speichern"));
      /* Stufe 2 C: Text in den untersten Bits — NUR auf diesen Knopf, das Ergebnis heißt „Verdacht“. */
      if (/^(png|jpeg|webp|gif)$/.test(r.art) && welt.PrueferAnhang.verdachtPruefen) fuss.append(el("button", { class: "knopf", type: "button", "data-verdacht-knopf": "", onclick: function (e) {
        var k = e.currentTarget; k.disabled = true;
        a.blob.arrayBuffer().then(function (x) { return welt.PrueferAnhang.verdachtPruefen(a.name, x); }).catch(function () {
          return { geprueft: false, grund: "Bildpunkte nicht geprüft: Zusatzprüfung fehlgeschlagen.", befunde: [], hinweise: [] };
        }).then(function (v) {
          welt.SPInhalt.zusatz(r, v);
          li.dataset.befunde = String(r.befunde.length);
          li.querySelector("[data-anhang-status]").textContent = welt.SPInhalt.zusammenfassung(r);
          Array.from(liste.querySelectorAll("[data-verdacht],[data-pixel-fund],[data-pixel-hinweis],[data-sicher-warnung]")).forEach(function (x) { x.remove(); });
          if (r.befunde.length) Array.from(liste.querySelectorAll('[data-kennung="OHNE"],[data-kennung="UNGEPRUEFT"]')).forEach(function (x) { x.remove(); });
          var lage = !v.geprueft ? "ungeprueft" : v.verdacht ? "ja" : "nein";
          var vl = el("li", { "data-verdacht": lage }, el("span", { class: "sorte" }, lage === "ja" ? "VERDACHT" : lage === "nein" ? "KEIN VERDACHT" : "NICHT GEPRÜFT"),
            lage === "ja" ? "Verdacht auf versteckte Daten in Bildpunkten." : lage === "nein" ? "Kein Verdacht in den Bildpunkten." : v.grund);
          liste.append(vl);
          v.befunde.forEach(function (x) { liste.append(el("li", { "data-kennung": x.kennung, "data-pixel-fund": "" }, el("span", { class: "sorte" }, x.kennung), x.satz)); });
          v.hinweise.forEach(function (h) { liste.append(el("li", { class: "gedaempft", "data-hinweis": "", "data-pixel-hinweis": "" }, h)); });
          if (lage === "ja") {
            ruhigAnhaengen(liste, v.befunde, schon);
            markiertAnhaengen(liste, a, v.befunde);
            /* Gemessen 2026-10-01: die 🧼 sichere Fassung eines PNG bleibt ein PNG — die Bildpunkte und damit die Bits bleiben. */
            if (r.art === "png") liste.append(el("li", { class: "gedaempft", "data-sicher-warnung": "" },
              "Achtung: das neu gezeichnete PNG behält die Bildpunkte und damit diese Botschaft. Die markierte Kopie ist ein JPEG, die ursprüngliche LSB-Botschaft kann dabei verloren gehen. Eine JPEG-Kopie ist keine vollständige Injection-Bereinigung."));
          }
          k.disabled = false;
        }, function () { liste.append(el("li", { "data-verdacht": "ungeprueft" }, "Bildpunkte nicht geprüft: das Bild ließ sich nicht lesen.")); k.disabled = false; });
      } }, "🔍 Bildpunkte auf Verdacht prüfen"));
    }, function () { li.querySelector("[data-anhang-art]").textContent = " · nicht lesbar — ungeprüft, nicht sauber"; });
    fuss.append(el("button", { class: "knopf", type: "button", "data-laden": "", title: "Diese Datei einzeln speichern, um sie im Mail-Programm von Hand anzuhängen", onclick: function () {
      herunterladen(a.blob, a.name);
      meldung.className = "meldung gut"; meldung.textContent = "Gespeichert: " + a.name + ". Im Mail-Programm über die Büroklammer anhängen.";
    } }, "⬇ Einzeln speichern"));
    fuss.append(el("button", { class: "knopf", type: "button", "data-weg": "", onclick: function () {
      m.anhaenge = (m.anhaenge || []).filter(function (x) { return x.id !== a.id; }); ergebnisse.delete(a.id); speichern(m); zeichne();
    } }, "Entfernen"));
    return li;
  }

  /* Vor dem Tippen sagen, was wohin mitgeht — nicht erst in der Meldung danach. */
  function wegeUebersicht(m) {
    var L = m.anhaenge || [];
    if (!L.length) return null;
    var ja = L.filter(function (a) { return teilbar(a) === "ja"; }), nein = L.filter(function (a) { return teilbar(a) !== "ja"; });
    var p = el("div", { class: "gedaempft", "data-anhang-wege": "", style: "margin:8px 0 0" });
    p.append(el("p", { style: "margin:0" }, "📤 Teilen: " + (ja.length ? "mit geht " + namenListe(ja) : "kein Anhang geht mit") +
      (nein.length ? ". Dieser Browser nimmt nicht an: " + namenListe(nein) + " — die bleiben beim Teilen automatisch weg." : ".")));
    p.append(el("p", { style: "margin:4px 0 0" }, "💾 „Als .eml speichern“: ALLE Anhänge sind in der Datei. Die .eml ist die ganze Mail als Paket — öffnen Sie sie mit einem Mail-Programm (Outlook, Thunderbird). Hängen Sie sie nicht an eine neue Mail: dann kommt beim Empfänger nur diese eine Datei an."));
    return p;
  }

  function abschnitt(m) {
    var eingabe = el("input", { type: "file", id: "anhang-datei", multiple: true, hidden: true,
      onchange: function (e) { var f = Array.prototype.slice.call(e.target.files || []); e.target.value = ""; if (f.length) hinzufuegen(m, f); } });
    var liste = el("ul", { class: "anhang-liste", id: "anhang-liste" });
    (m.anhaenge || []).forEach(function (a) { liste.append(zeile(m, a)); });
    return el("section", { class: "kasten", id: "anhaenge", "data-anhaenge": "" },
      el("h2", null, "📎 Anhänge"),
      el("p", { class: "gedaempft", "data-anhang-zweck": "" }, "Damit eine Datei nicht mehr verrät, als Sie weitergeben wollen: jeder Anhang wird hier auf dem Gerät geprüft — auf versteckte Daten hinter einem Bild, Metadaten wie Ort und Kamera, Skripte, Makros, Verweise nach außen und Angaben im Text. Bilder lassen sich ohne Metadaten und Anhängsel neu zeichnen. Schrift im Bild und bestimmte Pixelverstecke bleiben dabei erhalten."),
      liste,
      el("div", { class: "werkzeug", style: "margin:8px 0 0" },
        el("button", { class: "knopf", type: "button", "data-bericht-kopieren": "", onclick: function () {
          if (!navigator.clipboard) { melde("Bericht bitte über „Prüfbericht speichern“ herunterladen.", false); return; }
          navigator.clipboard.writeText(berichtText(m)).then(function () { melde("Prüfbericht kopiert. Dateinamen und gelesenen Text vor Weitergabe prüfen.", true); }, function () { melde("Der Browser hat das Kopieren des Berichts verweigert.", false); });
        } }, "Prüfbericht kopieren"),
        el("button", { class: "knopf", type: "button", "data-bericht-speichern": "", onclick: function () {
          herunterladen(new Blob([berichtText(m)], { type: "text/plain;charset=utf-8" }), "Sendepruefer-Pruefbericht.txt");
        } }, "Prüfbericht speichern")),
      wegeUebersicht(m),
      m.anhaengeGeerbt && (m.anhaenge || []).length ? el("p", { class: "gedaempft", "data-anhang-geerbt": "" }, "Aus der Mail übernommen, auf die diese Antwort zurückgeht. Sie gehen beim Speichern und Teilen mit — „Entfernen“, wenn einer nicht mit soll.") : null,
      el("div", { class: "werkzeug", style: "margin:8px 0 0" }, el("label", { class: "knopf", for: "anhang-datei" }, "📎 Anhang hinzufügen"), eingabe),
      el("p", { class: "gedaempft", "data-anhang-grenze": "" }, "Grenze: kein Virenscanner. Botschaften in den Bildpunkten sucht nur der Knopf „Bildpunkte auf Verdacht prüfen“ — und nur lesbaren Text; verschlüsselte erkennt er nicht, ein JPEG prüft er nicht. Text in Bildern liest die Texterkennung auf dem Gerät (bis 10 gescannte Seiten, 90 s je Bild); den Seitentext eines PDFs liest die Prüfung (bis 100 Seiten) und hält die ersten 10 Seiten gegen ihr Bild — was im Text steht, aber nicht zu sehen ist, wird gemeldet. An die KI geht nur der Mailtext, keine Datei."));
  }

  function zeichne() {
    var box = document.getElementById("lesen"), aktuell = g("aktuell");
    if (!box || !aktuell) return;
    var m = aktuell(), alt = document.getElementById("anhaenge");
    if (!m) { if (alt) alt.remove(); return; }
    mitnehmen(m);
    var neu = abschnitt(m);
    if (alt) { alt.replaceWith(neu); return; }
    var ki = document.getElementById("ki-oeffnen"), anker = ki && ki.closest(".werkzeug");
    if (anker) anker.before(neu);
  }
  function beobachten() {
    var box = document.getElementById("lesen");
    if (!box) return;
    new MutationObserver(function () { if (!document.getElementById("anhaenge") && document.getElementById("ki-oeffnen")) zeichne(); })
      .observe(box, { childList: true });
    zeichne();
  }

  /* ══ .eml MIT ANHANG — die Seite liest nur den Text; die Teile mit
   * Dateinamen holt diese Datei heraus und hängt sie an die neue Mail. */
  function emlAnhaenge(roh) {
    var A = welt.PrueferAnhang;
    if (!A || !A.ausMail) throw new Error("Der Anhang-Prüfer fehlt.");
    return A.ausMail(roh).map(function (a) {
      if (!a.bytes || a.zuGross) throw new Error("Ein Anhang ist über 25 MiB groß und wurde nicht gelesen.");
      return new File([a.bytes], a.name, { type: a.typ });
    });
  }
  function importiere(m, roh, gueltig) {
    return bereit.then(function () {
      var dateien = emlAnhaenge(roh);
      if (!gueltig || gueltig()) hinzufuegen(m, dateien);
      return dateien.length;
    });
  }
  API.emlAnhaenge = emlAnhaenge; API.importiere = importiere; API.sichereFassung = sichereFassung; API.hinzufuegen = hinzufuegen;
  API.pruefe = pruefe; API.ergebnis = ergebnis; API.berichtStand = berichtStand; API.berichtText = berichtText; API.aktualisiereAngaben = aktualisiereAngaben;

  /* ══ ANHÄNGE GEHEN MIT HINAUS (Klaus 2026-09-29: „beim Teilen der E-Mail
   * wird der Anhang nicht mitgenommen … die .eml im Mail-Programm geöffnet,
   * der Anhang ist nicht da"). Die Seite baut .eml und Teilen nur aus dem
   * Text; hier werden ihre zwei Wege ersetzt, sobald eine Mail Anhänge hat.
   * Ohne Anhang läuft ihr eigener Weg unverändert.
   *
   * Eine KI-Antwort übernimmt die Anhänge der Mail, aus der sie entstand —
   * EINMAL, als eigene Kopie, sichtbar in ihrem 📎-Abschnitt und dort zu
   * entfernen. Wer sie entfernt, bekommt sie nicht wieder. */
  function mitnehmen(m) {
    if (!m) return [];
    if ((!m.anhaenge || !m.anhaenge.length) && !m.anhaengeGeerbt && m.bezug) {
      var b = (g("MAILS") || []).filter(function (x) { return x.id === m.bezug; })[0];
      if (b && b.anhaenge && b.anhaenge.length) {
        m.anhaenge = b.anhaenge.map(function (a) { return { id: neueId(), name: a.name, typ: a.typ, groesse: a.groesse, blob: a.blob }; });
        m.anhaengeGeerbt = b.id; speichern(m);
      }
    }
    return m.anhaenge || [];
  }
  function zahlText(n) { return n === 1 ? "1 Anhang" : n + " Anhänge"; }
  function b64(bytes) {
    var s = "", i;
    for (i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/.{76}/g, "$&\r\n");
  }
  function kopfName(n) {
    n = String(n || "anhang");
    if (/^[\x20-\x7e]*$/.test(n)) return n.replace(/["\\]/g, "_");
    var enc = g("b64utf8");
    return enc ? "=?UTF-8?B?" + enc(n) + "?=" : n.replace(/[^\x20-\x7e]|["\\]/g, "_");
  }
  /* multipart/mixed: der Text wie bisher, jeder Anhang base64. Name im
     kodierten Wort (RFC 2047) UND in filename* (RFC 2231) — Outlook, Gmail
     und Thunderbird lesen jeweils eines davon. */
  function emlMitAnhang(m, liste) {
    var roh = g("emlBauen")(m), i = roh.indexOf("\r\n\r\n"), grenze = "----=_SendePruefer_" + neueId();
    var kopf = roh.slice(0, i).replace(/^Content-Type: [^\r\n]*/m, 'Content-Type: multipart/mixed; boundary="' + grenze + '"')
      .replace(/^Content-Transfer-Encoding: [^\r\n]*\r\n/m, "");
    return Promise.all(liste.map(function (a) { return a.blob.arrayBuffer(); })).then(function (inhalte) {
      var teile = [kopf, "", "--" + grenze, "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: 8bit", "", roh.slice(i + 4)];
      liste.forEach(function (a, k) {
        var nm = kopfName(a.name), stern = "UTF-8''" + encodeURIComponent(String(a.name || "anhang")).replace(/['()*]/g, function (z) { return "%" + z.charCodeAt(0).toString(16).toUpperCase(); });
        teile.push("--" + grenze, "Content-Type: " + (a.typ || "application/octet-stream") + '; name="' + nm + '"', "Content-Transfer-Encoding: base64",
          'Content-Disposition: attachment; filename="' + nm + '"; filename*=' + stern, "", b64(new Uint8Array(inhalte[k])));
      });
      teile.push("--" + grenze + "--", "");
      return teile.join("\r\n");
    });
  }
  function melde(t, gut) { var f = g("meldeAktion"); if (f) f(t, gut); }
  function namenListe(l) { return l.map(function (x) { return x.name; }).join(", "); }
  function exportEinbauen() {
    var altSpeichern = g("emlSpeichern"), altTeilen = g("teilen"), emlName = g("emlName");
    if (!altSpeichern || !altTeilen || !emlName || !g("emlBauen")) return;
    welt.emlSpeichern = function (m) {
      var L = mitnehmen(m);
      if (!L.length) return altSpeichern(m);
      return emlMitAnhang(m, L).then(function (roh) {
        var f = new File([roh], emlName(m), { type: "message/rfc822" });
        herunterladen(f, f.name);
        welt.__letzteEml = { name: f.name, weg: "download", anhaenge: L.map(function (x) { return x.name; }) };
        var ex = g("exportiert"); if (ex) ex(m);
        melde("Gespeichert als " + f.name + ", mit " + zahlText(L.length) + " (" + namenListe(L) + "). Die Datei ist die ganze Mail als Paket: mit einem Mail-Programm öffnen (Outlook, Thunderbird), nicht an eine neue Mail hängen — sonst kommt nur diese eine Datei an. Am Tablet oder Handy ist „Teilen“ der Weg.", true);
      }, function (e) { melde("Die Anhänge ließen sich nicht lesen (" + (e && e.message || e) + "). Nichts gespeichert.", false); });
    };
    welt.teilen = function (m) {
      var L = mitnehmen(m);
      if (!L.length || !navigator.share) return altTeilen(m);
      var d = { title: m.betreff || "E-Mail", text: String(m.text || "") }, geht = [], nicht = [];
      L.forEach(function (a) {                 // ohne Warten: Teilen braucht den frischen Tipp
        var f = new File([a.blob], a.name, { type: a.typ || a.blob.type || "" }), ja = false;
        try { ja = !!navigator.canShare && navigator.canShare({ files: [f] }); } catch (_e) {}
        (ja ? geht : nicht).push(f);
      });
      if (geht.length) d.files = geht;
      var an = m.anAdr ? " Den Empfänger (" + m.anAdr + ") tragen Sie im Mail-Programm ein." : "";
      var rest = nicht.length ? " NICHT mitgenommen, weil dieser Browser diese Art beim Teilen abweist: " + namenListe(nicht) + ". Hängen Sie sie im Mail-Programm von Hand an (⬇ Einzeln speichern am Anhang) oder nehmen Sie „Als .eml speichern“ — dort ist alles dabei." : "";
      return navigator.share(d).then(function () {
        welt.__letzteEml = { name: emlName(m), weg: "teilen", anhaenge: geht.map(function (x) { return x.name; }) };
        var ex = g("exportiert"); if (ex) ex(m);
        melde("Geteilt: Betreff, Text" + (geht.length ? " und " + zahlText(geht.length) + " (" + namenListe(geht) + ")" : ", ohne Anhang") + "." + rest + an, !nicht.length);
      }, function (x) {
        if (x && x.name === "AbortError") return;
        melde("Das Teilen ging nicht (" + (x && x.name || x) + "). Speichern Sie die Mail mit „Als .eml speichern“ — die Anhänge sind dabei.", false);
      });
    };
  }
  API.emlMitAnhang = emlMitAnhang; API.mitnehmen = mitnehmen; API.teilbar = teilbar; API.zeichne = function () { zeichne(); };

  /* ══ 🧪 BEISPIEL-E-MAIL MIT TEST-ANHÄNGEN (Klaus 2026-10-01): „im Sendeprüfer ebenfalls
     als E-Mail mit Anhang. Als Beispiel-E-Mail." Dieselben zwei Dateien wie in Workflow PDF
     (Hilfe → 🧪) und im Auslieferungsprüfer (Foto · Datei prüfen): ein Bild mit blasser
     Anweisung an eine KI und ein PDF mit unsichtbarem Text. Mit Absicht präpariert, alles
     erfunden. Die Seite ist voll — der Knopf hängt sich deshalb von hier in das Menü.
     Ein zweiter Tipp ersetzt die alte Test-Mail, statt eine zweite daneben zu legen. */
  var TEST_ANHAENGE = [
    { pfad: "beispiele/Testbild-versteckte-Anweisung.png", typ: "image/png" },
    { pfad: "beispiele/Testdatei-unsichtbarer-Text.pdf", typ: "application/pdf" }
  ];
  var TEST_MAIL = { bid: "testanhaenge", ordner: "eingang", vonName: "Test-Absender (erfunden)", vonAdr: "test@beispiel.example",
    anAdr: "buchhaltung@beispiel-firma.example", betreff: "🧪 Test: Mail mit präparierten Anhängen",
    text: "Guten Tag,\n\nanbei zwei Dateien. Sie sind mit Absicht präpariert und gehören zu den Beispielen dieser App, alles darin ist erfunden:\n\n1. ein Foto mit einer blassen Zeile, die eine KI als Befehl lesen würde,\n2. ein PDF mit Text, der auf der Seite nicht zu sehen ist.\n\nUnten unter „📎 Anhänge“ steht, was der Sende-Prüfer darin findet. Ein Befund ist hier das Soll.\n\nViele Grüße",
    antwortRoh: "" };
  function testMailLaden() {
    var MAILS = g("MAILS"), beispielMail = g("beispielMail"), oeffne = g("oeffne"), dbTx = g("dbTx"), st = g("st");
    if (!MAILS || !beispielMail || !oeffne) { melde("Die Beispiel-E-Mail ließ sich nicht anlegen — die Seite meldet sich nicht.", false); return; }
    Promise.all(TEST_ANHAENGE.map(function (t) {
      return fetch(t.pfad).then(function (a) { if (!a.ok) throw new Error("HTTP " + a.status); return a.blob(); })
        .then(function (b) { return new File([b], t.pfad.split("/").pop(), { type: t.typ }); });
    })).then(function (dateien) {
      for (var i = MAILS.length - 1; i >= 0; i--) if (MAILS[i].bid === TEST_MAIL.bid) {
        var alt = MAILS.splice(i, 1)[0]; if (dbTx) dbTx("readwrite", function (s) { return s.delete(alt.id); });
      }
      var m = beispielMail(TEST_MAIL);
      m.anhaenge = dateien.map(function (d) { return { id: neueId(), name: d.name, typ: d.type, groesse: d.size, blob: d }; });
      MAILS.push(m); speichern(m);
      var dlg = document.getElementById("menue-dialog"); if (dlg && dlg.open) dlg.close();
      if (st) st.ordner = "eingang";
      oeffne(m.id);
    }).catch(function (e) {
      melde("Die Test-Anhänge ließen sich nicht laden (" + (e && e.message || e) + ") — beim ersten Mal braucht es Internet.", false);
    });
  }
  function testKnopfEinbauen() {
    var vor = document.getElementById("beispiel");
    if (!vor || document.getElementById("beispiel-anhaenge")) return;
    var k = el("button", { class: "knopf", id: "beispiel-anhaenge", type: "button", "data-test-anhaenge": "" }, "🧪 Beispiel-E-Mail mit Test-Anhängen");
    k.addEventListener("click", testMailLaden);
    var p = el("p", { "data-test-anhaenge-hin": "" }, "Eine erfundene Mail mit zwei mit Absicht präparierten Anhängen: ein Bild mit blasser Anweisung an eine KI und ein PDF mit unsichtbarem Text. Ein Befund ist hier das Soll.");
    vor.after(p, k);
  }
  API.testMailLaden = testMailLaden;

  function start() {
    testKnopfEinbauen();
    document.head.append(el("style", null, ".anhang-liste{list-style:none;padding:0;margin:8px 0}.anhang{border-top:1px solid color-mix(in srgb,currentColor 15%,transparent);padding:8px 0}.anhang-name{overflow-wrap:anywhere}.anhang-befunde{margin:6px 0 0}"));
    exportEinbauen();
    beobachten();
  }
  // Import und Anhangbindung erfolgen gemeinsam im Seiten-Skript.
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})(typeof window !== "undefined" ? window : globalThis);
