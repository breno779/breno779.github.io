/* =====================================================================
 * UCM Watchlist — v40 BETA — ☁️ sincronização segura, backup na nuvem,
 * 👥 perfil pra amigo, 🔒 senha/biometria, ⏰ lembretes (calendário),
 * ⚡ atalhos do ícone.
 *
 * A nuvem da beta usa documentos com nome próprio ("v40b-…") — nunca o
 * documento do app de sempre. Nada da nuvem é aplicado sem você escolher.
 * ===================================================================== */
(function () {
  'use strict';
  const V40 = window.V40;
  const FB_VER = '10.13.0';
  const COL = 'syncs';
  const PREFIX = 'v40b-';

  // =================== FIREBASE (carrega só quando precisa) ===================
  let fbp = null;
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('não carregou ' + src));
      document.head.appendChild(s);
    });
  }
  V40.firestore = function () {
    if (fbp) return fbp;
    fbp = (async () => {
      if (!window.firebase) {
        await loadScript(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-app-compat.js`);
        await loadScript(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-firestore-compat.js`);
      }
      const app = firebase.apps.find(a => a.name === 'v40b') || firebase.initializeApp(FIREBASE_CONFIG, 'v40b');
      return app.firestore();
    })();
    fbp.catch(() => { fbp = null; });
    return fbp;
  };

  // =================== IDENTIDADE ===================
  function genCode(n) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c = '';
    for (let i = 0; i < (n || 6); i++) c += chars[Math.floor(Math.random() * chars.length)];
    return c;
  }
  V40.syncCode = function () {
    let c = V40.get('sync-code', null);
    if (!c) {
      // usa o MESMO código do app de sempre (só lê), pra o celular e o iPad já se acharem
      const main = window.__v40real && window.__v40real.get('ucm-sync-code');
      c = main || genCode(6);
      V40.set('sync-code', c);
    }
    return c;
  };
  V40.deviceId = function () {
    let d = V40.get('device-id', null);
    if (!d) { d = genCode(8); V40.set('device-id', d); }
    return d;
  };
  V40.deviceName = function () {
    let n = V40.get('device-name', null);
    if (!n) {
      const ua = navigator.userAgent;
      n = /iPad|Macintosh.*Mobile|Macintosh(?=.*Safari)(?!.*Chrome)/.test(ua) && navigator.maxTouchPoints > 1 ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Celular Android' : 'Tablet Android') : 'Computador';
      V40.set('device-name', n);
    }
    return n;
  };

  // =================== ESTADO PRA NUVEM ===================
  const V40_KEYS = ['collections', 'activity', 'knockout', 'liga-history', 'rate-history', 'extra-pauses', 'month-goals', 'challenges-done', 'watch-time', 'day-status', 'best-streak', 'quiz-best'];
  function summary(list) {
    const L = list || items;
    return {
      done: L.filter(i => i.done).length,
      rated: L.filter(i => i.rating > 0).length,
      eps: L.reduce((s, i) => s + (Array.isArray(i.epDone) ? i.epDone.filter(Boolean).length : 0), 0),
      total: L.length
    };
  }
  function payload() {
    const v40 = {};
    V40_KEYS.forEach(k => { v40[k] = V40.get(k, null); });
    let streak = null;
    try { streak = localStorage.getItem('ucm-streak-days'); } catch (e) {}
    return {
      items: JSON.parse(JSON.stringify(items)), trash: JSON.parse(JSON.stringify(trash)), listVersion: LIST_VERSION,
      v40: JSON.stringify(v40), streak,
      device: V40.deviceId(), deviceName: V40.deviceName(),
      clientAt: new Date().toISOString(),
      summary: summary()
    };
  }

  // =================== ENVIAR / VERIFICAR ===================
  V40.syncState = V40.get('sync-state', { lastPushAt: null, lastPullAt: null, lastSeenCloudAt: null, auto: false });
  function saveState() { V40.set('sync-state', V40.syncState); }
  function setStatus(msg) { V40.syncMsg = msg; const el = document.getElementById('v40SyncStatus'); if (el) el.textContent = msg; }

  V40.syncPush = async function (silent) {
    if (!items || items.length < 100) { setStatus('⚠️ Lista local parece incompleta — não enviei'); return false; }
    try {
      setStatus('⬆️ Enviando…');
      const db = await V40.firestore();
      const p = payload();
      p.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection(COL).doc(PREFIX + V40.syncCode()).set(p);
      V40.syncState.lastPushAt = p.clientAt;
      V40.syncState.lastSeenCloudAt = p.clientAt;
      V40.syncState.dirty = false;
      saveState();
      setStatus('✅ Enviado ' + V40.nowHM());
      if (!silent) V40.toast('☁️ Enviado pra nuvem');
      await maybeCloudBackup(db);
      return true;
    } catch (e) {
      setStatus('⚠️ Não deu pra enviar: ' + (e.message || e));
      if (!silent) V40.toast('⚠️ Não deu pra enviar pra nuvem');
      return false;
    }
  };
  V40.syncFetch = async function () {
    const db = await V40.firestore();
    const snap = await db.collection(COL).doc(PREFIX + V40.syncCode()).get();
    return snap.exists ? snap.data() : null;
  };

  // diferenças título a título
  function diffLists(local, remote) {
    const byKey = {};
    remote.forEach(r => { byKey[r.key || ('id' + r.id)] = r; });
    const out = [];
    local.forEach(l => {
      const r = byKey[l.key || ('id' + l.id)];
      if (!r) { out.push({ name: V40.cleanName(l), local: 'existe', remote: 'não existe' }); return; }
      const le = Array.isArray(l.epDone) ? l.epDone.filter(Boolean).length : 0;
      const re = Array.isArray(r.epDone) ? r.epDone.filter(Boolean).length : 0;
      const parts = [];
      if (!!l.done !== !!r.done) parts.push(['visto', l.done ? 'sim' : 'não', r.done ? 'sim' : 'não']);
      if ((l.rating || 0) !== (r.rating || 0)) parts.push(['nota', l.rating || '—', r.rating || '—']);
      if (le !== re) parts.push(['episódios', le, re]);
      if (parts.length) out.push({ name: V40.cleanName(l), parts });
      delete byKey[l.key || ('id' + l.id)];
    });
    Object.values(byKey).forEach(r => out.push({ name: V40.cleanName(r), local: 'não existe', remote: 'existe' }));
    return out;
  }
  // juntar: o mais avançado de cada título (visto/episódios somam; nota: a do lado mais novo)
  function mergeLists(local, remote, remoteIsNewer) {
    const byKey = {};
    remote.forEach(r => { byKey[r.key || ('id' + r.id)] = r; });
    const out = local.map(l => {
      const r = byKey[l.key || ('id' + l.id)];
      if (!r) return l;
      const m = JSON.parse(JSON.stringify(l));
      if (r.done && !l.done) { m.done = true; m.completedAt = r.completedAt || l.completedAt; delete m.watchStart; delete m.watchEnd; delete m.watchKind; delete m.epDates; }
      if (Array.isArray(r.epDone)) {
        const n = Math.max((l.epDone || []).length, r.epDone.length);
        m.epDone = Array.from({ length: n }, (_, i) => !!((l.epDone || [])[i] || r.epDone[i]));
      }
      const lr = l.rating || 0, rr = r.rating || 0;
      if (lr !== rr) m.rating = (remoteIsNewer ? (rr || lr) : (lr || rr)) || undefined;
      if (Array.isArray(r.epRatings) || Array.isArray(l.epRatings)) {
        const a = l.epRatings || [], b = r.epRatings || [];
        const n = Math.max(a.length, b.length);
        m.epRatings = Array.from({ length: n }, (_, i) => {
          const x = typeof a[i] === 'number' ? a[i] : null, y = typeof b[i] === 'number' ? b[i] : null;
          if (x === null) return y; if (y === null) return x;
          return remoteIsNewer ? y : x;
        });
      }
      ['favorite', 'rewatch'].forEach(f => { if (r[f] && !l[f]) m[f] = r[f]; });
      if (r.subRatings && !l.subRatings) m.subRatings = r.subRatings;
      return m;
    });
    return out;
  }

  // =================== TELA DE CONFLITO ===================
  V40.openSyncCompare = async function () {
    V40.modal('<h3>☁️ Comparando com a nuvem…</h3><p class="v40-muted">Um instante.</p>');
    let remote;
    try { remote = await V40.syncFetch(); } catch (e) { V40.modal(`<h3>☁️ Nuvem</h3><p>⚠️ Não consegui falar com a nuvem: ${V40.esc(e.message || e)}</p>`); return; }
    if (!remote) {
      V40.modal(`<h3>☁️ Nuvem</h3><p>Ainda não tem nada da beta na nuvem com o código <b>${V40.syncCode()}</b>.</p><button class="v40-primary" id="v40SyncFirst">⬆️ Enviar deste aparelho</button>`);
      document.getElementById('v40SyncFirst').addEventListener('click', async () => { await V40.syncPush(); closeModal(); });
      return;
    }
    const L = summary(), R = remote.summary || summary(remote.items || []);
    const diffs = diffLists(items, remote.items || []);
    const remoteNewer = (remote.clientAt || '') > (V40.syncState.lastPushAt || '');
    const when = iso => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
    V40.modal(`<h3>☁️ Este aparelho × nuvem</h3>
      <div class="v40-sync-cmp">
        <div><b>📱 Este aparelho</b><small>${V40.esc(V40.deviceName())}</small><span>${L.done} vistos · ${L.rated} notas · ${L.eps} eps</span><small>enviado ${when(V40.syncState.lastPushAt)}</small></div>
        <div class="${remoteNewer ? 'newer' : ''}"><b>☁️ Nuvem</b><small>de: ${V40.esc(remote.deviceName || '?')}${remote.device === V40.deviceId() ? ' (este)' : ''}</small><span>${R.done} vistos · ${R.rated} notas · ${R.eps} eps</span><small>${when(remote.clientAt)}${remoteNewer ? ' · MAIS NOVA' : ''}</small></div>
      </div>
      ${diffs.length ? `<h4>${diffs.length} título(s) diferente(s)</h4><div class="v40-sync-diffs">${diffs.slice(0, 40).map(d => `<div class="v40-row"><span style="flex:1">${V40.esc(d.name)}<br><small class="v40-muted">${d.parts ? d.parts.map(p => `${p[0]}: aqui ${p[1]} · nuvem ${p[2]}`).join(' — ') : `aqui ${d.local} · nuvem ${d.remote}`}</small></span></div>`).join('')}${diffs.length > 40 ? `<p class="v40-muted">…e mais ${diffs.length - 40}</p>` : ''}</div>` : '<p>✅ Tudo igual nos dois lados.</p>'}
      ${diffs.length ? `<button class="v40-pick" id="v40SyncMerge"><b>🤝 Juntar os dois</b><br><small>Fica o mais avançado de cada título (o que foi visto em qualquer lado conta). Nota diferente: vale a do lado mais novo.</small></button>
      <button class="v40-pick" id="v40SyncUseRemote"><b>⬇️ Usar o da nuvem</b><br><small>Este aparelho fica igual à nuvem (guardo uma cópia de antes pra desfazer).</small></button>
      <button class="v40-pick" id="v40SyncUseLocal"><b>⬆️ Usar o deste aparelho</b><br><small>A nuvem fica igual a este aparelho.</small></button>` : ''}`);
    const applyRemoteItems = (newItems, label) => {
      try { localStorage.setItem('v40-snap-before-sync', JSON.stringify({ at: new Date().toISOString(), items, trash })); } catch (e) {}
      items = withOrder(newItems);
      nextId = items.reduce((m, i) => Math.max(m, i.id), 0) + 1;
      try { enforceTrioAnchor(); } catch (e) {}
      V40._state = null;
      save(); render();
      V40.syncState.lastPullAt = new Date().toISOString();
      V40.syncState.lastSeenCloudAt = remote.clientAt;
      saveState();
      V40.logEvent('plan', { name: label });
      V40.toast(label, () => {
        let prev = null;
        try { prev = JSON.parse(localStorage.getItem('v40-snap-before-sync') || 'null'); } catch (e) {}
        if (!prev) return;
        items = withOrder(prev.items); trash = prev.trash || []; V40._state = null; save(); render();
        V40.toast('↺ Desfeito');
      });
    };
    const m = document.getElementById('v40SyncMerge');
    if (m) m.addEventListener('click', async () => {
      applyRemoteItems(mergeLists(items, remote.items || [], remoteNewer), '🤝 Listas juntadas');
      closeModal();
      await V40.syncPush(true);
    });
    const r = document.getElementById('v40SyncUseRemote');
    if (r) r.addEventListener('click', () => {
      if (!(remote.items && remote.items.length >= 100)) { alert('A lista da nuvem parece incompleta — não vou aplicar.'); return; }
      if (!confirm('Trocar a lista DESTE aparelho pela da nuvem?')) return;
      applyRemoteItems(remote.items, '⬇️ Lista da nuvem aplicada');
      if (remote.v40) {
        try { const v = JSON.parse(remote.v40); Object.keys(v).forEach(k => { if (v[k] !== null) V40.set(k, v[k]); }); V40.activity = V40.get('activity', []); V40.collections = V40.get('collections', V40.collections); } catch (e) {}
      }
      closeModal();
    });
    const l = document.getElementById('v40SyncUseLocal');
    if (l) l.addEventListener('click', async () => {
      if (!confirm('Trocar a lista da NUVEM pela deste aparelho?')) return;
      await V40.syncPush(); closeModal();
    });
  };

  // =================== AUTOMÁTICO (seguro) ===================
  // Envia sozinho depois de mudar algo. Ao abrir, só AVISA se a nuvem tem coisa mais nova
  // de outro aparelho — nunca aplica sozinho.
  let pushTimer = null;
  V40.onChange(() => {
    V40.syncState.dirty = true; saveState();
    if (!V40.syncState.auto) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => V40.syncPush(true), 4000);
  });
  V40.checkCloudOnOpen = async function () {
    if (!V40.syncState.auto || !navigator.onLine) return;
    try {
      const remote = await V40.syncFetch();
      if (!remote || remote.device === V40.deviceId()) return;
      if ((remote.clientAt || '') <= (V40.syncState.lastSeenCloudAt || '')) return;
      const diffs = diffLists(items, remote.items || []);
      if (!diffs.length) { V40.syncState.lastSeenCloudAt = remote.clientAt; saveState(); return; }
      showBanner(`☁️ O ${remote.deviceName || 'outro aparelho'} tem ${diffs.length} mudança(s) mais nova(s)`, 'Ver', V40.openSyncCompare);
    } catch (e) { /* sem internet ou nuvem fora: tudo bem */ }
  };
  function showBanner(text, btn, fn) {
    let b = document.getElementById('v40Banner');
    if (b) b.remove();
    b = document.createElement('div');
    b.id = 'v40Banner';
    b.className = 'v40-banner';
    b.innerHTML = `<span>${V40.esc(text)}</span><button>${btn}</button><button class="x">✕</button>`;
    b.querySelector('button').addEventListener('click', () => { b.remove(); fn(); });
    b.querySelector('.x').addEventListener('click', () => b.remove());
    document.body.appendChild(b);
  }
  V40.showBanner = showBanner;

  // =================== BACKUP NA NUVEM (1 por semana, guarda 4) ===================
  function weekNo(d) { const t = new Date(d); t.setHours(0, 0, 0, 0); return Math.floor((t.getTime() / 86400000 + 3) / 7); }
  async function maybeCloudBackup(db) {
    const w = weekNo(new Date());
    if (V40.get('cloud-backup-week', null) === w) return;
    const slot = w % 4;
    const p = payload();
    p.backupAt = new Date().toISOString();
    await db.collection(COL).doc(`${PREFIX}bkp-${V40.syncCode()}-${slot}`).set(p);
    V40.set('cloud-backup-week', w);
  }
  V40.openCloudBackups = async function () {
    V40.modal('<h3>🗄 Backups na nuvem</h3><p class="v40-muted">Carregando…</p>');
    try {
      const db = await V40.firestore();
      const docs = await Promise.all([0, 1, 2, 3].map(s => db.collection(COL).doc(`${PREFIX}bkp-${V40.syncCode()}-${s}`).get()));
      const list = docs.filter(d => d.exists).map(d => ({ id: d.id, data: d.data() })).sort((a, b) => (b.data.backupAt || '') < (a.data.backupAt || '') ? -1 : 1);
      V40.modal(`<h3>🗄 Backups na nuvem</h3>
        <p class="v40-muted">Um por semana (quando a sincronização envia algo), guardando os 4 últimos. Código: <b>${V40.syncCode()}</b></p>
        ${list.length ? list.map(x => `<div class="v40-row"><span style="flex:1">${new Date(x.data.backupAt).toLocaleString('pt-BR')}<br><small class="v40-muted">${x.data.deviceName || ''} · ${(x.data.summary || {}).done || 0} vistos · ${(x.data.summary || {}).rated || 0} notas</small></span><button data-bk="${x.id}">Restaurar</button></div>`).join('') : '<p>Nenhum backup ainda. Ele é feito na primeira vez que você enviar pra nuvem em cada semana.</p>'}`);
      document.querySelectorAll('[data-bk]').forEach(b => b.addEventListener('click', () => {
        const x = list.find(y => y.id === b.dataset.bk);
        if (!x || !Array.isArray(x.data.items) || x.data.items.length < 100) { alert('Backup incompleto.'); return; }
        if (!confirm('Voltar a lista pra esse backup? (a de agora fica guardada pra desfazer)')) return;
        try { localStorage.setItem('v40-snap-before-sync', JSON.stringify({ at: new Date().toISOString(), items, trash })); } catch (e) {}
        items = withOrder(x.data.items); trash = x.data.trash || []; V40._state = null; save(); render(); closeModal();
        V40.toast('🗄 Backup restaurado');
      }));
    } catch (e) { V40.modal(`<h3>🗄 Backups</h3><p>⚠️ ${V40.esc(e.message || e)}</p>`); }
  };

  // =================== TELA DE SINCRONIZAÇÃO ===================
  V40.openSync = function () {
    const st = V40.syncState;
    V40.modal(`<h3>☁️ Sincronização da beta</h3>
      <p class="v40-muted">Separada da do app de sempre (documentos próprios na nuvem). Nada da nuvem entra sem você escolher.</p>
      <div class="v40-form">
        <label>Código <input type="text" id="v40SyncCodeIn" value="${V40.esc(V40.syncCode())}" maxlength="12" style="max-width:9em;font-family:'JetBrains Mono',monospace;text-transform:uppercase;"></label>
        <label>Nome deste aparelho <input type="text" id="v40DevName" value="${V40.esc(V40.deviceName())}" maxlength="24"></label>
      </div>
      <p class="v40-muted">Use o MESMO código no celular e no iPad. Por padrão a beta já pega o código do seu app de sempre.</p>
      <label class="v40-check-row"><input type="checkbox" id="v40SyncAuto" ${st.auto ? 'checked' : ''}><span>🔄 Automática: envia sozinha depois de mudar, e AVISA quando o outro aparelho tem algo mais novo</span></label>
      <div class="v40-sim" id="v40SyncStatus">${V40.syncMsg || (st.lastPushAt ? 'Último envio: ' + new Date(st.lastPushAt).toLocaleString('pt-BR') : 'Ainda não enviou nada')}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
        <button id="v40SyncPushBtn">⬆️ Enviar agora</button>
        <button id="v40SyncCmpBtn" class="v40-primary">🔍 Comparar com a nuvem</button>
        <button id="v40SyncBkBtn">🗄 Backups na nuvem</button>
      </div>`);
    document.getElementById('v40SyncCodeIn').addEventListener('change', e => {
      const c = e.target.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (c.length < 4) { alert('Código muito curto'); e.target.value = V40.syncCode(); return; }
      V40.set('sync-code', c); V40.syncState.lastSeenCloudAt = null; saveState(); V40.toast('🔗 Código trocado');
    });
    document.getElementById('v40DevName').addEventListener('change', e => { V40.set('device-name', e.target.value.trim() || V40.deviceName()); });
    document.getElementById('v40SyncAuto').addEventListener('change', e => { st.auto = e.target.checked; saveState(); if (st.auto) V40.syncPush(true); });
    document.getElementById('v40SyncPushBtn').addEventListener('click', () => V40.syncPush());
    document.getElementById('v40SyncCmpBtn').addEventListener('click', V40.openSyncCompare);
    document.getElementById('v40SyncBkBtn').addEventListener('click', V40.openCloudBackups);
  };

  // =================== 👥 PERFIL PRA AMIGO (só leitura) ===================
  V40.profileCode = function () {
    let c = V40.get('profile-code', null);
    if (!c) { c = genCode(7); V40.set('profile-code', c); }
    return c;
  };
  function profileData() {
    const table = V40.leagueTable().slice(0, 15).map(p => ({ n: p.name, i: p.icon, pts: p.pts, r: V40.round1(p.rating), pos: p.pos, k: p.items[0] && p.items[0].key }));
    const heroes = V40.heroTable(V40.heroLeague(), 'geral').slice(0, 10).map(x => ({ n: x.r.g.label, e: x.r.g.emoji, v: V40.round1(x.val), id: x.r.g.id }));
    const ko = V40.get('knockout', null);
    let champ = null;
    if (ko && ko.champion) { const p = V40.participants().find(x => x.pid === ko.champion); champ = p ? p.name : null; }
    const lv = V40.levelOf(V40.xp().xp);
    const ratings = {};
    items.forEach(it => { if (it.key && V40.effRating(it) > 0) ratings[it.key] = V40.round1(V40.effRating(it)); });
    return {
      name: V40.get('profile-name', 'Breno'), at: new Date().toISOString(),
      done: items.filter(i => i.done).length, total: items.length,
      level: lv.level, levelName: lv.cur.name, streak: V40.bestStreak(),
      table, heroes, champ, ratings
    };
  }
  V40.openProfileShare = function () {
    const code = V40.profileCode();
    const link = `${location.origin}${location.pathname}?perfil=${code}`;
    V40.modal(`<h3>👥 Seu perfil pra amigos</h3>
      <p class="v40-muted">Seus amigos veem (só ver, sem mexer) seu progresso, top 15 da Liga, top 10 heróis e o seu "verdadeiro 10". O código do perfil é diferente do código da sincronização — ninguém consegue mudar sua lista com ele.</p>
      <div class="v40-form"><label>Seu nome <input type="text" id="v40ProfName" value="${V40.esc(V40.get('profile-name', 'Breno'))}" maxlength="20"></label></div>
      <div class="v40-sim">Código do perfil: <b style="font-family:'JetBrains Mono',monospace;">${code}</b><br><small>${V40.esc(link)}</small></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
        <button class="v40-primary" id="v40ProfPub">📤 Publicar/atualizar e compartilhar</button>
        <button id="v40ProfView">👀 Ver perfil de um amigo</button>
      </div>
      <p class="v40-muted" id="v40ProfMsg"></p>`);
    document.getElementById('v40ProfName').addEventListener('change', e => V40.set('profile-name', e.target.value.trim() || 'Breno'));
    document.getElementById('v40ProfPub').addEventListener('click', async () => {
      const msg = document.getElementById('v40ProfMsg');
      msg.textContent = 'Publicando…';
      try {
        const db = await V40.firestore();
        await db.collection(COL).doc(`${PREFIX}perfil-${code}`).set(profileData());
        msg.textContent = '✅ Publicado ' + V40.nowHM();
        const text = `Olha meu progresso na maratona Marvel: ${link}`;
        try { if (navigator.share) { await navigator.share({ title: 'Meu perfil UCM', text, url: link }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
        try { await navigator.clipboard.writeText(link); V40.toast('🔗 Link copiado'); } catch (e) {}
      } catch (e) { msg.textContent = '⚠️ ' + (e.message || e); }
    });
    document.getElementById('v40ProfView').addEventListener('click', () => {
      const c = prompt('Código do perfil do seu amigo:');
      if (c) V40.openProfile(c.trim().toUpperCase());
    });
  };
  V40.openProfile = async function (code) {
    V40.modal('<h3>👥 Perfil</h3><p class="v40-muted">Carregando…</p>');
    try {
      const db = await V40.firestore();
      const snap = await db.collection(COL).doc(`${PREFIX}perfil-${code}`).get();
      if (!snap.exists) { V40.modal(`<h3>👥 Perfil</h3><p>Não achei o perfil <b>${V40.esc(code)}</b>.</p>`); return; }
      const p = snap.data();
      // comparar notas com as suas (títulos que os dois avaliaram)
      const mine = {};
      items.forEach(it => { if (it.key && V40.effRating(it) > 0) mine[it.key] = V40.round1(V40.effRating(it)); });
      const both = Object.keys(p.ratings || {}).filter(k => mine[k] != null);
      const diffs = both.map(k => ({ k, a: mine[k], b: p.ratings[k] })).sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b));
      const nameOf = k => { const it = items.find(i => i.key === k); return it ? V40.cleanName(it).split(' — ')[0] : k; };
      const isMe = code === V40.get('profile-code', null);
      V40.modal(`<div class="v40-profile">
        <h3>👤 ${V40.esc(p.name || 'Amigo')}</h3>
        <div class="v40-hero-stats">
          <div><b>${p.done}/${p.total}</b><small>VISTOS</small></div>
          <div><b>${p.level}</b><small>NÍVEL</small></div>
          <div><b>${p.streak || 0}</b><small>RECORDE DIAS</small></div>
        </div>
        ${p.champ ? `<p>👑 Verdadeiro 10: <b>${V40.esc(p.champ)}</b></p>` : ''}
        <h4>🥇 Top da Liga</h4>${(p.table || []).map(t => `<div class="v40-row"><span class="v40-pos">${t.pos}º</span><span style="flex:1">${t.i || ''} ${V40.esc(t.n)}</span><b>${t.r}</b></div>`).join('')}
        <h4>🦸 Top heróis</h4>${(p.heroes || []).map((h, i) => `<div class="v40-row"><span class="v40-pos">${i + 1}º</span><span style="flex:1">${h.e} ${V40.esc(h.n)}</span><b>${h.v}</b></div>`).join('')}
        ${!isMe && diffs.length ? `<h4>⚖️ Vocês dois avaliaram ${diffs.length} título(s)</h4><p class="v40-muted">Maiores discordâncias:</p>${diffs.slice(0, 8).map(d => `<div class="v40-row"><span style="flex:1">${V40.esc(nameOf(d.k))}</span><small>você <b>${d.a}</b> · ${V40.esc(p.name || 'amigo')} <b>${d.b}</b></small></div>`).join('')}` : ''}
        <p class="v40-muted">Atualizado em ${p.at ? new Date(p.at).toLocaleString('pt-BR') : '—'}</p>
      </div>`, true);
    } catch (e) { V40.modal(`<h3>👥 Perfil</h3><p>⚠️ ${V40.esc(e.message || e)}</p>`); }
  };

  // =================== 🔒 SENHA / BIOMETRIA ===================
  async function sha(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const b64 = buf => btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  V40.lockCfg = function () { return V40.get('lock', null); };
  V40.bioAvailable = async function () {
    try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch (e) { return false; }
  };
  async function bioRegister() {
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'UCM Watchlist', id: location.hostname },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'ucm', displayName: 'UCM Watchlist' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000
    } });
    return b64(cred.rawId);
  }
  async function bioCheck(id) {
    const a = await navigator.credentials.get({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: 'public-key', id: unb64(id) }],
      userVerification: 'required', timeout: 60000, rpId: location.hostname
    } });
    return !!a;
  }
  V40.openLockSettings = async function () {
    const cfg = V40.lockCfg();
    const bio = await V40.bioAvailable();
    V40.modal(`<h3>🔒 Senha / biometria</h3>
      <p class="v40-muted">Pede um PIN (ou digital/rosto) ao abrir a beta. É uma trava de privacidade neste aparelho — não criptografa os dados.</p>
      ${cfg ? `<p>✅ Trava ligada${cfg.bio ? ' · com biometria' : ''}.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">${bio && !cfg.bio ? '<button id="v40LockBio">👆 Ativar digital/rosto</button>' : ''}<button id="v40LockOff" class="v40-danger">Desligar trava</button></div>`
      : `<div class="v40-form"><label>Novo PIN (4 a 8 números) <input type="password" inputmode="numeric" id="v40Pin1" maxlength="8" style="max-width:8em;"></label>
        <label>Repita o PIN <input type="password" inputmode="numeric" id="v40Pin2" maxlength="8" style="max-width:8em;"></label></div>
        ${bio ? '<label class="v40-check-row"><input type="checkbox" id="v40PinBio" checked><span>👆 Também desbloquear com digital/rosto</span></label>' : '<p class="v40-muted">Biometria não disponível neste navegador — só PIN.</p>'}
        <button class="v40-primary" id="v40LockOn" style="margin-top:8px;">Ligar trava</button>`}`);
    const on = document.getElementById('v40LockOn');
    if (on) on.addEventListener('click', async () => {
      const a = document.getElementById('v40Pin1').value, b = document.getElementById('v40Pin2').value;
      if (!/^\d{4,8}$/.test(a)) { alert('O PIN precisa ter de 4 a 8 números.'); return; }
      if (a !== b) { alert('Os PINs não são iguais.'); return; }
      const salt = b64(crypto.getRandomValues(new Uint8Array(12)));
      const cfg2 = { salt, hash: await sha(salt + a), bio: null };
      const wantBio = document.getElementById('v40PinBio') && document.getElementById('v40PinBio').checked;
      if (wantBio) { try { cfg2.bio = await bioRegister(); } catch (e) { alert('Não deu pra ativar a biometria agora — fica só o PIN.'); } }
      V40.set('lock', cfg2); closeModal(); V40.toast('🔒 Trava ligada');
    });
    const off = document.getElementById('v40LockOff');
    if (off) off.addEventListener('click', async () => {
      const ok = await V40.unlockPrompt(true);
      if (ok) { V40.del('lock'); closeModal(); V40.toast('🔓 Trava desligada'); }
    });
    const lb = document.getElementById('v40LockBio');
    if (lb) lb.addEventListener('click', async () => {
      try { const id = await bioRegister(); const c = V40.lockCfg(); c.bio = id; V40.set('lock', c); V40.toast('👆 Biometria ativada'); V40.openLockSettings(); } catch (e) { alert('Não deu pra ativar.'); }
    });
  };
  // tela de bloqueio: devolve true quando desbloqueia
  V40.unlockPrompt = function (confirmOnly) {
    const cfg = V40.lockCfg();
    if (!cfg) return Promise.resolve(true);
    return new Promise(resolve => {
      const el = document.createElement('div');
      el.className = 'v40-lock';
      el.innerHTML = `<div class="box"><div class="big">🔒</div><div class="t">${confirmOnly ? 'Confirme com o PIN' : 'UCM v40 beta'}</div>
        <input type="password" inputmode="numeric" maxlength="8" placeholder="PIN" id="v40LockPin">
        <button class="v40-primary" id="v40LockGo">Entrar</button>
        ${cfg.bio ? '<button id="v40LockBioGo">👆 Digital / rosto</button>' : ''}
        ${confirmOnly ? '<button id="v40LockCancel">Cancelar</button>' : '<button id="v40LockForgot" class="v40-link">Esqueci o PIN</button>'}
        <div class="err" id="v40LockErr"></div></div>`;
      document.body.appendChild(el);
      document.body.classList.add('v40-locked');
      const done = ok => { el.remove(); document.body.classList.remove('v40-locked'); resolve(ok); };
      const tryPin = async () => {
        const v = document.getElementById('v40LockPin').value;
        if (await sha(cfg.salt + v) === cfg.hash) done(true);
        else { document.getElementById('v40LockErr').textContent = 'PIN errado'; document.getElementById('v40LockPin').value = ''; }
      };
      document.getElementById('v40LockGo').addEventListener('click', tryPin);
      document.getElementById('v40LockPin').addEventListener('keydown', e => { if (e.key === 'Enter') tryPin(); });
      const bb = document.getElementById('v40LockBioGo');
      const doBio = async () => { try { if (await bioCheck(cfg.bio)) done(true); } catch (e) { document.getElementById('v40LockErr').textContent = 'Biometria cancelada — use o PIN'; } };
      if (bb) { bb.addEventListener('click', doBio); if (!confirmOnly) setTimeout(doBio, 300); }
      const c = document.getElementById('v40LockCancel'); if (c) c.addEventListener('click', () => done(false));
      const f = document.getElementById('v40LockForgot');
      if (f) f.addEventListener('click', () => {
        if (prompt('Pra tirar a trava sem o PIN, digite APAGAR (sua lista não é apagada, só a trava):') === 'APAGAR') { V40.del('lock'); done(true); }
      });
      setTimeout(() => { const i = document.getElementById('v40LockPin'); if (i && !cfg.bio) i.focus(); }, 100);
    });
  };

  // =================== ⏰ LEMBRETES (calendário .ics) ===================
  V40.openReminders = function () {
    const cfg = V40.get('reminder', { time: '20:00', days: 30 });
    V40.modal(`<h3>⏰ Lembretes no calendário</h3>
      <p class="v40-muted">Gera um arquivo de calendário com um evento por dia dizendo o que assistir (com alarme). Abra ele no celular e adicione ao Google Agenda / Calendário do iPhone — os lembretes passam a vir do próprio celular, mesmo com o app fechado.</p>
      <div class="v40-form">
        <label>Horário do lembrete <input type="time" id="v40RemTime" value="${cfg.time}"></label>
        <label>Quantos dias <select id="v40RemDays">${[7, 14, 30, 60, 90].map(n => `<option value="${n}" ${n === cfg.days ? 'selected' : ''}>${n} dias</option>`).join('')}</select></label>
      </div>
      <button class="v40-primary" id="v40RemGo" style="margin-top:10px;">📅 Baixar calendário</button>
      <p class="v40-muted">Se o cronograma mudar (atraso, folga, ritmo), baixe de novo — e apague os eventos antigos (todos começam com "🎬 UCM").</p>`);
    document.getElementById('v40RemGo').addEventListener('click', () => {
      const time = document.getElementById('v40RemTime').value || '20:00';
      const days = +document.getElementById('v40RemDays').value;
      V40.set('reminder', { time, days });
      exportIcs(time, days);
    });
  };
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
  function exportIcs(time, days) {
    const map = V40.dayPlanMap();
    const t = V40.today();
    const [hh, mm] = time.split(':');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//UCM Watchlist//v40//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:UCM Watchlist'];
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    let n = 0;
    for (let i = 0; i < days; i++) {
      const d = V40.addDays(t, i);
      const list = (map[d] || []).filter(e => !e.completed && !e.done);
      if (!list.length) continue;
      const groups = {};
      list.forEach(e => {
        const k = e.it.id;
        groups[k] = groups[k] || { it: e.it, eps: [] };
        if (e.ep) groups[k].eps.push(e.ep);
      });
      const desc = Object.values(groups).map(g => {
        const info = V40.extInfo(g.it);
        let s = '• ' + V40.cleanName(g.it).split(' — ')[0];
        if (g.eps.length) {
          s += ` — ep. ${g.eps.length > 2 ? g.eps[0] + '–' + g.eps[g.eps.length - 1] : g.eps.join(', ')}`;
          if (info && info.epNames) s += ' (' + g.eps.map(e => info.epNames[e - 1]).filter(Boolean).slice(0, 3).join(' / ') + ')';
        }
        return s;
      }).join('\n');
      const count = list.filter(e => e.ep).length;
      const titles = Object.values(groups).filter(g => !g.eps.length).length;
      const summaryTxt = `🎬 UCM: ${count ? count + ' ep.' : ''}${count && titles ? ' + ' : ''}${titles ? titles + ' título(s)' : ''}`;
      const ds = d.replace(/-/g, '');
      lines.push('BEGIN:VEVENT', `UID:ucm-${ds}-${V40.deviceId()}@breno779.github.io`, `DTSTAMP:${stamp}`,
        `DTSTART:${ds}T${hh}${mm}00`, `DURATION:PT1H`, `SUMMARY:${icsEscape(summaryTxt)}`, `DESCRIPTION:${icsEscape(desc + '\n\nhttps://breno779.github.io/beta/')}`,
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(summaryTxt)}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
      n++;
    }
    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ucm-lembretes-${t}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    V40.toast(`📅 Calendário com ${n} dia(s) baixado — abra o arquivo pra adicionar`);
  }

  // =================== ⚡ ATALHOS DO ÍCONE / LINKS ===================
  V40.handleUrlActions = function () {
    let q;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    const perfil = q.get('perfil');
    if (perfil) setTimeout(() => V40.openProfile(perfil.toUpperCase()), 400);
    const act = q.get('a');
    if (act === 'cinema') setTimeout(V40.openCinema, 300);
    if (act === 'liga') switchTab('tabLiga');
    if (act === 'hoje') { switchTab('tabLista'); V40.view.focus = true; V40.afterViewChange(); }
    if (act === 'sorteio') setTimeout(V40.openDraw, 300);
  };

  // =================== 📲 APP ANDROID ===================
  V40.APK_URL = 'https://github.com/breno779/breno779.github.io/releases/download/apk-latest/ucm-watchlist.apk';
  V40.isApk = /UCMWatchlistApp\//.test(navigator.userAgent);
  V40.openApk = function () {
    V40.modal(`<h3>📲 App Android (APK)</h3>
      ${V40.isApk ? '<p>✅ Você já está usando o app Android.</p>' : ''}
      <p>Um app de verdade, com ícone próprio, que abre a lista sem passar pelo Chrome (usa o WebView do sistema). Isso deve evitar o problema do modo de suspensão que bloqueia o Chrome.</p>
      <h4 style="margin:10px 0 4px;">Como instalar</h4>
      <ol class="v40-steps">
        <li>No celular, toque em <b>Baixar APK</b> (abre o GitHub e baixa o arquivo <i>ucm-watchlist.apk</i>).</li>
        <li>Abra o arquivo baixado. O Android vai pedir pra <b>permitir instalar apps desta fonte</b> (do Chrome ou do app de Arquivos) — permita só pra isso.</li>
        <li>Toque em <b>Instalar</b>. Se o Play Protect avisar, toque em "Instalar mesmo assim" (é porque o app não é da Play Store).</li>
        <li>Abra o <b>UCM Watchlist</b>. Segure o ícone pra ver os atalhos: v40 beta, Hoje e Liga.</li>
      </ol>
      <h4 style="margin:10px 0 4px;">Seus dados</h4>
      <p class="v40-muted">O app guarda os dados dele separados do Chrome. Pra levar seu progresso: no Chrome, <b>Config ▸ ⬆️ Enviar pra nuvem</b>; no app, use o MESMO código e <b>⬇️ Puxar da nuvem</b>. Ou exporte um backup e importe no app.</p>
      <p class="v40-muted">Atualizações: o site atualiza sozinho dentro do app. Só precisa baixar o APK de novo quando eu mudar o próprio app (aí instala por cima, sem perder nada).</p>
      <a class="v40-primary" style="display:block;text-align:center;text-decoration:none;margin-top:10px;" href="${V40.APK_URL}" target="_blank" rel="noopener">⬇️ Baixar APK</a>`);
  };

  V40.initSync = async function () {
    if (V40.lockCfg()) await V40.unlockPrompt(false);
    V40.handleUrlActions();
    setTimeout(V40.checkCloudOnOpen, 3000);
  };
})();
