/* =========================================================================
   Brügge Bestattung – Katalog, geschützte Online-Fassung
   Zugangswort → Schlüssel (PBKDF2) → Katalogdaten und Bilder werden erst im
   Browser entschlüsselt (AES-256-CBC, WebCrypto). Auf dem Server liegt nur
   verschlüsseltes Material.
   ========================================================================= */
(function () {
  "use strict";

  const meta = n => { const m = document.querySelector('meta[name="' + n + '"]'); return m ? m.content : ""; };
  const SALT = hex2bytes(meta("katalog-salt"));
  const ITER = Number(meta("katalog-iter") || 300000);
  const DATEN_URL = meta("katalog-daten") || "daten/katalog.enc";
  const APP_URL = meta("katalog-app") || "assets/app.js";
  const DB_NAME = "bruegge_katalog_zugang", DB_STORE = "s", DB_KEY = "schluessel";
  const PLATZHALTER = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="8" fill="#ece7dd"/></svg>');
  const app = document.getElementById("app");

  function hex2bytes(h) { const a = new Uint8Array(h.length >> 1); for (let i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  // ---------- Krypto ----------
  async function schluesselAusWort(pw) {
    const km = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: SALT, iterations: ITER, hash: "SHA-256" }, km, 256);
    // nicht exportierbar: kann gemerkt werden, ohne dass das Zugangswort irgendwo im Klartext liegt
    return crypto.subtle.importKey("raw", bits, { name: "AES-CBC" }, false, ["decrypt"]);
  }
  function entschluesseln(key, buf) {
    const u = new Uint8Array(buf);
    return crypto.subtle.decrypt({ name: "AES-CBC", iv: u.slice(0, 16) }, key, u.slice(16));
  }

  // ---------- Schlüssel auf dem Gerät merken (IndexedDB) ----------
  function db() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(DB_STORE);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function merkeSchluessel(key) {
    try { const d = await db(); await new Promise((res, rej) => { const tx = d.transaction(DB_STORE, "readwrite"); tx.objectStore(DB_STORE).put(key, DB_KEY); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } catch (e) {}
  }
  async function gemerkterSchluessel() {
    try { const d = await db(); return await new Promise((res, rej) => { const r = d.transaction(DB_STORE).objectStore(DB_STORE).get(DB_KEY); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); }); } catch (e) { return null; }
  }
  async function vergissSchluessel() {
    try { const d = await db(); d.transaction(DB_STORE, "readwrite").objectStore(DB_STORE).delete(DB_KEY); } catch (e) {}
  }

  // ---------- Bilder: nur laden, was ins Bild kommt; entschlüsselt → Blob-URL ----------
  const BILD = { key: null, cache: new Map(), laufend: new Map(), warteschlange: [], aktiv: 0, MAX: 6, io: null };
  window.KATALOG_BILD = { src(pfad) { return BILD.cache.get(pfad) || PLATZHALTER; } };

  function bildLaden(pfad) {
    if (BILD.cache.has(pfad)) return Promise.resolve(BILD.cache.get(pfad));
    if (BILD.laufend.has(pfad)) return BILD.laufend.get(pfad);
    const p = new Promise((res, rej) => { BILD.warteschlange.push({ pfad, res, rej }); naechstes(); });
    BILD.laufend.set(pfad, p);
    return p;
  }
  function naechstes() {
    while (BILD.aktiv < BILD.MAX && BILD.warteschlange.length) {
      const job = BILD.warteschlange.shift(); BILD.aktiv++;
      fetch("bilder/" + job.pfad)
        .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); })
        .then(buf => entschluesseln(BILD.key, buf))
        .then(pt => { const url = URL.createObjectURL(new Blob([pt], { type: "image/jpeg" })); BILD.cache.set(pfad(job), url); job.res(url); })
        .catch(err => job.rej(err))
        .finally(() => { BILD.aktiv--; BILD.laufend.delete(job.pfad); naechstes(); });
    }
  }
  function pfad(job) { return job.pfad; }
  function einsetzen(p, url) {
    const sel = 'img[data-bild="' + (window.CSS && CSS.escape ? CSS.escape(p) : p) + '"]';
    document.querySelectorAll(sel).forEach(img => { img.src = url; img.dataset.zustand = "fertig"; });
  }
  function anfordern(img) {
    const p = img.dataset.bild;
    if (BILD.cache.has(p)) { img.src = BILD.cache.get(p); img.dataset.zustand = "fertig"; return; }
    img.dataset.zustand = "laedt";
    bildLaden(p).then(url => einsetzen(p, url)).catch(() => {
      document.querySelectorAll('img[data-bild="' + p + '"]').forEach(i => { i.src = "assets/logo-monogramm.svg"; i.dataset.zustand = "fehler"; });
    });
  }
  function scan() {
    document.querySelectorAll("img[data-bild]:not([data-zustand])").forEach(img => {
      const p = img.dataset.bild;
      if (!p || p.startsWith("data:")) { img.dataset.zustand = "fertig"; return; }
      if (BILD.cache.has(p)) { img.src = BILD.cache.get(p); img.dataset.zustand = "fertig"; return; }
      img.dataset.zustand = "wartet";
      BILD.io.observe(img);
    });
  }
  function starteBildlader() {
    BILD.io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { BILD.io.unobserve(e.target); if (e.target.dataset.zustand === "wartet") anfordern(e.target); } });
    }, { rootMargin: "900px" });
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
    scan();
  }

  // ---------- Öffnen ----------
  let datenPromise = null;
  function datenHolen() {
    if (!datenPromise) datenPromise = fetch(DATEN_URL).then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); })
      .catch(err => { datenPromise = null; throw err; });
    return datenPromise;
  }
  async function oeffnen(key) {
    const buf = await datenHolen();
    const json = JSON.parse(new TextDecoder().decode(await entschluesseln(key, buf)));
    if (!Array.isArray(json)) throw new Error("kein Katalog");
    window.KATALOG_SEED = json;
    BILD.key = key;
    document.body.classList.remove("locked");
    app.innerHTML = "";
    await new Promise((res, rej) => { const s = document.createElement("script"); s.src = APP_URL; s.onload = res; s.onerror = () => rej(new Error("app")); document.body.appendChild(s); });
    starteBildlader();
  }

  function zeigeSperre(fehler) {
    document.body.classList.add("locked");
    app.innerHTML =
      '<div class="unlock"><form class="card" id="pwForm">'
      + '<img class="siegel" src="assets/logo-siegel.svg" alt="">'
      + '<h2>Zugangswort</h2>'
      + '<p>Dieser Katalog ist geschützt. Bitte das Zugangswort eingeben, das Sie erhalten haben.</p>'
      + '<input type="password" id="pw" autocomplete="current-password" placeholder="Zugangswort" autofocus>'
      + '<label class="merken"><input type="checkbox" id="pwMerken" checked> Auf diesem Gerät merken</label>'
      + '<button class="btn primary" type="submit">Katalog öffnen</button>'
      + '<div class="err" id="pwErr">' + esc(fehler) + '</div>'
      + '</form></div>';
    const form = document.getElementById("pwForm"), inp = document.getElementById("pw"), err = document.getElementById("pwErr");
    form.onsubmit = async e => {
      e.preventDefault();
      const pw = inp.value; if (!pw) return;
      err.textContent = "Prüfe …";
      const merken = !!(document.getElementById("pwMerken") || {}).checked;
      let key;
      try { key = await schluesselAusWort(pw.trim()); }
      catch (e2) { err.textContent = "Dieser Browser kann die Seite nicht entschlüsseln – bitte Safari, Chrome oder Firefox verwenden."; return; }
      try {
        await oeffnen(key);
        if (merken) merkeSchluessel(key);
      } catch (e3) {
        if (e3 && /HTTP|fetch|app/i.test(String(e3.message || e3))) err.textContent = "Der Katalog konnte nicht geladen werden – bitte Internetverbindung prüfen und neu laden.";
        else err.textContent = "Zugangswort falsch – bitte noch einmal versuchen.";
        if (inp.isConnected) inp.select();
      }
    };
    setTimeout(() => inp.focus(), 50);
  }

  (async function init() {
    if (!window.crypto || !crypto.subtle || !window.fetch || !window.IntersectionObserver) {
      zeigeSperre("Dieser Browser ist zu alt für die geschützte Ansicht – bitte einen aktuellen Safari, Chrome oder Firefox verwenden.");
      return;
    }
    datenHolen().catch(() => {});
    const key = await gemerkterSchluessel();
    if (key) {
      try { await oeffnen(key); return; }
      catch (e) { await vergissSchluessel(); }
    }
    zeigeSperre("");
  })();
})();
