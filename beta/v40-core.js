/* =====================================================================
 * UCM Watchlist — v40 BETA — núcleo
 * Carregado depois do script principal. Tudo daqui vive em window.V40 e
 * conversa com o app pelos ganchos (window.v40*) que o build coloca no
 * principal.html. Nada aqui toca no app de verdade: a beta tem a gaveta
 * (localStorage com prefixo) dela.
 * ===================================================================== */
(function () {
  'use strict';
  const V40 = window.V40 = window.V40 || {};

  // ---------- armazenamento (chaves 'v40-*', já com o prefixo da beta pelo shim) ----------
  V40.get = function (k, def) {
    try {
      const v = localStorage.getItem('v40-' + k);
      return v === null ? def : JSON.parse(v);
    } catch (e) { return def; }
  };
  V40.set = function (k, v) {
    try { localStorage.setItem('v40-' + k, JSON.stringify(v)); return true; } catch (e) { return false; }
  };
  V40.del = function (k) { try { localStorage.removeItem('v40-' + k); } catch (e) {} };

  // ---------- configurações ----------
  const DEFAULT_SETTINGS = {
    sounds: false,          // efeitos sonoros (opcional, começa desligado)
    confetti: true,         // confete ao concluir
    battery: false,         // modo bateria: sem animações
    fontScale: 1,           // tamanho da letra
    themeMode: null,        // 'dark' | 'light' | 'auto' (null = segue o botão antigo)
    heroTheme: null,        // id do tema por herói
    heroBg: false,          // fundo muda conforme o herói do título do dia
    contrast: false,        // alto contraste
    readOnly: false,        // modo só leitura
    swipe: true,            // deslizar pra marcar
    home: {                 // blocos da tela inicial (layout que você monta)
      today: true, level: true, goals: true, timeline: true, legend: true, badges: true,
      counters: true, countdowns: true, actions: true
    },
    heroNicknames: {}       // apelidos dos heróis/grupos
  };
  V40.settings = Object.assign({}, DEFAULT_SETTINGS, V40.get('settings', {}));
  V40.settings.home = Object.assign({}, DEFAULT_SETTINGS.home, V40.settings.home || {});
  V40.settings.heroNicknames = V40.settings.heroNicknames || {};
  V40.saveSettings = function () { V40.set('settings', V40.settings); };

  // ---------- utilidades ----------
  V40.esc = function (s) { return escapeHtml(s == null ? '' : String(s)); };
  V40.today = function () { return todayIso(); };
  V40.isoOf = function (d) { return fmtDateISO(d); };
  V40.addDays = function (iso, n) {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return fmtDateISO(d);
  };
  V40.daysBetween = function (a, b) {
    return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
  };
  V40.fmtBR = function (iso, withYear) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
  };
  V40.nowHM = function () {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };
  V40.cleanName = function (it) {
    return it.text.replace(/\([^)]*\)/g, '').replace(/^[^\wÀ-ÿ]+\s*/, '').replace(/\s+/g, ' ').trim();
  };
  V40.shortName = function (it) {
    let n = V40.cleanName(it);
    if (!/what if/i.test(n)) n = n.split(' — ')[0];
    return n;
  };
  V40.kindIcon = function (it) {
    const k = simpleKind(it);
    if (k === 'jogo') return '🎮';
    if (it.text.includes('🎨')) return '🎨';
    if (k === 'serie') return '📺';
    return '🎬';
  };
  V40.round1 = function (x) { return Math.round(x * 10) / 10; };
  V40.fmt1 = function (x) { return (Math.round(x * 10) / 10).toFixed(1); };
  // pontos do campeonato: nota arredondada (7,0–7,4 → 7 · 7,5–7,9 → 8)
  V40.points = function (r) {
    if (!(r > 0)) return 0;
    const x = Math.round(r * 10) / 10;
    return Math.floor(x + 0.5 + 1e-9);
  };

  // nota "efetiva" de um título (mesma regra do ranking de heróis):
  // concluído com nota → a nota; série em andamento com episódios avaliados → média deles.
  V40.effRating = function (it) {
    if (it.done && it.rating > 0) return it.rating;
    if (!it.done && simpleKind(it) !== 'jogo' && seriesHasEpRatings(it) && Array.isArray(it.epDone) && it.epDone.some(Boolean)) {
      return epRatingAvg(it);
    }
    return 0;
  };
  V40.inProgress = function (it) { return !it.done && V40.effRating(it) > 0; };

  // posição cronológica (ordem da lista)
  V40.orderIndex = function () {
    const map = new Map();
    sortItems(items.slice()).forEach((it, i) => map.set(it.id, i));
    return map;
  };

  // ---------- participantes do campeonato ----------
  // cada título é um participante; os episódios de What If…? T1 viram UM participante e os da
  // T2 viram outro (a T3 já é um item só). Jogos ficam de fora.
  V40.WHATIF_GROUPS = [
    { pid: 'whatif-t1', re: /What If…\?\s*T1E\d/, name: 'What If…? T1', season: 1 },
    { pid: 'whatif-t2', re: /What If…\?\s*T2E\d/, name: 'What If…? T2', season: 2 }
  ];
  V40.participants = function () {
    const order = V40.orderIndex();
    const out = [];
    const groups = {};
    items.forEach(it => {
      if (simpleKind(it) === 'jogo') return;
      const wg = V40.WHATIF_GROUPS.find(g => g.re.test(it.text));
      if (wg) {
        if (!groups[wg.pid]) groups[wg.pid] = { wg, members: [] };
        groups[wg.pid].members.push(it);
        return;
      }
      const r = V40.effRating(it);
      out.push({
        pid: 'i' + it.id,
        name: V40.shortName(it),
        icon: V40.kindIcon(it),
        items: [it],
        kind: simpleKind(it) === 'serie' ? 'serie' : 'filme',
        anim: it.text.includes('🎨'),
        rating: r,
        pts: V40.points(r),
        inProgress: V40.inProgress(it),
        done: !!it.done,
        completedAt: it.completedAt || null,
        phase: it.phase,
        order: order.has(it.id) ? order.get(it.id) : 9999,
        heroes: heroGroupsOf(it)
      });
    });
    Object.keys(groups).forEach(pid => {
      const { wg, members } = groups[pid];
      const rated = members.filter(m => V40.effRating(m) > 0);
      const r = rated.length ? V40.round1(rated.reduce((s, m) => s + V40.effRating(m), 0) / rated.length) : 0;
      const allDone = members.every(m => m.done);
      const minOrder = Math.min.apply(null, members.map(m => order.has(m.id) ? order.get(m.id) : 9999));
      const dates = members.map(m => m.completedAt).filter(Boolean).sort();
      out.push({
        pid,
        name: wg.name + ` (${members.length} eps)`,
        icon: '🎨',
        items: members,
        kind: 'serie',
        anim: true,
        rating: r,
        pts: V40.points(r),
        inProgress: !allDone && r > 0,
        done: allDone,
        completedAt: allDone && dates.length ? dates[dates.length - 1] : null,
        phase: members[0].phase,
        order: minOrder,
        heroes: [],
        whatIf: true
      });
    });
    return out;
  };

  // ---------- registro de atividades + diferenças a cada save() ----------
  const LOG_CAP = 2000;
  V40.activity = V40.get('activity', []);
  V40.logEvent = function (type, data) {
    const e = Object.assign({ d: V40.today(), t: V40.nowHM(), type }, data || {});
    // vários episódios marcados seguidos (ex.: "marcar até hoje") viram uma linha só
    if (type === 'ep' || type === 'unep' || type === 'eprate') {
      for (let i = V40.activity.length - 1; i >= 0 && i >= V40.activity.length - 8; i--) {
        const x = V40.activity[i];
        if (x.d !== e.d || x.t !== e.t) break;
        if (x.type === type && x.id === e.id) {
          x.n = (x.n || 1) + (e.n || 1);
          V40.set('activity', V40.activity);
          return x;
        }
      }
    }
    V40.activity.push(e);
    if (V40.activity.length > LOG_CAP) V40.activity = V40.activity.slice(-LOG_CAP);
    V40.set('activity', V40.activity);
    return e;
  };
  function snapshotState() {
    const m = {};
    items.forEach(it => {
      m[it.id] = {
        done: !!it.done,
        rating: it.rating || 0,
        ep: Array.isArray(it.epDone) ? it.epDone.filter(Boolean).length : 0,
        er: Array.isArray(it.epRatings) ? it.epRatings.filter(v => typeof v === 'number').length : 0,
        text: it.text
      };
    });
    return m;
  }
  V40._state = null;
  V40._listeners = [];
  V40.onChange = function (fn) { V40._listeners.push(fn); };

  function diffAndLog() {
    if (!V40._state) { V40._state = snapshotState(); return; }
    const prev = V40._state;
    const now = snapshotState();
    const changes = { titlesDone: [], titlesUndone: [], epsAdded: 0, epsRemoved: 0, ratings: [], epRatings: 0, removed: [], seriesEps: [] };
    Object.keys(now).forEach(id => {
      const a = prev[id], b = now[id];
      if (!a) return;
      const it = items.find(i => String(i.id) === String(id));
      const name = it ? V40.shortName(it) : b.text;
      if (!a.done && b.done) { changes.titlesDone.push(it); V40.logEvent('title', { id: +id, name }); }
      if (a.done && !b.done) { changes.titlesUndone.push(it); V40.logEvent('untitle', { id: +id, name }); }
      // episódios marcados (sem contar o "marcar tudo" automático de quando o título inteiro é concluído)
      if (b.ep > a.ep && !(b.done && !a.done)) {
        const n = b.ep - a.ep;
        changes.epsAdded += n;
        changes.seriesEps.push({ it, n });
        V40.logEvent('ep', { id: +id, name, n });
      }
      if (b.ep < a.ep && !(a.done && !b.done)) {
        changes.epsRemoved += a.ep - b.ep;
        V40.logEvent('unep', { id: +id, name, n: a.ep - b.ep });
      }
      if (a.rating !== b.rating && b.rating > 0 && !(it && it.ratingAuto)) {
        changes.ratings.push({ it, from: a.rating, to: b.rating });
        V40.logEvent('rate', { id: +id, name, v: b.rating, from: a.rating });
      }
      if (b.er > a.er) { changes.epRatings += b.er - a.er; V40.logEvent('eprate', { id: +id, name, n: b.er - a.er }); }
    });
    Object.keys(prev).forEach(id => {
      if (!now[id]) { changes.removed.push(prev[id]); V40.logEvent('remove', { id: +id, name: prev[id].text }); }
    });
    V40._state = now;
    // episódio marcado também conta pra sequência de dias (antes só título contava)
    if (changes.epsAdded > 0) { try { markDoneToday(); } catch (e) {} }
    V40._listeners.forEach(fn => { try { fn(changes); } catch (e) { console.error(e); } });
  }

  // ---------- indicador "salvo no aparelho" ----------
  function updateSavedChip() {
    const el = document.getElementById('v40SavedChip');
    if (!el) return;
    el.textContent = '💾 salvo ' + V40.nowHM();
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
  }

  // ---------- save() com os extras da v40 ----------
  const origSave = window.save;
  window.save = function () {
    if (V40.settings.readOnly && !V40._allowSave) {
      // modo só leitura: nada é gravado (e as ações de mudar já ficam bloqueadas antes disso)
      return;
    }
    const r = origSave.apply(this, arguments);
    try {
      stampTrash();
      diffAndLog();
      V40.dailySnapshot();
      updateSavedChip();
    } catch (e) { console.error('v40 save hook', e); }
    return r;
  };

  // ---------- lixeira com prazo de 30 dias ----------
  function stampTrash() {
    let changed = false;
    trash.forEach(t => { if (!t.deletedAt) { t.deletedAt = new Date().toISOString(); changed = true; } });
    return changed;
  }
  V40.TRASH_DAYS = 30;
  V40.purgeTrash = function () {
    const before = trash.length;
    const now = Date.now();
    trash = trash.filter(t => !t.deletedAt || (now - new Date(t.deletedAt).getTime()) < V40.TRASH_DAYS * 86400000);
    return before - trash.length;
  };

  // ---------- histórico de versões (1 cópia por dia, guarda as últimas 7) ----------
  V40.SNAP_KEEP = 7;
  V40.dailySnapshot = function (force) {
    const idx = V40.get('snap-index', []);
    const t = V40.today();
    if (!force && idx.includes(t)) return;
    try {
      localStorage.setItem('v40-snap-' + t, JSON.stringify({ at: new Date().toISOString(), items, trash }));
    } catch (e) { return; }
    if (!idx.includes(t)) idx.push(t);
    idx.sort();
    while (idx.length > V40.SNAP_KEEP) {
      const old = idx.shift();
      try { localStorage.removeItem('v40-snap-' + old); } catch (e) {}
    }
    V40.set('snap-index', idx);
  };

  // ---------- toasts / sons / confete ----------
  V40.toast = function (msg, undo) { try { showToast(msg, undo); } catch (e) {} };

  let audioCtx = null;
  V40.sound = function (kind) {
    if (!V40.settings.sounds) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const notes = {
        tick: [[880, 0, 0.06]],
        done: [[660, 0, 0.09], [880, 0.09, 0.12]],
        level: [[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.22]],
        trophy: [[784, 0, 0.12], [988, 0.12, 0.12], [1175, 0.24, 0.28]],
        whistle: [[1400, 0, 0.18], [1250, 0.2, 0.25]]
      }[kind] || [[700, 0, 0.08]];
      const t0 = audioCtx.currentTime;
      notes.forEach(([f, start, dur]) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + start);
        g.gain.exponentialRampToValueAtTime(0.12, t0 + start + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t0 + start); o.stop(t0 + start + dur + 0.02);
      });
    } catch (e) {}
  };

  V40.confetti = function (big) {
    if (!V40.settings.confetti || V40.settings.battery) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = document.createElement('canvas');
    cv.className = 'v40-confetti';
    cv.width = window.innerWidth; cv.height = window.innerHeight;
    document.body.appendChild(cv);
    const ctx = cv.getContext('2d');
    const colors = ['#d9a441', '#b6332c', '#2b4c8c', '#efe4c8', '#4c8c5a', '#ffd100'];
    const n = big ? 180 : 90;
    const parts = [];
    for (let i = 0; i < n; i++) {
      parts.push({
        x: cv.width / 2 + (Math.random() - 0.5) * cv.width * 0.3,
        y: cv.height * 0.35,
        vx: (Math.random() - 0.5) * 12,
        vy: -Math.random() * 12 - 4,
        s: 4 + Math.random() * 6,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        c: colors[i % colors.length]
      });
    }
    let frame = 0;
    (function step() {
      frame++;
      ctx.clearRect(0, 0, cv.width, cv.height);
      parts.forEach(p => {
        p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vx *= 0.99;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      });
      if (frame < 110) requestAnimationFrame(step); else cv.remove();
    })();
  };

  // ---------- modal maior ----------
  V40.modal = function (html, wide) {
    openModal(html);
    if (wide) document.getElementById('modalBox').classList.add('wide-modal');
    const box = document.getElementById('modalBox');
    box.scrollTop = 0;
    return box;
  };

  // ---------- plano de hoje (barra do dia) ----------
  // conta os episódios com data de HOJE (e quantos já foram marcados), os atrasados (data antes
  // de hoje e ainda não marcados) e os títulos (filme/curta/jogo) do dia.
  // situação dos episódios de uma série pela QUANTIDADE já marcada (igual ao contador do app:
  // uma marcação fora de ordem não faz a série parecer atrasada)
  V40.seriesStatus = function (it, t) {
    t = t || V40.today();
    const eps = extractEpsCount(it.text) || 1;
    const doneCount = Array.isArray(it.epDone) ? it.epDone.filter(Boolean).length : 0;
    let before = 0, todayN = 0, nextDate = null;
    const dates = [];
    for (let e = 0; e < eps; e++) {
      const d = episodeDateFor(it, e, eps);
      dates.push(d);
      if (!d) continue;
      if (d < t) before++;
      else if (d === t) todayN++;
    }
    if (doneCount < eps) nextDate = dates[doneCount] || null;
    return {
      eps, doneCount, before, todayN, dates, nextDate,
      late: it.done ? 0 : Math.max(0, before - doneCount),
      doneToday: Math.max(0, Math.min(todayN, doneCount - before))
    };
  };
  V40.todayPlan = function () {
    const t = V40.today();
    let epsTotal = 0, epsDone = 0, late = 0;
    const titles = [];
    items.forEach(it => {
      const kind = simpleKind(it);
      if (kind === 'serie') {
        if (it.done || (!it.watchStart && !it.epDates)) return;
        const st = V40.seriesStatus(it, t);
        epsTotal += st.todayN; epsDone += st.doneToday; late += st.late;
      } else if (!it.done && it.watchStart && it.watchStart <= t && it.watchEnd >= t) {
        titles.push({ it, done: false });
      } else if (it.done && it.completedAt === t && kind !== 'serie') {
        titles.push({ it, done: true });
      }
    });
    return { epsTotal, epsDone, late, titles };
  };

  // título "do dia": o que está programado pra hoje (ou o próximo pendente)
  V40.currentItem = function () {
    const pending = sortItems(items.filter(i => !i.done));
    return pending.find(i => isToday(i)) || pending[0] || null;
  };

  // ---------- leitura (modo só leitura) ----------
  V40.guard = function () {
    if (V40.settings.readOnly) {
      V40.toast('👁 Modo só leitura ligado — desligue em Config pra mudar algo');
      return false;
    }
    return true;
  };
  ['toggleDone', 'adjustRating', 'startRatingEdit', 'removeItem', 'moveItem', 'startEdit', 'startDateEdit', 'toggleFavorite', 'addNewItem', 'moveItemToPhase', 'openMarathon', 'showPaceAdjuster'].forEach(name => {
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function () {
      if (!V40.guard()) return;
      return orig.apply(this, arguments);
    };
  });
  // checkbox/nota de episódio dentro das janelas também respeitam o modo só leitura
  document.addEventListener('click', ev => {
    if (!V40.settings.readOnly) return;
    const t = ev.target;
    if (t && t.closest && t.closest('.interleaved-list') && (t.matches('input[type="checkbox"]') || t.closest('label.interleaved-row'))) {
      ev.preventDefault();
      ev.stopPropagation();
      V40.guard();
    }
  }, true);
  document.addEventListener('focusin', ev => {
    if (V40.settings.readOnly && ev.target && ev.target.classList && ev.target.classList.contains('ep-rate')) {
      ev.target.blur();
      V40.guard();
    }
  }, true);

  // ---------- nível / XP (usado por várias telas) ----------
  V40.LEVELS = [
    { xp: 0, name: 'Recruta da S.H.I.E.L.D.', icon: '🪖' },
    { xp: 500, name: 'Agente de Campo', icon: '🕶️' },
    { xp: 1500, name: 'Vingador em Treinamento', icon: '🛡️' },
    { xp: 3000, name: 'Vingador', icon: '⚡' },
    { xp: 5000, name: 'Líder de Equipe', icon: '🦅' },
    { xp: 7500, name: 'Herói Cósmico', icon: '🚀' },
    { xp: 10500, name: 'Mestre das Artes Místicas', icon: '🌀' },
    { xp: 14000, name: 'Portador das Joias', icon: '💎' },
    { xp: 18000, name: 'Vigia do Multiverso', icon: '👁️' },
    { xp: 23000, name: 'Guardião do Multiverso', icon: '🌌' }
  ];
  V40.xp = function () {
    let xp = 0;
    const parts = { titulos: 0, episodios: 0, notas: 0, trofeus: 0, desafios: 0 };
    items.forEach(it => {
      if (it.done) {
        const k = simpleKind(it);
        parts.titulos += k === 'jogo' ? 300 : (k === 'serie' ? 120 : 100);
        if (it.rating > 0 && !it.ratingAuto) parts.notas += 10;
      }
      if (Array.isArray(it.epDone)) parts.episodios += it.epDone.filter(Boolean).length * 15;
      if (Array.isArray(it.epRatings)) parts.notas += it.epRatings.filter(v => typeof v === 'number').length * 5;
    });
    let unlocked = [];
    try { unlocked = JSON.parse(localStorage.getItem('ucm-unlocked-achv') || '[]'); } catch (e) {}
    parts.trofeus = unlocked.length * 50;
    parts.desafios = (V40.get('challenges-done', []) || []).length * 150;
    xp = parts.titulos + parts.episodios + parts.notas + parts.trofeus + parts.desafios;
    return { xp, parts };
  };
  V40.levelOf = function (xp) {
    let i = 0;
    while (i + 1 < V40.LEVELS.length && xp >= V40.LEVELS[i + 1].xp) i++;
    const cur = V40.LEVELS[i], next = V40.LEVELS[i + 1] || null;
    const pct = next ? Math.round(100 * (xp - cur.xp) / (next.xp - cur.xp)) : 100;
    return { idx: i, level: i + 1, cur, next, pct };
  };

  // ---------- sequência de dias (títulos E episódios) ----------
  V40.streakDays = function () {
    let days = [];
    try { days = JSON.parse(localStorage.getItem('ucm-streak-days') || '[]'); } catch (e) {}
    // dias com atividade registrada pela v40 também contam
    V40.activity.forEach(e => { if ((e.type === 'title' || e.type === 'ep') && !days.includes(e.d)) days.push(e.d); });
    return Array.from(new Set(days)).sort();
  };
  V40.currentStreak = function () {
    const set = new Set(V40.streakDays());
    let d = V40.today();
    if (!set.has(d)) d = V40.addDays(d, -1);
    let n = 0;
    while (set.has(d) && n < 4000) { n++; d = V40.addDays(d, -1); }
    return n;
  };
  V40.bestStreak = function () {
    const days = V40.streakDays();
    let best = 0, run = 0, prev = null;
    days.forEach(d => {
      run = (prev && V40.addDays(prev, 1) === d) ? run + 1 : 1;
      if (run > best) best = run;
      prev = d;
    });
    const stored = V40.get('best-streak', 0);
    if (best > stored) V40.set('best-streak', best);
    return Math.max(best, stored);
  };

  // atividade por dia (títulos concluídos + episódios marcados)
  V40.activityByDay = function () {
    const m = {};
    items.forEach(it => {
      if (it.done && it.completedAt) {
        m[it.completedAt] = m[it.completedAt] || { titles: 0, eps: 0 };
        m[it.completedAt].titles++;
      }
    });
    V40.activity.forEach(e => {
      if (e.type === 'ep') { m[e.d] = m[e.d] || { titles: 0, eps: 0 }; m[e.d].eps += e.n || 1; }
      if (e.type === 'unep') { m[e.d] = m[e.d] || { titles: 0, eps: 0 }; m[e.d].eps = Math.max(0, m[e.d].eps - (e.n || 1)); }
    });
    V40.streakDays().forEach(d => { if (!m[d]) m[d] = { titles: 0, eps: 0, marked: true }; });
    return m;
  };

  // ---------- registro diário "em dia / atrasado" (pra mês perfeito e recuperação) ----------
  V40.recordDayStatus = function () {
    const log = V40.get('day-status', {});
    const el = document.getElementById('delayCounter');
    if (!el) return;
    const late = el.classList.contains('late');
    const t = V40.today();
    // guarda o pior estado do dia (se ficou atrasado em algum momento, conta como atrasado)
    if (log[t] === undefined || (late && !log[t])) log[t] = late;
    // depois que o dia acaba, o último estado do dia anterior vale; aqui só não deixa crescer demais
    const keys = Object.keys(log).sort();
    while (keys.length > 400) delete log[keys.shift()];
    V40.set('day-status', log);
  };

  // ---------- aba nova (Liga) e ganchos de troca de aba ----------
  function injectLigaTab() {
    if (document.getElementById('tabLiga')) return;
    const page = document.createElement('div');
    page.className = 'tab-page';
    page.id = 'tabLiga';
    const tabbar = document.getElementById('tabbar');
    tabbar.parentNode.insertBefore(page, tabbar);
    const btn = document.createElement('button');
    btn.className = 'tabbar-btn';
    btn.dataset.tab = 'tabLiga';
    btn.innerHTML = '🥇<span>Liga</span>';
    const trof = tabbar.querySelector('[data-tab="tabConquistas"]');
    tabbar.insertBefore(btn, trof ? trof.nextSibling : null);
    btn.addEventListener('click', () => switchTab('tabLiga'));
  }

  const origSwitchTab = window.switchTab;
  window.switchTab = function (name) {
    const r = origSwitchTab.apply(this, arguments);
    try {
      if (name === 'tabLiga' && V40.renderLiga) V40.renderLiga();
      if (name === 'tabEstatisticas' && V40.renderStatsExtra) V40.renderStatsExtra();
      if (name === 'tabConquistas' && V40.renderTrophiesExtra) V40.renderTrophiesExtra();
      if (name === 'tabConfig' && V40.renderConfigExtra) V40.renderConfigExtra();
      if (name === 'tabInicio' && V40.renderHomeExtra) V40.renderHomeExtra();
      ensureTabReloadBtn(name);
    } catch (e) { console.error(e); }
    return r;
  };

  // ---------- filtros extras, busca por herói/fase, ordenação ----------
  V40.view = {
    focus: false,          // modo foco: só o que é de hoje (e atrasado)
    rewatch: false,        // só "quero rever"
    collection: null,      // id de coleção
    sort: null,            // null | 'rating-desc' | 'rating-asc' | 'done-recent' | 'hero' | 'name'
    adv: null              // filtro avançado {status, kind, anim, min, max, rated}
  };
  V40.collections = V40.get('collections', [
    { id: 'c-fav-time', name: '🏆 Meus favoritos de todos os tempos', ids: [] },
    { id: 'c-rever', name: '🍿 Pra ver com alguém', ids: [] }
  ]);
  V40.saveCollections = function () { V40.set('collections', V40.collections); };

  // apelidos: o nome exibido do herói/grupo vira o apelido (o original fica em g._origLabel)
  V40.applyNicknames = function () {
    HERO_GROUPS.forEach(g => {
      if (!g._origLabel) g._origLabel = g.label;
      const nick = V40.settings.heroNicknames[g.id];
      g.label = nick && nick.trim() ? nick.trim() : g._origLabel;
    });
  };
  V40.heroLabel = function (g) { return g.label; };

  window.v40TermMatch = function (it, term) {
    const norm = normalizeStr(it.text);
    if (norm.includes(term)) return true;
    if (normalizeStr(it.phase || '').includes(term)) return true;
    try {
      const groups = heroGroupsOf(it);
      if (groups.some(g => normalizeStr(g.label).includes(term) || normalizeStr(g._origLabel || '').includes(term) || g.keywords.some(k => normalizeStr(k).includes(term)))) return true;
    } catch (e) {}
    return false;
  };

  V40.isFocusItem = function (it) {
    if (it.done) return false;
    const t = V40.today();
    if (isToday(it)) return true;
    if (it.watchEnd && it.watchEnd < t) return true; // atrasado
    if (simpleKind(it) === 'serie' && (it.watchStart || it.epDates)) {
      const st = V40.seriesStatus(it, t);
      if (st.before + st.todayN > st.doneCount) return true;
    }
    return false;
  };

  window.v40Filter = function (it) {
    const v = V40.view;
    if (v.focus && !V40.isFocusItem(it)) return false;
    if (v.rewatch && !it.rewatch) return false;
    if (v.collection) {
      const c = V40.collections.find(x => x.id === v.collection);
      if (c && !c.ids.includes(it.id)) return false;
    }
    if (v.adv) {
      const a = v.adv;
      if (a.status === 'done' && !it.done) return false;
      if (a.status === 'pending' && it.done) return false;
      if (a.status === 'progress' && !(Array.isArray(it.epDone) && it.epDone.some(Boolean) && !it.done)) return false;
      if (a.kind && simpleKind(it) !== a.kind) return false;
      if (a.anim === 'anim' && !it.text.includes('🎨')) return false;
      if (a.anim === 'live' && (it.text.includes('🎨') || simpleKind(it) === 'jogo')) return false;
      const r = V40.effRating(it);
      if (a.rated === 'yes' && !(r > 0)) return false;
      if (a.rated === 'no' && r > 0) return false;
      if (a.min != null && a.min !== '' && !(r >= +a.min)) return false;
      if (a.max != null && a.max !== '' && !(r > 0 && r <= +a.max)) return false;
      if (a.hero) {
        try { if (!heroGroupsOf(it).some(g => g.id === a.hero)) return false; } catch (e) {}
      }
      if (a.phase && it.phase !== a.phase) return false;
    }
    return true;
  };
  window.v40SortActive = function () { return !!V40.view.sort; };
  window.v40SortList = function (list) {
    const s = V40.view.sort;
    if (!s) return list;
    const arr = list.slice();
    const r = it => V40.effRating(it);
    const name = it => normalizeStr(V40.cleanName(it));
    if (s === 'rating-desc') arr.sort((a, b) => (r(b) - r(a)) || (name(a) < name(b) ? -1 : 1));
    else if (s === 'rating-asc') arr.sort((a, b) => ((r(a) || 99) - (r(b) || 99)) || (name(a) < name(b) ? -1 : 1));
    else if (s === 'done-recent') arr.sort((a, b) => ((b.completedAt || '') < (a.completedAt || '') ? -1 : ((b.completedAt || '') > (a.completedAt || '') ? 1 : 0)));
    else if (s === 'hero') {
      const h = it => { try { const g = heroGroupsOf(it)[0]; return g ? normalizeStr(V40.heroLabel(g)) : '~~~'; } catch (e) { return '~~~'; } };
      arr.sort((a, b) => (h(a) < h(b) ? -1 : h(a) > h(b) ? 1 : 0));
    } else if (s === 'name') arr.sort((a, b) => (name(a) < name(b) ? -1 : 1));
    return arr;
  };
  // quando o filtro/ordem da v40 está ativo, a lista vira "plana" (sem fases) só se tiver ordem;
  // foco/rever/coleção funcionam nas duas formas.

  // ---------- extras em cada linha da lista ----------
  window.v40DecorateRow = function (row, it, mainCol, actions) {
    // etiquetas pequenas sempre visíveis
    const tags = [];
    if (it.rewatch) tags.push('<span class="v40-tag rewatch">🔁 rever</span>');
    const cols = V40.collections.filter(c => c.ids.includes(it.id));
    cols.forEach(c => tags.push(`<span class="v40-tag col">${V40.esc(c.name.split(' ')[0])}</span>`));
    if (it.subRatings && simpleKind(it) !== 'jogo') {
      const s = it.subRatings;
      const vals = ['roteiro', 'acao', 'emocao'].map(k => s[k]).filter(v => typeof v === 'number');
      if (vals.length) tags.push(`<span class="v40-tag sub">🎯 ${vals.map(v => v).join(' · ')}</span>`);
    }
    if (tags.length) {
      const t = document.createElement('div');
      t.className = 'v40-tags';
      t.innerHTML = tags.join('');
      mainCol.insertBefore(t, mainCol.children[1] || null);
    }
    // ações extras: aparecem quando você toca no nome (linha "expandida")
    const extra = document.createElement('div');
    extra.className = 'v40-row-extra';
    const kind = simpleKind(it);
    const btns = [];
    btns.push(`<button data-act="rewatch">${it.rewatch ? '🔁 Tirar do "quero rever"' : '🔁 Quero rever'}</button>`);
    btns.push('<button data-act="collection">🗂 Coleções</button>');
    if (kind !== 'jogo') btns.push('<button data-act="sub">🎯 Notas detalhadas</button>');
    try { if (heroGroupsOf(it).length) btns.push('<button data-act="hero">🦸 Cartão do herói</button>'); } catch (e) {}
    if (kind !== 'jogo') btns.push('<button data-act="duel">⚔️ Duelo</button>');
    extra.innerHTML = btns.join('');
    extra.addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      ev.stopPropagation();
      const act = b.dataset.act;
      if (act === 'rewatch') {
        if (!V40.guard()) return;
        it.rewatch = !it.rewatch;
        save(); render();
        V40.toast(it.rewatch ? '🔁 Adicionado ao "quero rever"' : '🔁 Tirado do "quero rever"');
      } else if (act === 'collection') V40.openCollectionsFor(it);
      else if (act === 'sub') V40.openSubRatings(it);
      else if (act === 'hero') { const g = heroGroupsOf(it)[0]; if (g && V40.openHeroCard) V40.openHeroCard(g.id); }
      else if (act === 'duel' && V40.openDuel) V40.openDuel('i' + it.id);
    });
    mainCol.appendChild(extra);
  };

  // ---------- coleções ----------
  V40.openCollectionsFor = function (it) {
    const render1 = () => {
      const rows = V40.collections.map(c => `
        <label class="v40-check-row"><input type="checkbox" data-col="${c.id}" ${c.ids.includes(it.id) ? 'checked' : ''}>
        <span>${V40.esc(c.name)} <small>(${c.ids.length})</small></span></label>`).join('');
      V40.modal(`<h3>🗂 Coleções</h3>
        <p class="v40-muted">${V40.esc(V40.cleanName(it))}</p>
        <div>${rows || '<p class="v40-muted">Nenhuma coleção ainda.</p>'}</div>
        <div class="v40-inline-form"><input id="v40NewCol" type="text" placeholder="Nova coleção (ex.: 😂 Comédias)"><button id="v40NewColBtn">Criar</button></div>`);
      document.querySelectorAll('[data-col]').forEach(cb => cb.addEventListener('change', () => {
        if (!V40.guard()) { cb.checked = !cb.checked; return; }
        const c = V40.collections.find(x => x.id === cb.dataset.col);
        if (!c) return;
        if (cb.checked && !c.ids.includes(it.id)) c.ids.push(it.id);
        if (!cb.checked) c.ids = c.ids.filter(x => x !== it.id);
        V40.saveCollections();
        render();
      }));
      document.getElementById('v40NewColBtn').addEventListener('click', () => {
        const name = document.getElementById('v40NewCol').value.trim();
        if (!name) return;
        V40.collections.push({ id: 'c' + Date.now(), name, ids: [it.id] });
        V40.saveCollections();
        render();
        render1();
      });
    };
    render1();
  };
  V40.openCollectionsManager = function () {
    const rows = V40.collections.map(c => `
      <div class="v40-row"><span style="flex:1">${V40.esc(c.name)} <small class="v40-muted">(${c.ids.length})</small></span>
      <button data-show="${c.id}">Ver</button><button data-ren="${c.id}">✎</button><button data-del="${c.id}" class="v40-danger">✕</button></div>`).join('');
    V40.modal(`<h3>🗂 Suas coleções</h3>
      <p class="v40-muted">Listas suas, do jeito que quiser. Pra pôr um título numa coleção: toque no nome dele na Lista ▸ 🗂 Coleções.</p>
      ${rows || '<p class="v40-muted">Nenhuma coleção.</p>'}
      <div class="v40-inline-form"><input id="v40NewCol2" type="text" placeholder="Nova coleção"><button id="v40NewColBtn2">Criar</button></div>`);
    document.querySelectorAll('[data-show]').forEach(b => b.addEventListener('click', () => {
      V40.view.collection = b.dataset.show;
      closeModal(); switchTab('tabLista'); render(); V40.updateViewBar();
    }));
    document.querySelectorAll('[data-ren]').forEach(b => b.addEventListener('click', () => {
      const c = V40.collections.find(x => x.id === b.dataset.ren);
      const n = prompt('Novo nome da coleção:', c.name);
      if (n && n.trim()) { c.name = n.trim(); V40.saveCollections(); V40.openCollectionsManager(); }
    }));
    document.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
      const c = V40.collections.find(x => x.id === b.dataset.del);
      if (!confirm(`Apagar a coleção "${c.name}"? (os títulos continuam na lista)`)) return;
      V40.collections = V40.collections.filter(x => x.id !== c.id);
      V40.saveCollections(); V40.openCollectionsManager();
    }));
    document.getElementById('v40NewColBtn2').addEventListener('click', () => {
      const name = document.getElementById('v40NewCol2').value.trim();
      if (!name) return;
      V40.collections.push({ id: 'c' + Date.now(), name, ids: [] });
      V40.saveCollections(); V40.openCollectionsManager();
    });
  };

  // ---------- notas detalhadas (roteiro / ação / emoção) ----------
  V40.SUB_KEYS = [['roteiro', '📜 Roteiro'], ['acao', '💥 Ação'], ['emocao', '💗 Emoção']];
  V40.openSubRatings = function (it) {
    const s = it.subRatings || {};
    const rows = V40.SUB_KEYS.map(([k, label]) => `
      <div class="v40-sub-row"><span>${label}</span>
      <input type="range" min="0" max="10" step="0.5" value="${typeof s[k] === 'number' ? s[k] : 5}" data-sub="${k}">
      <b data-subval="${k}">${typeof s[k] === 'number' ? s[k] : '—'}</b></div>`).join('');
    V40.modal(`<h3>🎯 Notas detalhadas</h3>
      <p class="v40-muted">${V40.esc(V40.cleanName(it))}<br>Separado da nota geral (não muda a nota nem o campeonato).</p>
      ${rows}
      <div style="display:flex;gap:8px;margin-top:10px;"><button id="v40SubSave" class="v40-primary">Salvar</button><button id="v40SubClear">Limpar</button></div>`);
    const touched = {};
    document.querySelectorAll('[data-sub]').forEach(inp => inp.addEventListener('input', () => {
      touched[inp.dataset.sub] = true;
      document.querySelector(`[data-subval="${inp.dataset.sub}"]`).textContent = inp.value;
    }));
    Object.keys(s).forEach(k => { touched[k] = true; });
    document.getElementById('v40SubSave').addEventListener('click', () => {
      if (!V40.guard()) return;
      const out = {};
      document.querySelectorAll('[data-sub]').forEach(inp => { if (touched[inp.dataset.sub]) out[inp.dataset.sub] = parseFloat(inp.value); });
      if (Object.keys(out).length) it.subRatings = out; else delete it.subRatings;
      save(); render(); closeModal(); V40.toast('🎯 Notas detalhadas salvas');
    });
    document.getElementById('v40SubClear').addEventListener('click', () => {
      if (!V40.guard()) return;
      delete it.subRatings; save(); render(); closeModal();
    });
  };

  // ---------- barra de "vista ativa" na Lista (foco / rever / coleção / ordem / filtro) ----------
  V40.updateViewBar = function () {
    let bar = document.getElementById('v40ViewBar');
    const lista = document.getElementById('tabLista');
    if (!bar && lista) {
      bar = document.createElement('div');
      bar.id = 'v40ViewBar';
      bar.className = 'v40-viewbar';
      const search = document.getElementById('searchWrap');
      lista.insertBefore(bar, search);
    }
    if (!bar) return;
    const v = V40.view;
    const chips = [];
    if (v.focus) chips.push(['focus', '🎯 Modo foco: só hoje e atrasados']);
    if (v.rewatch) chips.push(['rewatch', '🔁 Quero rever']);
    if (v.collection) { const c = V40.collections.find(x => x.id === v.collection); chips.push(['collection', '🗂 ' + (c ? c.name : 'coleção')]); }
    const sortNames = { 'rating-desc': '⭐ Maior nota', 'rating-asc': '⭐ Menor nota', 'done-recent': '🕒 Vistos recentemente', hero: '🦸 Por herói', name: '🔤 Nome' };
    if (v.sort) chips.push(['sort', 'Ordem: ' + sortNames[v.sort]]);
    if (v.adv) chips.push(['adv', '🧪 Filtro avançado']);
    bar.style.display = chips.length ? 'flex' : 'none';
    bar.innerHTML = chips.map(([k, l]) => `<span class="v40-chip">${V40.esc(l)}<button data-clear="${k}" title="Tirar">✕</button></span>`).join('');
    bar.querySelectorAll('[data-clear]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.clear;
      if (k === 'focus') v.focus = false;
      if (k === 'rewatch') v.rewatch = false;
      if (k === 'collection') v.collection = null;
      if (k === 'sort') v.sort = null;
      if (k === 'adv') v.adv = null;
      V40.set('view', v);
      render(); V40.updateViewBar(); V40.syncMenuChecks();
    }));
  };

  // itens novos no menu "Filtrar" da Lista
  function injectFilterMenu() {
    const menu = document.getElementById('filterMenu');
    if (!menu || menu.querySelector('.v40-menu')) return;
    const add = (id, label, fn) => {
      const b = document.createElement('button');
      b.id = id; b.className = 'v40-menu'; b.textContent = label;
      b.addEventListener('click', ev => { ev.stopPropagation(); fn(b); menu.classList.remove('open'); });
      menu.appendChild(b);
      return b;
    };
    const sep = document.createElement('div'); sep.className = 'v40-menu-sep'; sep.textContent = 'V40'; menu.appendChild(sep);
    add('v40BtnFocus', '☐ 🎯 Modo foco (só hoje + atrasados)', () => { V40.view.focus = !V40.view.focus; V40.afterViewChange(); });
    add('v40BtnRewatch', '☐ 🔁 Só "quero rever"', () => { V40.view.rewatch = !V40.view.rewatch; V40.afterViewChange(); });
    add('v40BtnCollections', '🗂 Coleções…', () => V40.openCollectionsManager());
    add('v40BtnSort', '↕️ Ordenar por…', () => V40.openSortPicker());
    add('v40BtnAdv', '🧪 Filtro avançado…', () => V40.openAdvancedFilter());
  }
  V40.syncMenuChecks = function () {
    const f = document.getElementById('v40BtnFocus');
    if (f) { f.textContent = (V40.view.focus ? '☑' : '☐') + ' 🎯 Modo foco (só hoje + atrasados)'; f.classList.toggle('menu-active', V40.view.focus); }
    const r = document.getElementById('v40BtnRewatch');
    if (r) { r.textContent = (V40.view.rewatch ? '☑' : '☐') + ' 🔁 Só "quero rever"'; r.classList.toggle('menu-active', V40.view.rewatch); }
  };
  V40.afterViewChange = function () {
    V40.set('view', V40.view);
    render(); V40.updateViewBar(); V40.syncMenuChecks();
  };
  V40.openSortPicker = function () {
    const opts = [[null, '📅 Cronológica (padrão, por fase)'], ['rating-desc', '⭐ Maior nota primeiro'], ['rating-asc', '⭐ Menor nota primeiro'], ['done-recent', '🕒 Vistos mais recentemente'], ['hero', '🦸 Por herói/grupo'], ['name', '🔤 Por nome']];
    V40.modal(`<h3>↕️ Ordenar a lista</h3>${opts.map(([k, l]) => `<button class="v40-pick ${V40.view.sort === k ? 'on' : ''}" data-sort="${k === null ? '' : k}">${l}</button>`).join('')}`);
    document.querySelectorAll('[data-sort]').forEach(b => b.addEventListener('click', () => {
      V40.view.sort = b.dataset.sort || null;
      closeModal(); V40.afterViewChange();
    }));
  };
  V40.openAdvancedFilter = function () {
    const a = V40.view.adv || {};
    const heroOpts = HERO_GROUPS.map(g => `<option value="${g.id}" ${a.hero === g.id ? 'selected' : ''}>${g.emoji} ${V40.esc(V40.heroLabel(g))}</option>`).join('');
    const phaseOpts = PHASE_ORDER.map(p => `<option value="${V40.esc(p)}" ${a.phase === p ? 'selected' : ''}>${V40.esc(p.length > 40 ? p.slice(0, 38) + '…' : p)}</option>`).join('');
    const sel = (id, opts, cur) => `<select id="${id}">${opts.map(([v, l]) => `<option value="${v}" ${String(cur || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    V40.modal(`<h3>🧪 Filtro avançado</h3>
      <p class="v40-muted">Combine o que quiser. Ex.: séries de animação, nota acima de 8, já vistas.</p>
      <div class="v40-form">
        <label>Situação ${sel('advStatus', [['', 'Tudo'], ['done', 'Vistos'], ['pending', 'Não vistos'], ['progress', 'Em andamento']], a.status)}</label>
        <label>Tipo ${sel('advKind', [['', 'Tudo'], ['filme', 'Filmes/curtas'], ['serie', 'Séries'], ['jogo', 'Jogos']], a.kind)}</label>
        <label>Formato ${sel('advAnim', [['', 'Tudo'], ['anim', '🎨 Animação'], ['live', '🎬 Live action']], a.anim)}</label>
        <label>Nota ${sel('advRated', [['', 'Tanto faz'], ['yes', 'Com nota'], ['no', 'Sem nota']], a.rated)}</label>
        <label>Nota mínima <input id="advMin" type="number" min="0" max="10" step="0.5" value="${a.min != null ? a.min : ''}"></label>
        <label>Nota máxima <input id="advMax" type="number" min="0" max="10" step="0.5" value="${a.max != null ? a.max : ''}"></label>
        <label>Herói/grupo <select id="advHero"><option value="">Todos</option>${heroOpts}</select></label>
        <label>Fase <select id="advPhase"><option value="">Todas</option>${phaseOpts}</select></label>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;"><button id="advApply" class="v40-primary">Aplicar</button><button id="advClear">Limpar</button></div>`);
    document.getElementById('advApply').addEventListener('click', () => {
      const val = id => document.getElementById(id).value;
      const adv = { status: val('advStatus'), kind: val('advKind'), anim: val('advAnim'), rated: val('advRated'), min: val('advMin'), max: val('advMax'), hero: val('advHero'), phase: val('advPhase') };
      const empty = Object.values(adv).every(x => x === '' || x == null);
      V40.view.adv = empty ? null : adv;
      closeModal(); V40.afterViewChange();
    });
    document.getElementById('advClear').addEventListener('click', () => { V40.view.adv = null; closeModal(); V40.afterViewChange(); });
  };

  // ---------- deslizar o dedo pra marcar como visto ----------
  function wireSwipe() {
    const main = document.getElementById('main');
    if (!main) return;
    let sx = 0, sy = 0, row = null, dx = 0, active = false;
    main.addEventListener('touchstart', ev => {
      if (!V40.settings.swipe || ev.touches.length !== 1) return;
      const r = ev.target.closest('.item');
      if (!r || ev.target.closest('button, input, select, textarea, .rating-widget')) return;
      row = r; sx = ev.touches[0].clientX; sy = ev.touches[0].clientY; dx = 0; active = false;
    }, { passive: true });
    main.addEventListener('touchmove', ev => {
      if (!row) return;
      const x = ev.touches[0].clientX, y = ev.touches[0].clientY;
      dx = x - sx;
      const dy = y - sy;
      if (!active) {
        if (Math.abs(dy) > 14) { row = null; return; }
        if (Math.abs(dx) > 18) active = true;
      }
      if (active) {
        const cl = Math.max(-120, Math.min(120, dx));
        row.style.transform = `translateX(${cl}px)`;
        row.classList.toggle('v40-swipe-ok', dx > 90);
        row.classList.toggle('v40-swipe-undo', dx < -90 && row.classList.contains('done'));
      }
    }, { passive: true });
    const end = () => {
      if (!row) return;
      const r = row; row = null;
      r.style.transform = '';
      const ok = r.classList.contains('v40-swipe-ok');
      const undo = r.classList.contains('v40-swipe-undo');
      r.classList.remove('v40-swipe-ok', 'v40-swipe-undo');
      if (!active) return;
      const id = parseInt(r.dataset.id, 10);
      const it = items.find(i => i.id === id);
      if (!it) return;
      const check = r.querySelector('.check');
      if (ok && !it.done && check) toggleDone(id, check);
      else if (undo && it.done && check) {
        if (confirm('Desmarcar "' + V40.cleanName(it) + '" como visto?')) toggleDone(id, check);
      }
    };
    main.addEventListener('touchend', end);
    main.addEventListener('touchcancel', end);
  }

  // ---------- episódios: marcar vários de uma vez ----------
  // Ao abrir a lista de episódios, aparece "✓ Marcar até hoje" e, em cada episódio, segurar o dedo
  // (ou dois toques rápidos no número) marca TODOS até ele.
  function enhanceEpisodeModal() {
    const list = document.querySelector('#modalBox .interleaved-list');
    if (!list || list.dataset.v40) return;
    list.dataset.v40 = '1';
    const bar = document.createElement('div');
    bar.className = 'v40-ep-bar';
    bar.innerHTML = '<button id="v40EpToday">✓ Marcar todos até hoje</button><span class="v40-muted">Dica: segure o dedo num episódio (ou toque 2× no número) pra marcar todos até ele.</span>';
    list.parentNode.insertBefore(bar, list);
    const rows = () => Array.from(list.querySelectorAll('.interleaved-row'));
    const markUpTo = (idx) => {
      if (!V40.guard()) return;
      const rs = rows();
      let n = 0;
      for (let i = 0; i <= idx && i < rs.length; i++) {
        const cb = rs[i].querySelector('input[type="checkbox"]');
        if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); n++; }
      }
      V40.toast(n ? `✓ ${n} episódio${n === 1 ? '' : 's'} marcado${n === 1 ? '' : 's'}` : 'Já estava tudo marcado até aí');
    };
    document.getElementById('v40EpToday').addEventListener('click', () => {
      const t = V40.today();
      const rs = rows();
      let last = -1;
      rs.forEach((r, i) => {
        const d = r.querySelector('.iv-date');
        const txt = d ? d.textContent.trim() : '';
        if (!txt) return;
        const [dd, mm] = txt.split('/');
        // data sem ano: decide o ano pelo mais próximo de hoje
        const y = parseInt(t.slice(0, 4), 10);
        const cands = [y - 1, y, y + 1].map(yy => `${yy}-${mm}-${dd}`);
        const iso = cands.reduce((best, c) => Math.abs(V40.daysBetween(t, c)) < Math.abs(V40.daysBetween(t, best)) ? c : best, cands[1]);
        if (iso <= t) last = i;
      });
      if (last < 0) { V40.toast('Nenhum episódio programado até hoje'); return; }
      markUpTo(last);
    });
    rows().forEach((r, i) => {
      let timer = null;
      r.addEventListener('touchstart', ev => {
        if (ev.target.closest('.ep-rate')) return;
        timer = setTimeout(() => { timer = null; if (navigator.vibrate) navigator.vibrate(20); markUpTo(i); }, 600);
      }, { passive: true });
      ['touchend', 'touchmove', 'touchcancel'].forEach(evn => r.addEventListener(evn, () => { if (timer) { clearTimeout(timer); timer = null; } }, { passive: true }));
      const num = r.querySelector('.iv-num');
      if (num) num.addEventListener('dblclick', ev => { ev.preventDefault(); markUpTo(i); });
    });
  }

  // observa a janela (modal) pra melhorar a lista de episódios quando ela abrir
  function watchModal() {
    const box = document.getElementById('modalBox');
    if (!box) return;
    new MutationObserver(() => { try { enhanceEpisodeModal(); } catch (e) { console.error(e); } }).observe(box, { childList: true });
  }

  // ---------- chip "salvo" no topo ----------
  function injectSavedChip() {
    const sp = document.getElementById('stickyProgress');
    if (!sp || document.getElementById('v40SavedChip')) return;
    const chip = document.createElement('span');
    chip.id = 'v40SavedChip';
    chip.className = 'v40-saved-chip';
    chip.title = 'Tudo fica salvo neste aparelho (funciona sem internet)';
    chip.textContent = '💾 salvo no aparelho';
    sp.insertBefore(chip, sp.lastElementChild);
    const ro = document.createElement('span');
    ro.id = 'v40ReadOnlyChip';
    ro.className = 'v40-ro-chip';
    ro.textContent = '👁 só leitura';
    sp.insertBefore(ro, chip);
  }
  V40.applyReadOnlyUI = function () {
    document.body.classList.toggle('v40-readonly', !!V40.settings.readOnly);
  };

  // ---------- depois de cada render() ----------
  window.v40AfterRender = function () {
    if (V40.renderHomeExtra) V40.renderHomeExtra();
    V40.updateViewBar();
    V40.recordDayStatus();
  };

  // ---------- init ----------
  V40.init = function () {
    // estado salvo da lista (foco etc.)
    const savedView = V40.get('view', null);
    if (savedView) Object.assign(V40.view, savedView);
    // apelidos de heróis: muda só o nome exibido
    V40.applyNicknames();
    injectLigaTab();
    injectFilterMenu();
    injectSavedChip();
    wireSwipe();
    watchModal();
    V40.applyReadOnlyUI();
    const purged = V40.purgeTrash();
    V40._state = snapshotState();
    if (purged) { V40._allowSave = true; save(); V40._allowSave = false; }
    V40.syncMenuChecks();
  };
})();
