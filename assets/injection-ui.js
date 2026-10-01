/* Befundanzeige und bewusste Freigabe sind an den konkreten Ausgang gebunden.
 * Freigaben bleiben nur im Arbeitsspeicher und gelten nie für geänderten Text.
 */
(function (welt) {
  "use strict";
  var freigaben = new Map(), versionen = new Map(), offlineText = "Offline-Bereitschaft noch nicht bestätigt.";
  function key(r) { return r.freigabeKey || r.text; }
  function el(tag, text) { var e = document.createElement(tag); if (text) e.textContent = text; return e; }
  function aktuell(m, r) {
    var I = welt.SPInhalt, ki = document.getElementById("s-ki"), alt = document.getElementById("inhaltspruefung");
    if (!ki || !I) return;
    if (versionen.get(m.id) !== key(r)) { freigaben.delete(m.id); versionen.set(m.id, key(r)); }
    var box = el("section"); box.id = "inhaltspruefung"; box.className = "kasten"; box.dataset.mailId = m.id;
    box.append(el("h3", "Inhaltsprüfung vor der KI"));
    var stand = el("p", I.zusammenfassung(r.injection)); stand.className = "meldung " + (r.injection.status === "unauffaellig" ? "gut" : "warn");
    stand.dataset.injectionStatus = r.injection.status; stand.setAttribute("role", "status"); box.append(stand);
    if (r.injection.befunde.length) {
      var liste = el("ul");
      r.injection.befunde.forEach(function (f) { var li = el("li", "Zeile " + f.zeile + ": " + f.satz); li.dataset.injectionKennung = f.kennung; liste.append(li); });
      box.append(liste);
      var label = el("label"), input = el("input"); input.type = "checkbox"; input.id = "injection-gelesen"; input.style.width = "auto"; input.style.minHeight = "auto"; input.style.marginRight = ".4rem";
      input.checked = freigaben.get(m.id) === key(r);
      input.addEventListener("change", function () { if (input.checked) freigaben.set(m.id, key(r)); else freigaben.delete(m.id); });
      label.append(input, document.createTextNode(" Ich habe die Hinweise geprüft und möchte diesen Mailtext an die KI geben."));
      box.append(label, el("p", "Ein Hinweis kann auch aus einem Zitat stammen. Mit dem Haken wird der Inhalt nicht bereinigt; eine geänderte Fassung muss neu geprüft werden."));
    }
    r.injection.grenzen.forEach(function (g) { box.append(el("p", g)); });
    var grenze = el("p", "Geprüft werden typische Anweisungen, Unicode-Zeichen und begrenzte Kodierungen im Mailinhalt. Ihr eigener Auftrag wird getrennt übergeben. Anhänge gehen nicht an die KI. Neue Formulierungen können unentdeckt bleiben.");
    grenze.className = "gedaempft"; box.append(grenze);
    var offline = el("p", offlineText); offline.className = "gedaempft"; offline.dataset.offlineStand = ""; box.append(offline);
    if (alt) alt.replaceWith(box); else {
      var wege = document.getElementById("s-kopieren"); if (wege && wege.parentElement) wege.parentElement.before(box); else ki.append(box);
    }
  }
  function freigabe(m, r) {
    var I = welt.SPInhalt;
    if (!I) return { erlaubt: false, grund: "Der Inhaltsprüfer fehlt." };
    return I.senderegel(r.injection, freigaben.get(m.id) === key(r));
  }
  if (navigator.serviceWorker && location.protocol !== "file:") {
    navigator.serviceWorker.ready.then(function (reg) {
      if (!reg.active) return;
      var kanal = new MessageChannel(), uhr = setTimeout(function () { kanal.port1.close(); }, 3000);
      kanal.port1.onmessage = function (e) {
        clearTimeout(uhr); kanal.port1.close();
        offlineText = e.data && e.data.bereit ? "Offline bereit: App, PDF-Prüfung und OCR-Ressourcen sind gespeichert." : "Offline-Vorrat unvollständig; die App zuerst online laden.";
        var p = document.querySelector("[data-offline-stand]"); if (p) p.textContent = offlineText;
      };
      reg.active.postMessage({ type: "sp-offline-status" }, [kanal.port2]);
    }).catch(function () {});
  }
  welt.SPInhaltUI = { aktualisiere: aktuell, freigabe: freigabe };
})(window);
