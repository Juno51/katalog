/* Online-Fassung – automatisch erzeugt von hosting/bauen.py, nicht von Hand ändern */
/* =========================================================================
   Brügge Bestattung – Katalog für Angehörige
   Reines JavaScript, läuft offline direkt aus der Datei. Keine Cloud.
   ========================================================================= */
(function () {
  "use strict";

  const LS_DATA = "bruegge_katalog_v3";
  const LS_MERK = "bruegge_merk_v1";
  const LS_FONT = "bruegge_font_v1";
  const LS_PIN  = "bruegge_pin_v1";

  // ---------- Speicher (mit Fallback, falls localStorage gesperrt ist) ----------
  const mem = {};
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return k in mem ? mem[k] : null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { mem[k] = v; } }

  function loadData() {
    // Online-Fassung: immer der aktuelle Stand vom Server, nichts im Browser gespeichert
    return (window.KATALOG_SEED || []).map(x => Object.assign({}, x));
  }
  function saveData() { /* Online-Fassung: Katalog wird nicht lokal gespeichert */ }
  function loadMerk() { try { return JSON.parse(lsGet(LS_MERK)) || []; } catch (e) { return []; } }
  function saveMerk() { lsSet(LS_MERK, JSON.stringify(state.merk)); }
  function getPin() { return lsGet(LS_PIN) || "3c614a82442ea60df3dda516"; }

  // ---------- Zustand ----------
  const state = {
    items: loadData(),
    merk: loadMerk(),
    view: "home",       // home | list
    cat: null,          // urne | sarg
    search: "",
    admin: false,
    font: parseFloat(lsGet(LS_FONT) || "1"),
    editingId: null,
    pendingImg: null,   // data-URL beim Bearbeiten
  };

  const $ = sel => document.querySelector(sel);
  const app = $("#app");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function imgSrc(it) {
    if (!it || !it.bild) return "assets/logo-monogramm.svg";
    return it.bild.startsWith("data:") ? it.bild : window.KATALOG_BILD.src(it.bild);
  }
  // ---------- Warengruppen (zentral gepflegt) ----------
  const CATS = [
    { cat: "urne",       label: "Urne",          plural: "Urnen",        sub: "schlicht bis kunstvoll" },
    { cat: "sarg",       label: "Sarg",          plural: "Särge",        sub: "in verschiedenen Hölzern" },
    { cat: "griff",      label: "Griff",         plural: "Griffe",       sub: "Sarggriffe & Beschläge" },
    { cat: "sargkreuz",  label: "Sargkreuz",     plural: "Sargkreuze",   sub: "Kreuze für den Sargdeckel" },
    { cat: "waesche",    label: "Sargwäsche",    plural: "Sargwäsche",   sub: "Decken, Garnituren & Ausschlag" },
    { cat: "sterbehemd", label: "Sterbehemd",    plural: "Sterbehemden", sub: "Talare & Sterbekleidung" },
    { cat: "grabkreuz",  label: "Grabkreuz",     plural: "Grabkreuze",   sub: "Kreuze, Tafeln & Beschriftung" },
    { cat: "kinder",     label: "Kinderartikel", plural: "Kinderartikel", sub: "Särge, Decken & Griffe" },
  ];
  const CATMAP = Object.fromEntries(CATS.map(c => [c.cat, c]));
  const catLabel  = c => (CATMAP[c] ? CATMAP[c].label  : "Artikel");
  const catPlural = c => (CATMAP[c] ? CATMAP[c].plural : "Artikel");
  function countCat(c) { return state.items.filter(i => i.cat === c).length; }

  // ---------- Schriftgröße ----------
  function applyFont() {
    document.documentElement.style.setProperty("--fs", state.font);
    lsSet(LS_FONT, String(state.font));
  }
  function bumpFont(d) {
    state.font = Math.min(1.5, Math.max(0.85, +(state.font + d).toFixed(2)));
    applyFont();
  }

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // ---------- Merkliste ----------
  function inMerk(id) { return state.merk.indexOf(id) !== -1; }
  function toggleMerk(id) {
    const i = state.merk.indexOf(id);
    if (i === -1) { state.merk.push(id); toast("Zur Auswahl hinzugefügt"); }
    else { state.merk.splice(i, 1); toast("Aus der Auswahl entfernt"); }
    saveMerk(); updateMerkBtn(); refreshFavStates();
  }
  function updateMerkBtn() {
    const n = state.merk.length;
    $("#merkCount").textContent = n;
    $("#merkBtn").classList.toggle("is-empty", n === 0);
  }
  function refreshFavStates() {
    document.querySelectorAll(".card .fav").forEach(b => {
      const on = inMerk(b.dataset.id);
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on);
    });
  }

  // ---------- Ansichten ----------
  function render() {
    stopAuto();
    if (state.view === "home") renderHome();
    else renderList();
    document.getElementById("adminBar").classList.toggle("hidden", !state.admin);
    window.scrollTo({ top: 0 });
    updateFloatNav();
  }

  function heartSVG() {
    return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
  }

  function renderHome() {
    const cards = CATS.filter(c => countCat(c.cat) > 0).map(c => {
      const first = state.items.find(i => i.cat === c.cat);
      const n = countCat(c.cat);
      return `
          <button class="cat-card" data-cat="${c.cat}">
            <span class="thumb"><img src="${imgSrc(first)}" data-bild="${esc((first && first.bild) || "")}" alt="${esc(c.plural)}"></span>
            <h2>${esc(c.plural)}</h2>
            <span class="sub">${n} ${n === 1 ? "Modell" : "Modelle"} · ${esc(c.sub)}</span>
            <span class="go">${esc(c.plural)} ansehen</span>
          </button>`;
    }).join("");
    app.innerHTML = `
      <section class="hero">
        <div class="wrap inner">
          <span class="kicker">In stiller Anteilnahme</span>
          <h1>Ein würdiger Abschied — in Ruhe ausgewählt</h1>
          <p class="lead">Nehmen Sie sich alle Zeit, die Sie brauchen. Hier finden Sie in aller Ruhe Urnen, Särge und alles Weitere, was zu einem würdevollen Abschied gehört.</p>
          <div class="rule"></div>
        </div>
      </section>
      <section class="wrap categories">
        <div class="cat-grid">${cards}</div>
      </section>
      <p class="assurance"><span class="dot"></span> Alles unverbindlich · Wir beraten Sie persönlich zu jeder Auswahl</p>
    `;
    app.querySelectorAll(".cat-card").forEach(c =>
      c.addEventListener("click", () => openCat(c.dataset.cat)));
  }

  function openCat(cat) {
    state.view = "list"; state.cat = cat; state.search = "";
    render();
  }
  function goHome() { state.view = "home"; state.cat = null; render(); }

  function filtered() {
    const q = state.search.trim().toLowerCase();
    return state.items.filter(i => {
      if (i.cat !== state.cat) return false;
      if (!q) return true;
      return (i.name + " " + (i.beschreibung || "")).toLowerCase().includes(q);
    });
  }

  function renderList() {
    const items = filtered();
    app.innerHTML = `
      <section class="wrap toolbar">
        <div class="crumbs">
          <button class="back-link" id="backHome">← Startseite</button>
        </div>
        <div class="list-head">
          <h1>${catPlural(state.cat)}</h1>
          <span class="n" id="resCount"></span>
        </div>
        <div class="controls">
          <div class="search">
            <svg class="si icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input type="search" id="searchInput" placeholder="Suchen, z. B. „Rose“, „Eiche“, „schlicht“ …" value="${esc(state.search)}">
          </div>
          ${state.admin ? '' : ''}
        </div>
      </section>
      <section class="wrap"><div class="grid" id="grid"></div></section>
    `;
    $("#backHome").addEventListener("click", goHome);
    const si = $("#searchInput");
    si.addEventListener("input", () => { state.search = si.value; renderGrid(); });
    renderGrid();
    setTimeout(() => si.focus(), 30);
  }

  function renderGrid() {
    const items = filtered();
    $("#resCount").textContent = items.length + " " + (items.length === 1 ? "Modell" : "Modelle");
    const grid = $("#grid");
    if (!items.length) {
      grid.outerHTML = `<div class="grid" id="grid"><div class="empty" style="grid-column:1/-1">
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <p style="font-size:1.2rem">Nichts gefunden. Bitte anders formulieren oder das Suchfeld leeren.</p></div></div>`;
      return;
    }
    grid.innerHTML = items.map(cardHTML).join("");
    grid.querySelectorAll(".card").forEach(card => {
      card.addEventListener("click", e => {
        if (e.target.closest(".fav")) return;
        openDetail(card.dataset.id);
      });
    });
    grid.querySelectorAll(".fav").forEach(b => {
      b.addEventListener("click", e => { e.stopPropagation(); toggleMerk(b.dataset.id); });
    });
  }

  function stockBadge(liefer) {
    const l = (liefer || "").toLowerCase();
    if (l.includes("vorrätig") || l.includes("vorratig")) return '<span class="badge stock">✓ Sofort verfügbar</span>';
    if (!liefer) return "";
    return '<span class="badge">Lieferzeit: ' + esc(liefer) + '</span>';
  }

  function cardHTML(it) {
    const bg = it.bg || "#ffffff";
    return `
      <button class="card" data-id="${it.id}">
        <span class="imgwrap" style="background:${esc(bg)}">
          <img src="${imgSrc(it)}" data-bild="${esc((it && it.bild) || "")}" alt="${esc(it.name)}" loading="lazy">
          <span class="fav ${inMerk(it.id) ? "on" : ""}" role="button" aria-pressed="${inMerk(it.id)}" data-id="${it.id}" title="Merken">${heartSVG()}</span>
        </span>
        <span class="body">
          <h3>${esc(it.name)}</h3>
          ${it.beschreibung ? `<span class="desc">${esc(it.beschreibung)}</span>` : ""}
          <span class="meta">
            ${stockBadge(it.lieferzeit)}
            ${it.preis ? `<span class="price-tag">${esc(it.preis)}</span>` : ""}
          </span>
        </span>
      </button>`;
  }

  // ---------- Detail ----------
  const detailDlg = $("#detailDlg");
  function openDetail(id) {
    stopAuto();
    const it = state.items.find(i => i.id === id);
    if (!it) return;
    const bg = it.bg || "#ffffff";
    $("#detailBody").innerHTML = `
      <div class="photo" style="background:${esc(bg)}"><img src="${imgSrc(it)}" data-bild="${esc((it && it.bild) || "")}" alt="${esc(it.name)}"></div>
      <div class="info">
        <span class="cat-tag">${catLabel(it.cat)}</span>
        <h2>${esc(it.name)}</h2>
        ${it.beschreibung ? `<p class="desc">${esc(it.beschreibung)}</p>` : ""}
        <div class="rows">
          ${it.preis ? `<div class="row"><span class="k">Preis</span><span class="v big">${esc(it.preis)}</span></div>` : ""}
          ${it.lieferzeit ? `<div class="row"><span class="k">Verfügbarkeit</span><span class="v">${esc(it.lieferzeit)}</span></div>` : ""}
          <div class="row"><span class="k">Art</span><span class="v">${catLabel(it.cat)}</span></div>
        </div>
        <div class="foot">
          <button class="btn ${inMerk(it.id) ? "gold" : "primary"} big" id="detailFav">
            ${heartSVG()} ${inMerk(it.id) ? "Gemerkt ✓" : "Zu meiner Auswahl"}
          </button>
          <button class="btn ghost" id="detailBack">Weiter schauen</button>
        </div>
        <p style="color:var(--muted);margin-top:18px;font-size:1rem">Diese Auswahl ist unverbindlich. Sprechen Sie uns gern an – wir beraten Sie in Ruhe.</p>
      </div>`;
    $("#detailFav").addEventListener("click", () => { toggleMerk(it.id); openDetail(it.id); });
    $("#detailBack").addEventListener("click", () => detailDlg.close());
    if (!detailDlg.open) detailDlg.showModal();
  }
  $("#detailClose").addEventListener("click", () => detailDlg.close());
  detailDlg.addEventListener("click", e => {
    const r = detailDlg.querySelector(".sheet-grid").getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) detailDlg.close();
  });

  // ---------- Merkliste-Fenster ----------
  const merkDlg = $("#merkDlg");
  function openMerk() {
    const list = state.merk.map(id => state.items.find(i => i.id === id)).filter(Boolean);
    const c = $("#merkContent");
    if (!list.length) {
      c.innerHTML = `<div class="empty" style="padding:40px 10px">${heartSVG()}<p style="font-size:1.14rem;margin-top:10px">Noch nichts ausgewählt.<br>Tippen Sie bei einer Urne oder einem Sarg auf das Herz&nbsp;♥, um es hier zu sammeln.</p></div>`;
      $("#merkPrint").style.display = "none"; $("#merkClear").style.display = "none";
    } else {
      $("#merkPrint").style.display = ""; $("#merkClear").style.display = "";
      c.innerHTML = '<ul class="merk-list">' + list.map(it => `
        <li class="merk-item">
          <img src="${imgSrc(it)}" data-bild="${esc((it && it.bild) || "")}" alt="">
          <div>
            <div class="mi-name">${esc(it.name)}</div>
            <div class="mi-sub">${catLabel(it.cat)}${it.preis ? " · " + esc(it.preis) : ""}${it.lieferzeit ? " · " + esc(it.lieferzeit) : ""}</div>
          </div>
          <button class="mi-x no-print" data-id="${it.id}" title="Entfernen">×</button>
        </li>`).join("") + "</ul>";
      c.querySelectorAll(".mi-x").forEach(b =>
        b.addEventListener("click", () => { toggleMerk(b.dataset.id); openMerk(); }));
    }
    if (!merkDlg.open) merkDlg.showModal();
  }
  $("#merkBtn").addEventListener("click", openMerk);
  $("#merkCloseBtn").addEventListener("click", () => merkDlg.close());
  $("#merkClear").addEventListener("click", () => {
    if (confirm("Ihre gesamte Auswahl leeren?")) { state.merk = []; saveMerk(); updateMerkBtn(); refreshFavStates(); openMerk(); }
  });
  $("#merkPrint").addEventListener("click", printMerk);

  function printMerk() {
    const list = state.merk.map(id => state.items.find(i => i.id === id)).filter(Boolean);
    if (!list.length) return;
    let area = document.getElementById("printArea");
    if (!area) { area = document.createElement("div"); area.id = "printArea"; document.body.appendChild(area); }
    area.innerHTML = `
      <div style="font-family:var(--serif);text-align:center;margin-bottom:18px">
        <div style="font-size:1.7rem;font-weight:600">Brügge Bestattung</div>
        <div style="letter-spacing:.14em;text-transform:uppercase;font-size:.8rem;color:#555">Ihre persönliche Auswahl</div>
      </div>
      <table style="width:100%;border-collapse:collapse">
        ${list.map(it => `<tr>
          <td style="width:90px;padding:10px;border-bottom:1px solid #ddd"><img src="${imgSrc(it)}" data-bild="${esc((it && it.bild) || "")}" style="width:80px;height:80px;object-fit:contain"></td>
          <td style="padding:10px;border-bottom:1px solid #ddd">
            <div style="font-family:var(--serif);font-size:1.2rem;font-weight:600">${esc(it.name)}</div>
            <div style="color:#555">${catLabel(it.cat)}${it.preis ? " · " + esc(it.preis) : ""}${it.lieferzeit ? " · " + esc(it.lieferzeit) : ""}</div>
            ${it.beschreibung ? `<div style="color:#333;font-size:.95rem;margin-top:3px">${esc(it.beschreibung)}</div>` : ""}
          </td></tr>`).join("")}
      </table>`;
    document.body.classList.add("print-merk");
    window.print();
    setTimeout(() => document.body.classList.remove("print-merk"), 300);
  }

  // ---------- Verwaltung (CRM) ----------
  const pinDlg = $("#pinDlg");
  $("#adminLink").addEventListener("click", () => {
    if (state.admin) return;
    $("#pinInput").value = "";
    pinDlg.showModal();
    setTimeout(() => $("#pinInput").focus(), 30);
  });
  $("#pinCancel").addEventListener("click", () => pinDlg.close());
  $("#pinForm").addEventListener("submit", e => {
    if ($("#pinInput").value === getPin()) {
      state.admin = true; pinDlg.close(); renderAdmin(); toast("Verwaltung geöffnet");
    } else { e.preventDefault(); toast("Code stimmt nicht"); $("#pinInput").value = ""; }
  });
  $("#btnExitAdmin").addEventListener("click", () => { state.admin = false; goHome(); });
  $("#btnPin").addEventListener("click", () => {
    const neu = prompt("Neuen Zugangs-Code eingeben (nur Zahlen, z. B. vierstellig):", getPin());
    if (neu == null) return;
    const v = neu.trim();
    if (!v) { toast("Code nicht geändert"); return; }
    lsSet(LS_PIN, v); toast("Zugangs-Code geändert");
  });

  function renderAdmin() {
    state.view = "list-admin";
    document.getElementById("adminBar").classList.remove("hidden");
    const rows = state.items.map(it => `
      <tr>
        <td><img src="${imgSrc(it)}" data-bild="${esc((it && it.bild) || "")}" alt=""></td>
        <td><div class="admin-name">${esc(it.name)}</div><div class="admin-sub">${esc(it.artikelnr || "")}</div></td>
        <td>${catLabel(it.cat)}</td>
        <td>${esc(it.lieferzeit || "—")}</td>
        <td>${it.preis ? esc(it.preis) : "—"}</td>
        <td><div class="t-actions">
          <button class="btn ghost mini" data-edit="${it.id}">Bearbeiten</button>
          <button class="btn danger mini" data-del="${it.id}">Löschen</button>
        </div></td>
      </tr>`).join("");
    app.innerHTML = `
      <section class="wrap toolbar">
        <div class="list-head">
          <h1>Verwaltung · ${state.items.length} Produkte</h1>
          <span class="n">${CATS.filter(c => countCat(c.cat) > 0).map(c => countCat(c.cat) + " " + esc(c.plural)).join(" · ")}</span>
        </div>
        <div class="controls">
          <div class="search">
            <svg class="si icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input type="search" id="adminSearch" placeholder="Produkt suchen …">
          </div>
        </div>
      </section>
      <section class="wrap">
        <table class="admin-table"><thead><tr>
          <th>Foto</th><th>Name / Artikelnr.</th><th>Kategorie</th><th>Lieferzeit</th><th>Preis</th><th>Aktion</th>
        </tr></thead><tbody id="adminRows">${rows}</tbody></table>
      </section>`;
    bindAdminRows();
    const as = $("#adminSearch");
    as.addEventListener("input", () => {
      const q = as.value.trim().toLowerCase();
      $("#adminRows").querySelectorAll("tr").forEach(tr => {
        tr.style.display = tr.textContent.toLowerCase().includes(q) ? "" : "none";
      });
    });
    window.scrollTo({ top: 0 });
  }
  function bindAdminRows() {
    app.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => openForm(b.dataset.edit)));
    app.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => deleteItem(b.dataset.del)));
  }

  // ---------- Formular ----------
  const formDlg = $("#formDlg");
  function newId() {
    let n = 1, id;
    do { id = "n" + (Date.now().toString(36)) + (n++); } while (state.items.some(i => i.id === id));
    return id;
  }
  function openForm(id) {
    state.editingId = id || null;
    state.pendingImg = null;
    const it = id ? state.items.find(i => i.id === id) : null;
    $("#formTitle").textContent = it ? "Produkt bearbeiten" : "Neues Produkt anlegen";
    $("#fName").value = it ? it.name : "";
    $("#fCat").innerHTML = CATS.map(c => `<option value="${c.cat}">${esc(c.label)}</option>`).join("");
    $("#fCat").value = it ? it.cat : "urne";
    $("#fLiefer").value = it ? (it.lieferzeit || "") : "";
    $("#fPreis").value = it ? (it.preis || "") : "";
    $("#fArt").value = it ? (it.artikelnr || "") : "";
    $("#fDesc").value = it ? (it.beschreibung || "") : "";
    $("#fPrev").src = it ? imgSrc(it) : "assets/logo-monogramm.svg";
    $("#fFile").value = "";
    $("#formDelete").style.display = it ? "" : "none";
    formDlg.showModal();
    setTimeout(() => $("#fName").focus(), 30);
  }
  $("#fFile").addEventListener("change", e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { state.pendingImg = r.result; $("#fPrev").src = r.result; };
    r.readAsDataURL(f);
  });
  $("#formCancel").addEventListener("click", () => formDlg.close());
  $("#formDelete").addEventListener("click", () => {
    if (state.editingId) { formDlg.close(); deleteItem(state.editingId); }
  });
  $("#prodForm").addEventListener("submit", e => {
    e.preventDefault();
    const name = $("#fName").value.trim();
    if (!name) { toast("Bitte einen Namen eingeben"); return; }
    const data = {
      name,
      cat: $("#fCat").value,
      kategorie: catLabel($("#fCat").value),
      lieferzeit: $("#fLiefer").value.trim(),
      preis: $("#fPreis").value.trim(),
      artikelnr: $("#fArt").value.trim(),
      beschreibung: $("#fDesc").value.trim(),
    };
    if (state.editingId) {
      const it = state.items.find(i => i.id === state.editingId);
      Object.assign(it, data);
      if (state.pendingImg) { it.bild = state.pendingImg; it.bg = "#ffffff"; }
      toast("Änderungen gespeichert");
    } else {
      const it = Object.assign({ id: newId(), bg: "#ffffff" }, data);
      it.bild = state.pendingImg || "";
      state.items.unshift(it);
      toast("Produkt angelegt");
    }
    saveData(); formDlg.close(); renderAdmin();
  });
  function deleteItem(id) {
    const it = state.items.find(i => i.id === id); if (!it) return;
    if (!confirm(`„${it.name}“ wirklich löschen?`)) return;
    state.items = state.items.filter(i => i.id !== id);
    const mi = state.merk.indexOf(id); if (mi !== -1) { state.merk.splice(mi, 1); saveMerk(); updateMerkBtn(); }
    saveData(); toast("Gelöscht"); renderAdmin();
  }

  // ---------- Export / Import / Reset ----------
  $("#btnNew").addEventListener("click", () => openForm(null));
  $("#btnExport").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state.items, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bruegge-katalog-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click(); URL.revokeObjectURL(a.href);
    toast("Katalog gesichert (Download)");
  });
  $("#btnImport").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const arr = JSON.parse(r.result);
        if (!Array.isArray(arr)) throw 0;
        state.items = arr; saveData(); toast("Katalog wiederhergestellt"); renderAdmin();
      } catch (x) { toast("Datei konnte nicht gelesen werden"); }
    };
    r.readAsText(f); e.target.value = "";
  });
  $("#btnReset").addEventListener("click", () => {
    if (!confirm("Den Katalog auf die ursprüngliche Grundausstattung zurücksetzen? Ihre eigenen Änderungen gehen verloren.")) return;
    state.items = (window.KATALOG_SEED || []).map(x => Object.assign({}, x));
    saveData(); toast("Auf Original zurückgesetzt"); renderAdmin();
  });

  // ---------- Orientierungshilfe (Startseite / Nach oben / Nach unten) ----------
  const floatNav = $("#floatNav");
  function updateFloatNav() {
    const y = window.scrollY;
    const max = (document.documentElement.scrollHeight || 0) - (window.innerHeight || 0);
    const scrollable = max > 200;
    floatNav.classList.toggle("show", scrollable);
    $("#fnDown").classList.toggle("hidden", !(scrollable && y < max - 120));
    $("#fnTop").classList.toggle("hidden", !(y > 300));
    $("#fnHome").classList.toggle("hidden", !(y > 300) || state.view === "home");
  }

  // Sanftes automatisches Herunterfahren der Seite (für leichte Bedienung)
  let autoTimer = null, autoLast = null, autoAcc = 0;
  function setDownActive(on) {
    const b = $("#fnDown");
    b.classList.toggle("active", on);
    const lbl = b.querySelector(".fn-label"); if (lbl) lbl.textContent = on ? "Stopp" : "Nach unten";
    const icd = b.querySelector(".fn-ic-down"); if (icd) icd.classList.toggle("hidden", on);
    const ics = b.querySelector(".fn-ic-stop"); if (ics) ics.classList.toggle("hidden", !on);
  }
  function stopAuto() {
    if (autoTimer) { cancelAnimationFrame(autoTimer); autoTimer = null; }
    autoLast = null; autoAcc = 0; setDownActive(false);
  }
  function stepDown(ts) {
    if (autoLast == null) autoLast = ts;
    const dt = Math.min(50, ts - autoLast); autoLast = ts;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (window.scrollY >= max - 1) { stopAuto(); return; }
    autoAcc += 0.09 * dt;                 // ~90 px pro Sekunde – ruhiges Tempo
    const px = Math.floor(autoAcc);
    if (px > 0) { autoAcc -= px; window.scrollBy(0, px); }
    autoTimer = requestAnimationFrame(stepDown);
  }
  function toggleDown() {
    if (autoTimer) { stopAuto(); return; }
    setDownActive(true); autoLast = null; autoAcc = 0;
    autoTimer = requestAnimationFrame(stepDown);
  }

  $("#fnDown").addEventListener("click", toggleDown);
  $("#fnTop").addEventListener("click", () => { stopAuto(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  $("#fnHome").addEventListener("click", () => { stopAuto(); state.admin = false; goHome(); });
  window.addEventListener("scroll", updateFloatNav, { passive: true });
  // jede echte Nutzereingabe hält das automatische Fahren an
  ["wheel", "touchstart", "keydown"].forEach(ev =>
    window.addEventListener(ev, stopAuto, { passive: true }));

  // ---------- Kopf-Bedienelemente ----------
  $("#brandHome").addEventListener("click", () => { state.admin = false; goHome(); });
  $("#fontUp").addEventListener("click", () => bumpFont(0.1));
  $("#fontDown").addEventListener("click", () => bumpFont(-0.1));
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { /* Dialoge schließen sich selbst */ }
  });

  // ---------- Start ----------
  applyFont();
  updateMerkBtn();
  render();
})();
