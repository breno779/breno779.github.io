/* =====================================================================
 * UCM Watchlist — v40.7.4 — 🛟 Proteção contra perda de progresso
 *  - Toda vez que a lista é salva, anota no "diário" quantos episódios/notas tem e quem salvou.
 *  - Se um salvamento TIRA episódios marcados (2+) ou notas, guarda a versão de ANTES (cópia de segurança).
 *  - Também guarda uma cópia automática a cada 20 min de uso (últimas 48), além da cópia diária.
 *  - Tudo fica no aparelho (IndexedDB), aparece no 🕰 Histórico de versões e dá pra voltar.
 * ===================================================================== */
(function () {
  'use strict';
  const V40 = window.V40;
  const LIST = window.V40_LIST || 'oficial';
  const DB = 'ucm-guard', ST = 'snaps';
  const LOGK = 'v40guard-log-' + LIST;
  const KEEP_LOSS = 30, KEEP_AUTO = 48, AUTO_MIN = 20;

  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { const s = r.result.createObjectStore(ST, { keyPath: 'id' }); s.createIndex('list', 'list'); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function put(snap) {
    const db = await idb();
    await new Promise((res, rej) => { const t = db.transaction(ST, 'readwrite'); t.objectStore(ST).put(snap); t.oncomplete = res; t.onerror = () => rej(t.error); });
    // limpa as antigas do mesmo tipo
    const all = await listSnaps();
    const same = all.filter(s => s.kind === snap.kind);
    const keep = snap.kind === 'perda' ? KEEP_LOSS : KEEP_AUTO;
    const del = same.slice(keep);
    if (del.length) await new Promise(res => { const t = db.transaction(ST, 'readwrite'); del.forEach(s => t.objectStore(ST).delete(s.id)); t.oncomplete = res; t.onerror = res; });
  }
  async function listSnaps() {
    const db = await idb();
    return new Promise((res) => {
      const out = [];
      const t = db.transaction(ST, 'readonly');
      const q = t.objectStore(ST).index('list').openCursor(IDBKeyRange.only(LIST));
      q.onsuccess = () => { const c = q.result; if (c) { out.push(c.value); c.continue(); } else res(out.sort((a, b) => b.at.localeCompare(a.at))); };
      q.onerror = () => res(out);
    });
  }
  async function getSnap(id) {
    const db = await idb();
    return new Promise(res => { const r = db.transaction(ST, 'readonly').objectStore(ST).get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); });
  }

  // contagem: episódios marcados (+ títulos vistos) e notas dadas
  function counts(list) {
    let eps = 0, rates = 0, done = 0;
    (list || []).forEach(it => {
      if (it.done) done++;
      if (Array.isArray(it.epDone)) eps += it.epDone.filter(Boolean).length;
      if (typeof it.rating === 'number' && it.rating > 0) rates++;
      if (Array.isArray(it.epRatings)) rates += it.epRatings.filter(v => typeof v === 'number').length;
    });
    return { eps, rates, done };
  }
  V40.guardCounts = counts;
  function who() {
    if (V40.saveSrc) return V40.saveSrc;
    const st = (new Error().stack || '').split('\n').slice(3, 8).map(l => (/at ([\w.$]+)/.exec(l) || /^([\w.$]+)@/.exec(l.trim()) || [])[1]).filter(Boolean);
    return st.length ? st.slice(0, 3).join('<') : 'você';
  }
  function logPush(e) {
    try {
      const L = JSON.parse(localStorage.getItem(LOGK) || '[]');
      L.push(e); while (L.length > 200) L.shift();
      localStorage.setItem(LOGK, JSON.stringify(L));
    } catch (er) {}
  }

  const origSave = window.save;
  let lastAuto = 0, last = null;
  window.save = function () {
    let prevRaw = null, prev = null;
    try { prevRaw = localStorage.getItem(STORAGE_KEY); prev = prevRaw ? counts(JSON.parse(prevRaw).items) : null; } catch (e) {}
    const r = origSave.apply(this, arguments);
    try {
      const now = counts(items);
      const src = who();
      if (!last || !prev || now.eps !== prev.eps || now.rates !== prev.rates || now.done !== prev.done) {
        logPush({ t: new Date().toISOString(), eps: now.eps, rates: now.rates, done: now.done, src });
      }
      last = now;
      const lostEps = prev ? prev.eps - now.eps : 0, lostRates = prev ? prev.rates - now.rates : 0;
      if (prevRaw && (lostEps >= 2 || lostRates >= 1 || (prev && prev.done - now.done >= 2))) {
        put({ id: 'p' + Date.now(), list: LIST, kind: 'perda', at: new Date().toISOString(), raw: prevRaw, c: prev, lost: { eps: lostEps, rates: lostRates }, src }).catch(() => {});
      }
      if (Date.now() - lastAuto > AUTO_MIN * 60000) {
        lastAuto = Date.now();
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) put({ id: 'a' + Date.now(), list: LIST, kind: 'auto', at: new Date().toISOString(), raw, c: now, src }).catch(() => {});
      }
    } catch (e) {}
    return r;
  };

  // ---------- tela (dentro do 🕰 Histórico de versões) ----------
  const fmt = iso => { const d = new Date(iso); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  V40.guardHtml = async function () {
    let snaps = [];
    try { snaps = await listSnaps(); } catch (e) {}
    const loss = snaps.filter(s => s.kind === 'perda'), auto = snaps.filter(s => s.kind === 'auto');
    const row = s => `<div class="v40-row"><span style="flex:1">${fmt(s.at)}<br><small class="v40-muted">${s.c.eps} episódios · ${s.c.rates} notas${s.lost ? ` · <b style="color:#e57373">antes de perder ${s.lost.eps > 0 ? s.lost.eps + ' ep.' : ''}${s.lost.eps > 0 && s.lost.rates > 0 ? ' e ' : ''}${s.lost.rates > 0 ? s.lost.rates + ' nota(s)' : ''}</b>` : ''}</small></span><button data-gsnap="${s.id}">Voltar pra essa</button></div>`;
    let log = [];
    try { log = JSON.parse(localStorage.getItem(LOGK) || '[]'); } catch (e) {}
    return `<h4 style="margin:14px 0 4px;">🛟 Cópias de segurança (antes de perder algo)</h4>
      ${loss.length ? loss.map(row).join('') : '<p class="v40-muted">Nenhuma perda detectada até agora.</p>'}
      <details class="v40-help"><summary>⏱ Cópias automáticas (a cada ${AUTO_MIN} min de uso) · ${auto.length}</summary>${auto.map(row).join('') || '<p class="v40-muted">Ainda sem.</p>'}</details>
      <details class="v40-help"><summary>📜 Diário de mudanças (últimas ${Math.min(log.length, 60)})</summary><div style="font-size:.72rem;font-family:'JetBrains Mono',monospace;">${log.slice(-60).reverse().map(e => `<div>${fmt(e.t)} · ${e.eps} eps · ${e.rates} notas · ${V40.esc(String(e.src || ''))}</div>`).join('') || 'vazio'}</div></details>`;
  };
  V40.wireGuard = function (el) {
    (el || document).querySelectorAll('[data-gsnap]').forEach(b => b.addEventListener('click', async () => {
      if (V40.guard && !V40.guard()) return;
      const s = await getSnap(b.dataset.gsnap);
      let data = null;
      try { data = JSON.parse(s.raw); } catch (e) {}
      if (!data || !Array.isArray(data.items)) { V40.toast('❌ Cópia inválida'); return; }
      if (!confirm(`Voltar a lista pra como estava em ${fmt(s.at)}? (a de agora fica guardada e dá pra desfazer)`)) return;
      try { localStorage.setItem('v40-snap-before-restore', JSON.stringify({ at: new Date().toISOString(), items, trash })); } catch (e) {}
      V40.saveSrc = 'voltou cópia ' + fmt(s.at);
      items = withOrder(data.items);
      trash = Array.isArray(data.trash) ? data.trash : [];
      nextId = items.reduce((m, i) => Math.max(m, i.id), 0) + 1;
      V40._state = null;
      save(); render(); V40.saveSrc = null;
      closeModal();
      V40.logEvent && V40.logEvent('restore', { name: fmt(s.at) });
      V40.toast(`🛟 Lista voltou pra ${fmt(s.at)}`, () => {
        let prev = null;
        try { prev = JSON.parse(localStorage.getItem('v40-snap-before-restore') || 'null'); } catch (e) {}
        if (!prev) return;
        items = withOrder(prev.items); trash = prev.trash || []; V40._state = null; save(); render();
        V40.toast('↺ Desfeito');
      });
    }));
  };
  // primeira cópia automática logo ao abrir
  setTimeout(() => { try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) { lastAuto = Date.now(); put({ id: 'a' + Date.now(), list: LIST, kind: 'auto', at: new Date().toISOString(), raw, c: counts(items), src: 'abriu o app' }).catch(() => {}); } } catch (e) {} }, 3000);
})();
