/* =====================================================================
 * UCM Watchlist — v40.7 — 📺 Liga dos Episódios
 *  - Entram só os episódios de série que você vê a partir de 19/10/2026 (inclui os de hoje).
 *  - Liga da semana (segunda a domingo): os episódios vistos na semana jogam todos contra todos
 *    entre si (vitória 3, empate 1, derrota 0). O campeão da semana vai pra Copa dos Campeões.
 *  - Copa dos Campeões: mata-mata com os campeões de cada semana (sem empate).
 * ===================================================================== */
(function () {
  'use strict';
  const V40 = window.V40;
  const START = '2026-10-19';
  const LOG = 'eps-log';          // [{k: key do item, e: índice do episódio, d: data}]
  const SNAP = 'eps-snap';        // último estado conhecido dos episódios de cada série
  const RES = 'eps-res';          // { semana: { res: {par: a|b|d}, log: [par] } }
  const COPA = 'eps-copa';
  const today = () => V40.today();

  // ---------- episódios de cada série ----------
  const isSerie = it => it && it.key && simpleKind(it) === 'serie';
  const epsOf = it => extractEpsCount(it.text) || 1;
  function epState(it) {
    const n = epsOf(it);
    if (it.done) return new Array(n).fill(true);
    const d = Array.isArray(it.epDone) ? it.epDone : [];
    return Array.from({ length: n }, (_, i) => !!d[i]);
  }
  function snapAll() {
    const m = {};
    items.forEach(it => { if (isSerie(it)) m[it.key] = epState(it).map(b => b ? 1 : 0).join(''); });
    return m;
  }
  function getLog() { return V40.get(LOG, []) || []; }
  // registra episódio marcado / tira o desmarcado (compara com o último estado)
  function track() {
    if (today() < START) return;
    const prev = V40.get(SNAP, null);
    const now = snapAll();
    if (!prev) {
      // primeira vez: só entram os episódios de HOJE que já estão marcados (ex.: os 3 da dupla)
      const log = getLog();
      items.forEach(it => {
        if (!isSerie(it)) return;
        const st = epState(it), n = st.length;
        st.forEach((on, e) => {
          if (!on) return;
          const d = typeof episodeDateFor === 'function' ? episodeDateFor(it, e, n) : null;
          if (d === today() && !log.some(x => x.k === it.key && x.e === e)) log.push({ k: it.key, e, d: today() });
        });
      });
      V40.set(LOG, log);
      V40.set(SNAP, now);
      return;
    }
    let log = null;
    Object.keys(now).forEach(k => {
      const a = prev[k] || '', b = now[k];
      if (a === b) return;
      log = log || getLog();
      for (let e = 0; e < b.length; e++) {
        const was = a[e] === '1', is = b[e] === '1';
        if (!was && is && !log.some(x => x.k === k && x.e === e)) log.push({ k, e, d: today() });
        if (was && !is) log = log.filter(x => !(x.k === k && x.e === e && x.d >= START));
      }
    });
    if (log) V40.set(LOG, log);
    V40.set(SNAP, now);
  }
  const origSave = window.save;
  window.save = function () {
    const r = origSave.apply(this, arguments);
    try { track(); } catch (e) { console.error('eps track', e); }
    return r;
  };

  // ---------- nome do episódio: "Série T2E05" ----------
  function epCode(it, e) {
    const c = V40.catOf ? V40.catOf(it) : null;
    const x = (c && c.x) || {};
    const pad = n => String(n).padStart(2, '0');
    if (c && c.type === 'ep' && x.s && x.e) return `T${x.s}E${pad(x.e)}`;
    const seasons = Array.isArray(x.s) ? x.s : (x.s != null ? [x.s] : null);
    const sizes = V40.seasonSizesOf ? V40.seasonSizesOf(it) : null;
    if (seasons && seasons.length > 1 && sizes && sizes.length === seasons.length) {
      let si = 0, rem = e;
      while (si < sizes.length - 1 && rem >= sizes[si]) { rem -= sizes[si]; si++; }
      return `T${seasons[si]}E${pad(rem + 1)}`;
    }
    const m = /\bT(\d+)\b/.exec(it.text);
    const s = seasons ? seasons[0] : (m ? +m[1] : 1);
    return `T${s}E${pad((x.from || 1) + e)}`;
  }
  function epTeam(entry) {
    const it = items.find(i => i.key === entry.k);
    if (!it || !isSerie(it)) return null;
    const base = V40.teamBase ? V40.teamBase(V40.shortName(it)) : V40.shortName(it);
    const pid = 'E:' + entry.k + ':' + entry.e;
    const poster = V40.posterUrl ? V40.posterUrl(it, 'w185') : null;
    return { pid, it, e: entry.e, d: entry.d, base, name: `${base} ${epCode(it, entry.e)}`, icon: V40.kindIcon(it), poster };
  }

  // ---------- semanas (segunda a domingo) ----------
  function mondayOf(iso) {
    const d = new Date(iso + 'T12:00:00');
    const wd = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - wd);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  V40.epsWeeks = function () {
    const by = {};
    getLog().forEach(x => {
      if (x.d < START) return;
      const t = epTeam(x);
      if (!t) return;
      const w = mondayOf(x.d);
      (by[w] = by[w] || []).push(t);
    });
    return Object.keys(by).sort().map(w => ({ w, teams: by[w] }));
  };
  const pairKey = (a, b) => (a < b ? a + '§' + b : b + '§' + a);
  const wres = w => { const all = V40.get(RES, {}) || {}; return all[w] || { res: {}, log: [] }; };
  function saveW(w, st) { const all = V40.get(RES, {}) || {}; all[w] = st; V40.set(RES, all); }
  V40.epsStandings = function (week) {
    const st = wres(week.w);
    const by = {};
    const list = week.teams.map(t => (by[t.pid] = Object.assign({}, t, { J: 0, V: 0, E: 0, D: 0, P: 0, mp: 0 })));
    Object.keys(st.res).forEach(k => {
      const [a, b] = k.split('§'); const A = by[a], B = by[b];
      if (!A || !B) return;
      const r = st.res[k];
      A.J++; B.J++;
      if (r === 'd') { A.E++; B.E++; A.P++; B.P++; } else if (r === 'a') { A.V++; B.D++; A.P += 3; } else { B.V++; A.D++; B.P += 3; }
    });
    const alpha = (x, y) => x.name.localeCompare(y.name, 'pt-BR', { sensitivity: 'base' });
    list.sort((x, y) => (y.P - x.P) || (y.V - x.V) || alpha(x, y));
    // confronto direto entre empatados em pontos e vitórias
    for (let i = 0; i < list.length;) {
      let j = i;
      while (j + 1 < list.length && list[j + 1].P === list[i].P && list[j + 1].V === list[i].V) j++;
      if (j > i) {
        const grp = list.slice(i, j + 1), ids = new Set(grp.map(t => t.pid));
        Object.keys(st.res).forEach(k => { const [a, b] = k.split('§'); if (!ids.has(a) || !ids.has(b)) return; const r = st.res[k]; if (r === 'd') { by[a].mp++; by[b].mp++; } else if (r === 'a') by[a].mp += 3; else by[b].mp += 3; });
        grp.sort((x, y) => (y.mp - x.mp) || alpha(x, y));
        list.splice(i, grp.length, ...grp);
      }
      i = j + 1;
    }
    list.forEach((t, i) => { t.pos = i + 1; });
    const n = list.length, total = n * (n - 1) / 2;
    const played = Object.keys(st.res).filter(k => { const [a, b] = k.split('§'); return by[a] && by[b]; }).length;
    const closed = week.w < mondayOf(today()) && played >= total && n >= 1;
    return { list, played, total, closed, champion: closed ? list[0] : null };
  };
  function nextMatch(week) {
    const st = wres(week.w);
    const J = {};
    week.teams.forEach(t => { J[t.pid] = 0; });
    Object.keys(st.res).forEach(k => { const [a, b] = k.split('§'); if (a in J && b in J) { J[a]++; J[b]++; } });
    let best = null, bs = Infinity;
    const T = week.teams;
    for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
      const k = pairKey(T[i].pid, T[j].pid);
      if (st.res[k]) continue;
      const sc = (J[T[i].pid] + J[T[j].pid]) * 1000 + ((i * 131 + j * 977 + st.log.length * 7919) % 997);
      if (sc < bs) { bs = sc; best = [T[i], T[j]]; }
    }
    return best;
  }
  // semana "da vez": a mais antiga que ainda tem jogo pendente (senão, a atual)
  function currentWeek(weeks) {
    for (const wk of weeks) { const s = V40.epsStandings(wk); if (s.played < s.total) return wk; }
    return weeks[weeks.length - 1] || null;
  }
  function champions(weeks) {
    return weeks.map(wk => ({ wk, s: V40.epsStandings(wk) })).filter(x => x.s.champion).map(x => Object.assign({}, x.s.champion, { week: x.wk.w, pts: x.s.champion.P }));
  }

  // ---------- Copa dos Campeões (mata-mata, sem empate) ----------
  function seedOrder(size) { let o = [1]; while (o.length < size) { const n = o.length * 2 + 1; o = o.reduce((a, s) => a.concat([s, n - s]), []); } return o; }
  const roundName = size => size === 2 ? 'Final' : size === 4 ? 'Semifinal' : size === 8 ? 'Quartas' : size === 16 ? 'Oitavas' : 'Fase de ' + size;
  function copaSolve(ed) {
    const N = ed.seeds.length;
    let size = 2; while (size < N) size *= 2;
    const slots = seedOrder(size).map(s => (s <= N ? ed.seeds[s - 1] : null));
    const games = [];
    let round = []; for (let i = 0; i < slots.length; i += 2) round.push([slots[i], slots[i + 1]]);
    let r = 0, sz = size, champion = null;
    while (round.length) {
      const win = [];
      round.forEach(([a, b], i) => {
        const key = 'k' + r + '_' + i;
        const g = { key, a, b, size: sz, label: roundName(sz) + (round.length > 1 ? ' · jogo ' + (i + 1) : ''), w: undefined, done: false, played: false };
        if (a !== undefined && b !== undefined) {
          if (!a || !b) { g.w = a || b || null; g.done = true; }
          else if (ed.res[key]) { g.w = ed.res[key] === 'a' ? a : b; g.done = true; g.played = true; }
        }
        games.push(g); win.push(g.done ? g.w : undefined);
      });
      if (round.length === 1) { const f = games[games.length - 1]; if (f.done && f.w) champion = f.w; break; }
      const nx = []; for (let i = 0; i < win.length; i += 2) nx.push([win[i], win[i + 1]]);
      round = nx; sz /= 2; r++;
    }
    return { games, champion };
  }

  // ---------- tela ----------
  const card = (t, attrs) => `<button class="v40-l4-team" ${attrs}>
      ${t.poster ? `<img src="${t.poster}" alt="" onerror="this.outerHTML='<span class=&quot;ph&quot;>${t.icon}</span>'">` : `<span class="ph">${t.icon}</span>`}
      <span class="nm">${V40.esc(t.name)}</span><small class="v40-muted">visto ${V40.fmtBR(t.d, true)}</small>
    </button>`;
  const fmtW = w => { const end = V40.addDays(w, 6); return `${V40.fmtBR(w, true).slice(0, 5)} a ${V40.fmtBR(end, true).slice(0, 5)}`; };
  V40.epsLeagueHtml = function () {
    try { track(); } catch (e) {}
    const weeks = V40.epsWeeks();
    const rules = `<details class="v40-help"><summary>📜 Regulamento da Liga dos Episódios</summary><ol style="margin:6px 0 0 18px;padding:0;font-size:0.8rem;">
      <li>Entram os episódios de série que você vê a partir de 19/10/2026 (os de hoje inclusive). Desmarcou, sai.</li>
      <li>Toda semana (segunda a domingo) os episódios vistos nela jogam todos contra todos entre si. Vitória 3 · empate 1 · derrota 0.</li>
      <li>Desempate: vitórias ▸ confronto direto ▸ ordem alfabética.</li>
      <li>Quando a semana termina e todos os jogos dela foram disputados, o 1º colocado é o campeão da semana.</li>
      <li>Os campeões das semanas jogam a 🏆 Copa dos Campeões (mata-mata, sem empate).</li></ol></details>`;
    if (!weeks.length) return `<div class="stat-card"><h4>📺 Liga dos Episódios</h4><p>Ainda não tem episódio. Marque os episódios que você vê (a partir de hoje) e eles entram na liga da semana.</p>${rules}</div>`;
    const wk = currentWeek(weeks);
    const s = V40.epsStandings(wk);
    const m = nextMatch(wk);
    const st = wres(wk.w);
    const game = m ? `<div class="stat-card"><h4>⚽ Semana ${fmtW(wk.w)} — jogo ${s.played + 1} de ${s.total}</h4>
        <p class="v40-muted" style="margin-top:-4px;">Qual episódio foi melhor? Toque no vencedor, ou no = pra empate.</p>
        <div class="v40-l4-match">${card(m[0], `data-ep="a" data-ta="${m[0].pid}" data-tb="${m[1].pid}" data-w="${wk.w}"`)}
          <button class="v40-l4-draw" data-ep="d" data-ta="${m[0].pid}" data-tb="${m[1].pid}" data-w="${wk.w}">=</button>
          ${card(m[1], `data-ep="b" data-ta="${m[0].pid}" data-tb="${m[1].pid}" data-w="${wk.w}"`)}</div>
        <div style="display:flex;gap:8px;margin-top:10px;"><button id="v40EpUndo" data-w="${wk.w}" ${st.log.length ? '' : 'disabled'}>↺ Desfazer último</button></div>
      </div>` : `<div class="stat-card"><h4>⚽ Semana ${fmtW(wk.w)}</h4><p>${s.total ? '✅ Todos os jogos desta semana foram disputados.' : 'Só 1 episódio nesta semana até agora — os jogos aparecem quando tiver 2 ou mais.'}${!s.closed && s.total ? ' O campeão sai quando a semana acabar (domingo).' : ''}</p></div>`;
    const table = `<div class="stat-card"><h4>📋 Tabela da semana ${fmtW(wk.w)} ${s.closed ? '· encerrada' : ''}</h4>
      <div class="v40-l4row head"><span class="lpos">#</span><span class="lname">EPISÓDIO</span><span>J</span><span>V</span><span>E</span><span>D</span><span class="lpts">P</span></div>
      ${s.list.map(t => `<div class="v40-l4row ${t.pos === 1 ? 'lib' : ''}"><span class="lpos">${t.pos}º</span><span class="lname">${t.pos === 1 && t.J ? '👑 ' : ''}${t.icon} ${V40.esc(t.name)}</span><span>${t.J}</span><span>${t.V}</span><span>${t.E}</span><span>${t.D}</span><span class="lpts">${t.P}</span></div>`).join('')}
      <p class="v40-muted" style="margin:6px 0 0;">${s.played}/${s.total} jogos · ${s.list.length} episódios nesta semana</p></div>`;
    const ch = champions(weeks);
    const past = ch.length ? `<div class="stat-card"><h4>🏅 Campeões das semanas</h4>${ch.slice().reverse().map(c => `<div class="v40-row"><span style="flex:1">${c.icon} <b>${V40.esc(c.name)}</b><br><small class="v40-muted">semana ${fmtW(c.week)} · ${c.pts} pts</small></span></div>`).join('')}</div>` : '';
    // Copa dos Campeões
    const ed = V40.get(COPA, null);
    let copa = '';
    if (!ed) {
      copa = `<div class="stat-card"><h4>🏆 Copa dos Campeões</h4>${ch.length >= 2 ? `<p class="v40-muted">${ch.length} campeões de semana classificados. O ideal é começar no fim da lista, com todas as semanas.</p><button class="v40-primary" id="v40EpCopaStart" style="width:100%;">▶️ Começar a Copa dos Campeões</button>` : '<p class="v40-muted">Precisa de pelo menos 2 campeões de semana.</p>'}</div>`;
    } else {
      const S = copaSolve(ed);
      const all = {}; ch.forEach(c => { all[c.pid] = c; });
      (ed.info || []).forEach(c => { all[c.pid] = all[c.pid] || c; });
      const nm = pid => pid && all[pid] ? `${all[pid].icon} ${V40.esc(all[pid].name)}` : (pid === null ? '<i class="v40-muted">passa direto</i>' : '<i class="v40-muted">a definir</i>');
      const cur = S.games.find(g => !g.done && g.a && g.b);
      copa = `<div class="stat-card"><h4>🏆 Copa dos Campeões</h4>
        ${S.champion ? `<div class="v40-ko-champ" style="padding:10px;border-radius:10px;"><div class="v40-champ-crown">👑</div><div class="v40-muted">MELHOR EPISÓDIO</div><div class="v40-big">${nm(S.champion)}</div></div>` : ''}
        ${cur ? `<p><b>${cur.label}</b> — toque no vencedor:</p><div class="v40-l4-match">${card(all[cur.a] || { name: '?', icon: '❔', d: '' }, `data-epk="${cur.key}" data-side="a"`)}<div class="v40-vs">VS</div>${card(all[cur.b] || { name: '?', icon: '❔', d: '' }, `data-epk="${cur.key}" data-side="b"`)}</div>` : ''}
        <div class="v40-ko-bracket" style="margin-top:8px;">${[...new Set(S.games.map(g => g.size))].map(sz => `<div class="v40-ko-round"><div class="v40-ko-rname">${roundName(sz)}</div>${S.games.filter(g => g.size === sz).map(g => `<div class="v40-ko-m"><span class="${g.done && g.w && g.w === g.a ? 'win' : (g.played ? 'lose' : '')}">${g.a === undefined ? '<i class="v40-muted">a definir</i>' : nm(g.a)}</span><span class="${g.done && g.w && g.w === g.b ? 'win' : (g.played ? 'lose' : '')}">${g.b === undefined ? '<i class="v40-muted">a definir</i>' : nm(g.b)}</span></div>`).join('')}</div>`).join('')}</div>
        <div style="display:flex;gap:8px;margin-top:8px;"><button id="v40EpCopaUndo" ${ed.log.length ? '' : 'disabled'}>↺ Desfazer</button><button id="v40EpCopaReset" class="v40-danger">🔄 Recomeçar</button></div></div>`;
    }
    const otherWeeks = weeks.filter(x => x.w !== wk.w).reverse().slice(0, 8);
    const hist = otherWeeks.length ? `<details class="v40-cfg-group"><summary>🗓 Outras semanas</summary><div>${otherWeeks.map(x => { const ss = V40.epsStandings(x); return `<div class="v40-row"><span style="flex:1">${fmtW(x.w)} · ${x.teams.length} episódios<br><small class="v40-muted">${ss.played}/${ss.total} jogos${ss.champion ? ' · 👑 ' + V40.esc(ss.champion.name) : ''}</small></span></div>`; }).join('')}</div></details>` : '';
    return `<div class="stat-card"><h4>📺 Liga dos Episódios</h4><p class="v40-muted" style="margin:0;">Os episódios que você vê na semana se enfrentam. O campeão de cada semana vai pra Copa dos Campeões.</p>${rules}</div>${game}${table}${past}${copa}${hist}`;
  };
  V40.wireEps = function (el) {
    el.querySelectorAll('[data-ep]').forEach(b => b.addEventListener('click', () => {
      if (!V40.guard()) return;
      const w = b.dataset.w, a = b.dataset.ta, c = b.dataset.tb, r = b.dataset.ep;
      const st = wres(w);
      const k = pairKey(a, c);
      let val = 'd';
      if (r !== 'd') { const winner = r === 'a' ? a : c; val = k.split('§')[0] === winner ? 'a' : 'b'; }
      st.res[k] = val; st.log.push(k);
      saveW(w, st);
      V40.sound && V40.sound('tick');
      V40.renderLiga();
    }));
    const u = document.getElementById('v40EpUndo');
    if (u) u.addEventListener('click', () => { const st = wres(u.dataset.w); const k = st.log.pop(); if (k) { delete st.res[k]; saveW(u.dataset.w, st); V40.renderLiga(); } });
    const cs = document.getElementById('v40EpCopaStart');
    if (cs) cs.addEventListener('click', () => {
      const ch = champions(V40.epsWeeks()).sort((x, y) => (y.pts - x.pts) || (x.week < y.week ? -1 : 1));
      V40.set(COPA, { created: new Date().toISOString(), seeds: ch.map(c => c.pid), info: ch.map(c => ({ pid: c.pid, name: c.name, icon: c.icon, d: c.d, poster: c.poster })), res: {}, log: [] });
      V40.renderLiga();
    });
    el.querySelectorAll('[data-epk]').forEach(b => b.addEventListener('click', () => {
      if (!V40.guard()) return;
      const ed = V40.get(COPA, null); if (!ed) return;
      ed.res[b.dataset.epk] = b.dataset.side; ed.log.push(b.dataset.epk);
      const S = copaSolve(ed);
      if (S.champion && !ed.champion) { ed.champion = S.champion; V40.confetti && V40.confetti(true); V40.sound && V40.sound('trophy'); }
      V40.set(COPA, ed); V40.renderLiga();
    }));
    const cu = document.getElementById('v40EpCopaUndo');
    if (cu) cu.addEventListener('click', () => { const ed = V40.get(COPA, null); if (!ed) return; const k = ed.log.pop(); if (k) delete ed.res[k]; ed.champion = null; V40.set(COPA, ed); V40.renderLiga(); });
    const cr = document.getElementById('v40EpCopaReset');
    if (cr) cr.addEventListener('click', () => { if (confirm('Recomeçar a Copa dos Campeões?')) { V40.set(COPA, null); V40.renderLiga(); } });
  };

  // ao abrir: começa a acompanhar (e pega os episódios de hoje já marcados)
  setTimeout(() => { try { track(); } catch (e) {} }, 1500);
})();
