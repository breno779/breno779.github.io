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
        const skipped = typeof isSkippedEp === 'function' && isSkippedEp(k, e);
        if (!was && is && !skipped && !log.some(x => x.k === k && x.e === e)) log.push({ k, e, d: today() });
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
  function epSN(it, e) {
    const c = V40.catOf ? V40.catOf(it) : null;
    const x = (c && c.x) || {};
    if (c && c.type === 'ep' && x.s && x.e) return { s: +x.s, n: +x.e };
    const seasons = Array.isArray(x.s) ? x.s : (x.s != null ? [x.s] : null);
    const sizes = V40.seasonSizesOf ? V40.seasonSizesOf(it) : null;
    if (seasons && seasons.length > 1 && sizes && sizes.length === seasons.length) {
      let si = 0, rem = e;
      while (si < sizes.length - 1 && rem >= sizes[si]) { rem -= sizes[si]; si++; }
      return { s: +seasons[si], n: rem + 1 };
    }
    const m = /\bT(\d+)\b/.exec(it.text);
    return { s: seasons ? +seasons[0] : (m ? +m[1] : 1), n: (x.from || 1) + e };
  }
  function epCode(it, e) { const r = epSN(it, e); return `T${r.s}E${String(r.n).padStart(2, '0')}`; }

  // episódio que não veio junto da série (ex.: contagem diferente no TVmaze): busca ele sozinho
  const EPK = 'v40ep-cache';
  let epCache = null; const epPending = {};
  function epLoad() { if (!epCache) { try { epCache = JSON.parse(localStorage.getItem(EPK) || '{}') || {}; } catch (e) { epCache = {}; } } return epCache; }
  function epFetch(it, e) {
    const sn = epSN(it, e), id = it.key + '|' + sn.s + '|' + sn.n;
    const c = epLoad()[id];
    if (c !== undefined) return c;
    if (!epPending[id] && navigator.onLine && V40.epDetails) {
      epPending[id] = true;
      V40.epDetails(it, sn.s, sn.n).then(r => {
        epLoad()[id] = r || { none: 1 };
        try { localStorage.setItem(EPK, JSON.stringify(epCache)); } catch (er) {}
        if (r && V40.ligaTab === 'eps' && V40.renderLiga) { try { V40.renderLiga(); } catch (er) {} }
      }).catch(() => {});
    }
    return null;
  }
  function epTeam(entry) {
    const it = items.find(i => i.key === entry.k);
    if (!it || !isSerie(it)) return null;
    if (typeof isSkippedEp === 'function' && isSkippedEp(entry.k, entry.e)) return null; // ⏭️ pulado: não joga
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
    const list = week.teams.map(t => (by[t.pid] = Object.assign({}, t, { J: 0, V: 0, E: 0, D: 0, P: 0, mp: 0, GP: 0, GC: 0, SG: 0 })));
    Object.keys(st.res).forEach(k => {
      const [a, b] = k.split('§'); const A = by[a], B = by[b];
      if (!A || !B) return;
      const r = st.res[k];
      A.J++; B.J++;
      const g = V40.futGoals((st.score || {})[k], r);
      A.GP += g[0]; A.GC += g[1]; B.GP += g[1]; B.GC += g[0]; A.SG = A.GP - A.GC; B.SG = B.GP - B.GC;
      if (r === 'd') { A.E++; B.E++; A.P++; B.P++; } else if (r === 'a') { A.V++; B.D++; A.P += 3; } else { B.V++; A.D++; B.P += 3; }
    });
    const alpha = (x, y) => x.name.localeCompare(y.name, 'pt-BR', { sensitivity: 'base' });
    list.sort((x, y) => (y.P - x.P) || (y.V - x.V) || (y.SG - x.SG) || (y.GP - x.GP) || alpha(x, y));
    // confronto direto entre empatados em pontos, vitórias, saldo e gols
    for (let i = 0; i < list.length;) {
      let j = i;
      while (j + 1 < list.length && list[j + 1].P === list[i].P && list[j + 1].V === list[i].V && list[j + 1].SG === list[i].SG && list[j + 1].GP === list[i].GP) j++;
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

  // ---------- tradução pro português (quando o TMDB não tem o texto em pt) ----------
  const TRK = 'v40tr-cache';
  let trCache = null, trQueue = [], trBusy = false, trFail = false;
  function trLoad() { if (!trCache) { try { trCache = JSON.parse(localStorage.getItem(TRK) || '{}') || {}; } catch (e) { trCache = {}; } } return trCache; }
  function trSave() { try { const k = Object.keys(trCache); if (k.length > 1500) k.slice(0, k.length - 1500).forEach(x => delete trCache[x]); localStorage.setItem(TRK, JSON.stringify(trCache)); } catch (e) {} }
  async function trRun() {
    if (trBusy) return; trBusy = true;
    let got = 0;
    while (trQueue.length) {
      const en = trQueue.shift();
      if (trLoad()[en]) continue;
      try {
        const r = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt&dt=t&q=' + encodeURIComponent(en));
        const j = await r.json();
        const pt = (j && j[0] || []).map(x => x[0]).join('').trim();
        if (pt) { trCache[en] = pt; got++; }
      } catch (e) { trQueue = []; trFail = true; got = got || 1; break; }
    }
    if (got) { trSave(); if (V40.ligaTab === 'eps' && V40.renderLiga) { try { V40.renderLiga(); } catch (e) {} } }
    trBusy = false;
  }
  // devolve o texto em português se já traduzido; senão agenda a tradução e devolve null
  V40.ptText = function (en) {
    if (!en) return null;
    const c = trLoad()[en];
    if (c) return c;
    if (!navigator.onLine || trFail) return en;
    if (!trQueue.includes(en)) trQueue.push(en);
    setTimeout(trRun, 50);
    return null;
  };

  // ---------- tela ----------
  const card = (t, attrs) => `<button class="v40-l4-team" ${attrs}>
      ${t.poster ? `<img src="${t.poster}" alt="" onerror="this.outerHTML='<span class=&quot;ph&quot;>${t.icon}</span>'">` : `<span class="ph">${t.icon}</span>`}
      <span class="nm">${V40.esc(t.name)}</span>${epExtra(t)}
    </button>`;
  // nota que você deu + título e resumo do episódio (TVmaze)
  function epExtra(t) {
    const it = t.it;
    const r = it && Array.isArray(it.epRatings) ? it.epRatings[t.e] : null;
    const nota = typeof r === 'number' ? `<span class="v40-ep-nota">⭐ ${String(r).replace(".", ",")}</span>` : '<span class="v40-ep-nota sem">sem nota</span>';
    let info = null;
    try { info = it && V40.extInfo ? V40.extInfo(it) : null; } catch (e) {}
    const ok = info && info.epCheck === 'ok' && Array.isArray(info.epNames);
    let nmEn = ok ? info.epNames[t.e] : null;
    let sumEn = ok && info.epSums ? info.epSums[t.e] : null;
    let nmPt = ok && info.epNamesPtSel ? info.epNamesPtSel[t.e] : null;
    let sumPt = ok && info.epSumsPt ? info.epSumsPt[t.e] : null;
    let fb = null;
    if (!nmPt && !sumPt && !nmEn && !sumEn && it) fb = epFetch(it, t.e);
    if (fb && !fb.none) { nmPt = fb.namePt; sumPt = fb.sumPt; nmEn = fb.name; sumEn = fb.sum; }
    const nm = nmPt || V40.ptText(nmEn);
    let sum = sumPt || V40.ptText(sumEn);
    if (sumEn && !sum) sum = 'traduzindo…';
    return `<div class="v40-ep-extra">${nota}${nm ? `<b class="v40-ep-tit">${V40.esc(nm)}</b>` : ''}${sum ? `<small class="v40-ep-sum">${V40.esc(sum)}</small>` : ''}</div>`;
  }
  const fmtW = w => { const end = V40.addDays(w, 6); return `${V40.fmtBR(w, true).slice(0, 5)} a ${V40.fmtBR(end, true).slice(0, 5)}`; };
  function tableRows(s) {
    return `<div class="v40-l4row head"><span class="lpos">#</span><span class="lname">EPISÓDIO</span><span>J</span><span>V</span><span>E</span><span>D</span><span>SG</span><span class="lpts">P</span></div>
      ${s.list.map(t => `<div class="v40-l4row ${t.pos === 1 ? 'lib' : ''}"><span class="lpos">${t.pos}º</span><span class="lname">${t.pos === 1 && t.J ? '👑 ' : ''}${t.icon} ${V40.esc(t.name)}</span><span>${t.J}</span><span>${t.V}</span><span>${t.E}</span><span>${t.D}</span><span>${t.SG > 0 ? '+' : ''}${t.SG}</span><span class="lpts">${t.P}</span></div>`).join('')}
      <p class="v40-muted" style="margin:6px 0 0;">${s.played}/${s.total} jogos · ${s.list.length} episódios nesta semana</p>`;
  }
  // 🗓 tabela + jogos de uma semana que já passou
  V40.openEpsWeek = function (w) {
    const wk = V40.epsWeeks().find(x => x.w === w);
    if (!wk) return;
    const s = V40.epsStandings(wk);
    const by = {}; wk.teams.forEach(t => { by[t.pid] = t; });
    const st = wres(w);
    const nota = t => { const r = t.it && Array.isArray(t.it.epRatings) ? t.it.epRatings[t.e] : null; return typeof r === 'number' ? ` <small class="v40-muted">⭐${String(r).replace('.', ',')}</small>` : ''; };
    const games = (st.log || []).filter((k, i, a) => a.indexOf(k) === i && st.res[k]).map((k, i) => {
      const [a, b] = k.split('§'), A = by[a], B = by[b], v = st.res[k];
      if (!A || !B) return '';
      const cls = x => v === 'd' ? '' : ((v === 'a') === (x === 'a') ? 'style="font-weight:800;color:var(--gold,#e8b84a)"' : 'style="opacity:.6"');
      const sc = (st.score || {})[k];
      return `<div class="v40-row" style="font-size:.8rem;"><span style="width:2.2em" class="v40-muted">${i + 1}.</span><span style="flex:1" ${cls('a')}>${V40.esc(A.name)}${nota(A)}</span><b style="margin:0 6px">${sc ? V40.futTxt(sc) : (v === 'd' ? '=' : (v === 'a' ? '✓ ×' : '× ✓'))}</b><span style="flex:1;text-align:right" ${cls('b')}>${V40.esc(B.name)}${nota(B)}</span></div>`;
    }).join('');
    V40.modal(`<h3>🗓 Semana ${fmtW(w)}</h3>
      ${s.champion ? `<p>👑 Campeão: <b>${s.champion.icon} ${V40.esc(s.champion.name)}</b> · ${s.champion.P} pts</p>` : `<p class="v40-muted">${s.closed ? 'Semana encerrada.' : 'Semana ainda com jogos pendentes.'}</p>`}
      <div class="stat-card">${tableRows(s)}</div>
      <details class="v40-help"><summary>⚽ Jogos da semana (${s.played})</summary>${games || '<p class="v40-muted">Nenhum jogo.</p>'}</details>`);
  };

  // ⚽ simulação: força = nota do episódio; jogadores = personagens do episódio
  const epRate = t => { const it = t && (t.it || items.find(i => i.key === String(t.pid || '').split(':')[1])); const e = t && (t.e != null ? t.e : +String(t.pid || '').split(':')[2]); const r = it && Array.isArray(it.epRatings) ? it.epRatings[e] : null; return typeof r === 'number' ? r : null; };
  const epDesc = t => { const it = t && (t.it || items.find(i => i.key === String(t.pid || '').split(':')[1])); const e = t && (t.e != null ? t.e : +String(t.pid || '').split(':')[2]); if (!it || isNaN(e)) return null; const sn = epSN(it, e); return { type: 'ep', it, s: sn.s, n: sn.n }; };
  async function epSimMatch(A, B, ko) {
    const [la, lb] = await V40.futPrepare(A.pid, epDesc(A), B.pid, epDesc(B));
    return V40.futSim(epRate(A), epRate(B), ko, la, lb);
  }
  function epRecord(w, a, c, r, sim) {
    const st = wres(w);
    st.score = st.score || {};
    const k = pairKey(a, c);
    if (sim) {
      r = sim.w;
      st.score[k] = V40.futPack(k.split('§')[0] === a ? sim : V40.futFlip(sim));
      st.lastSim = { k, a, b: c, s: sim };
    } else { delete st.score[k]; st.lastSim = null; }
    let val = 'd';
    if (r !== 'd') { const winner = r === 'a' ? a : c; val = k.split('§')[0] === winner ? 'a' : 'b'; }
    st.res[k] = val; st.log.push(k);
    saveW(w, st);
  }
  V40.epsLeagueHtml = function () {
    try { track(); } catch (e) {}
    const weeks = V40.epsWeeks();
    const rules = `<details class="v40-help"><summary>📜 Regulamento da Liga dos Episódios</summary><ol style="margin:6px 0 0 18px;padding:0;font-size:0.8rem;">
      <li>Entram os episódios de série que você vê a partir de 19/10/2026 (os de hoje inclusive). Desmarcou, sai.</li>
      <li>Toda semana (segunda a domingo) os episódios vistos nela jogam todos contra todos entre si. Vitória 3 · empate 1 · derrota 0.</li>
      <li>Desempate: vitórias ▸ saldo de gols ▸ gols marcados ▸ confronto direto ▸ ordem alfabética.</li>
      <li>⚽ Simulação: cada episódio é um time; a nota que você deu é a força, e os jogadores são os personagens do episódio (a cada jogo pelo menos metade da escalação muda). Jogo decidido na mão conta 1×0.</li>
      <li>Quando a semana termina e todos os jogos dela foram disputados, o 1º colocado é o campeão da semana.</li>
      <li>Os campeões das semanas jogam a 🏆 Copa dos Campeões (mata-mata, sem empate: prorrogação e pênaltis).</li></ol></details>`;
    if (!weeks.length) return `<div class="stat-card"><h4>📺 Liga dos Episódios</h4><p>Ainda não tem episódio. Marque os episódios que você vê (a partir de hoje) e eles entram na liga da semana.</p>${rules}</div>`;
    const wk = currentWeek(weeks);
    const s = V40.epsStandings(wk);
    const m = nextMatch(wk);
    const st = wres(wk.w);
    const game = m ? `<div class="stat-card"><h4>⚽ Semana ${fmtW(wk.w)} — jogo ${s.played + 1} de ${s.total}</h4>
        ${st.lastSim && st.res[st.lastSim.k] ? (() => { const bw = {}; wk.teams.forEach(t => { bw[t.pid] = t; }); const A = bw[st.lastSim.a], B = bw[st.lastSim.b]; return A && B ? `<div class="v40-narr">📣 ${V40.esc(V40.futNarr(st.lastSim.s, A, B))}</div>${V40.futBoardHtml(st.lastSim.s, A, B)}` : ''; })() : ''}
        <p class="v40-muted" style="margin-top:-4px;">▶️ Simule o jogo (nota = força, personagens = jogadores), ou decida na mão: toque no vencedor ou no = pra empate.</p>
        <div class="v40-l4-match">${card(m[0], `data-ep="a" data-ta="${m[0].pid}" data-tb="${m[1].pid}" data-w="${wk.w}"`)}
          <button class="v40-l4-draw" data-ep="d" data-ta="${m[0].pid}" data-tb="${m[1].pid}" data-w="${wk.w}">=</button>
          ${card(m[1], `data-ep="b" data-ta="${m[0].pid}" data-tb="${m[1].pid}" data-w="${wk.w}"`)}</div>
        <div class="v40-fut-btns"><button class="v40-primary" id="v40EpSim" data-ta="${m[0].pid}" data-tb="${m[1].pid}" data-w="${wk.w}">▶️ Simular jogo</button><button id="v40EpSimQ" data-ta="${m[0].pid}" data-tb="${m[1].pid}" data-w="${wk.w}">⚡ Direto pro resultado</button>${s.total - s.played > 1 ? `<button id="v40EpSimWeek" data-w="${wk.w}">⏩ Simular os ${s.total - s.played} jogos da semana</button>` : ''}</div>
        <div style="display:flex;gap:8px;margin-top:10px;"><button id="v40EpUndo" data-w="${wk.w}" ${st.log.length ? '' : 'disabled'}>↺ Desfazer último</button></div>
      </div>` : `<div class="stat-card"><h4>⚽ Semana ${fmtW(wk.w)}</h4>${st.lastSim && st.res[st.lastSim.k] ? (() => { const bw = {}; wk.teams.forEach(t => { bw[t.pid] = t; }); const A = bw[st.lastSim.a], B = bw[st.lastSim.b]; return A && B ? `<div class="v40-narr">📣 ${V40.esc(V40.futNarr(st.lastSim.s, A, B))}</div>${V40.futBoardHtml(st.lastSim.s, A, B)}` : ''; })() : ''}<p>${s.total ? '✅ Todos os jogos desta semana foram disputados.' : 'Só 1 episódio nesta semana até agora — os jogos aparecem quando tiver 2 ou mais.'}${!s.closed && s.total ? ' O campeão sai quando a semana acabar (domingo).' : ''}</p></div>`;
    const table = `<div class="stat-card"><h4>📋 Tabela da semana ${fmtW(wk.w)} ${s.closed ? '· encerrada' : ''}</h4>${tableRows(s)}</div>`;
    const ch = champions(weeks);
    const past = ch.length ? `<div class="stat-card"><h4>🏅 Campeões das semanas</h4>${ch.slice().reverse().map(c => `<button class="v40-row" data-epweek="${c.week}" style="width:100%;text-align:left;background:none;border:0;color:inherit;cursor:pointer;"><span style="flex:1">${c.icon} <b>${V40.esc(c.name)}</b><br><small class="v40-muted">semana ${fmtW(c.week)} · ${c.pts} pts</small></span><span class="v40-muted">tabela ›</span></button>`).join('')}</div>` : '';
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
        ${ed.lastSim && ed.res[ed.lastSim.key] && all[ed.lastSim.a] && all[ed.lastSim.b] ? `<div class="v40-narr">📣 ${V40.esc(V40.futNarr(ed.lastSim.s, all[ed.lastSim.a], all[ed.lastSim.b]))}</div>${V40.futBoardHtml(ed.lastSim.s, all[ed.lastSim.a], all[ed.lastSim.b])}` : ''}
        ${cur ? `<div class="v40-fut-btns"><button class="v40-primary" id="v40EpCopaSim">▶️ Simular jogo</button><button id="v40EpCopaSimQ">⚡ Direto pro resultado</button><button id="v40EpCopaSimAll">⏩ Simular a Copa até o fim</button></div><p><b>${cur.label}</b> — simule ou toque no vencedor:</p><div class="v40-l4-match">${card(all[cur.a] || { name: '?', icon: '❔', d: '' }, `data-epk="${cur.key}" data-side="a"`)}<div class="v40-vs">VS</div>${card(all[cur.b] || { name: '?', icon: '❔', d: '' }, `data-epk="${cur.key}" data-side="b"`)}</div>` : ''}
        <div class="v40-ko-bracket" style="margin-top:8px;">${[...new Set(S.games.map(g => g.size))].map(sz => `<div class="v40-ko-round"><div class="v40-ko-rname">${roundName(sz)}</div>${S.games.filter(g => g.size === sz).map(g => `<div class="v40-ko-m">${(ed.score || {})[g.key] ? `<small class="v40-fut-sc">${V40.futTxt(ed.score[g.key])}</small>` : ''}<span class="${g.done && g.w && g.w === g.a ? 'win' : (g.played ? 'lose' : '')}">${g.a === undefined ? '<i class="v40-muted">a definir</i>' : nm(g.a)}</span><span class="${g.done && g.w && g.w === g.b ? 'win' : (g.played ? 'lose' : '')}">${g.b === undefined ? '<i class="v40-muted">a definir</i>' : nm(g.b)}</span></div>`).join('')}</div>`).join('')}</div>
        <div style="display:flex;gap:8px;margin-top:8px;"><button id="v40EpCopaUndo" ${ed.log.length ? '' : 'disabled'}>↺ Desfazer</button><button id="v40EpCopaReset" class="v40-danger">🔄 Recomeçar</button></div></div>`;
    }
    const otherWeeks = weeks.filter(x => x.w !== wk.w).reverse().slice(0, 8);
    const hist = otherWeeks.length ? `<details class="v40-cfg-group" open><summary>🗓 Outras semanas</summary><div>${otherWeeks.map(x => { const ss = V40.epsStandings(x); return `<button class="v40-row v40-epweek" data-epweek="${x.w}" style="width:100%;text-align:left;background:none;border:0;color:inherit;cursor:pointer;"><span style="flex:1">${fmtW(x.w)} · ${x.teams.length} episódios<br><small class="v40-muted">${ss.played}/${ss.total} jogos${ss.champion ? ' · 👑 ' + V40.esc(ss.champion.name) : ''}</small></span><span class="v40-muted">ver tabela ›</span></button>`; }).join('')}</div></details>` : '';
    return `<div class="stat-card"><h4>📺 Liga dos Episódios</h4><p class="v40-muted" style="margin:0;">Os episódios que você vê na semana se enfrentam. O campeão de cada semana vai pra Copa dos Campeões.</p>${rules}</div>${game}${table}${past}${copa}${hist}`;
  };
  V40.wireEps = function (el) {
    el.querySelectorAll('[data-epweek]').forEach(b => b.addEventListener('click', () => V40.openEpsWeek(b.dataset.epweek)));
    el.querySelectorAll('[data-ep]').forEach(b => b.addEventListener('click', () => {
      if (!V40.guard()) return;
      epRecord(b.dataset.w, b.dataset.ta, b.dataset.tb, b.dataset.ep, null);
      V40.sound && V40.sound('tick');
      V40.renderLiga();
    }));
    const u = document.getElementById('v40EpUndo');
    if (u) u.addEventListener('click', () => { const st = wres(u.dataset.w); const k = st.log.pop(); if (k) { delete st.res[k]; if (st.score) delete st.score[k]; st.lastSim = null; saveW(u.dataset.w, st); V40.renderLiga(); } });
    const busy = btn => { btn.disabled = true; btn.textContent = '⏳ Escalando os times…'; };
    [['v40EpSim', true], ['v40EpSimQ', false]].forEach(([id, watch]) => {
    const es = document.getElementById(id);
    if (es) es.addEventListener('click', async () => {
      if (!V40.guard()) return;
      const wk = V40.epsWeeks().find(x => x.w === es.dataset.w); if (!wk) return;
      const A = wk.teams.find(t => t.pid === es.dataset.ta), B = wk.teams.find(t => t.pid === es.dataset.tb);
      if (!A || !B) return;
      busy(es);
      const sm = await epSimMatch(A, B, false);
      epRecord(wk.w, A.pid, B.pid, null, sm);
      V40.sound && V40.sound('tick');
      V40.renderLiga();
      if (watch) V40.futWatch(sm, A, B);
    });
    });
    const ew = document.getElementById('v40EpSimWeek');
    if (ew) ew.addEventListener('click', async () => {
      if (!V40.guard()) return;
      const wk = V40.epsWeeks().find(x => x.w === ew.dataset.w); if (!wk) return;
      busy(ew);
      let n = 0, g = 0;
      while (g++ < 500) {
        const m = nextMatch(wk);
        if (!m) break;
        epRecord(wk.w, m[0].pid, m[1].pid, null, await epSimMatch(m[0], m[1], false));
        n++; ew.textContent = `⏳ ${n} jogo(s)…`;
      }
      V40.sound && V40.sound('tick');
      V40.toast && V40.toast(`⚽ ${n} jogo(s) simulado(s)!`);
      V40.renderLiga();
    });
    const copaSimOne = async () => {
      const ed = V40.get(COPA, null); if (!ed) return false;
      const cur = copaSolve(ed).games.find(g => !g.done && g.a && g.b);
      if (!cur) return false;
      const info = {}; (ed.info || []).forEach(c => { info[c.pid] = c; });
      const A = info[cur.a] || { pid: cur.a, name: cur.a }, B = info[cur.b] || { pid: cur.b, name: cur.b };
      const sim = await epSimMatch(Object.assign({ pid: cur.a }, A), Object.assign({ pid: cur.b }, B), true);
      const ed2 = V40.get(COPA, null);
      ed2.score = ed2.score || {};
      ed2.res[cur.key] = sim.w; ed2.log.push(cur.key);
      ed2.score[cur.key] = V40.futPack(sim);
      ed2.lastSim = { key: cur.key, a: cur.a, b: cur.b, s: sim };
      const S = copaSolve(ed2);
      if (S.champion && !ed2.champion) { ed2.champion = S.champion; V40.confetti && V40.confetti(true); V40.sound && V40.sound('trophy'); }
      V40.set(COPA, ed2);
      return { sm: sim, A, B };
    };
    const cs1 = document.getElementById('v40EpCopaSim');
    if (cs1) cs1.addEventListener('click', async () => { if (!V40.guard()) return; busy(cs1); const r = await copaSimOne(); V40.renderLiga(); if (r) V40.futWatch(r.sm, r.A, r.B); });
    const csq = document.getElementById('v40EpCopaSimQ');
    if (csq) csq.addEventListener('click', async () => { if (!V40.guard()) return; busy(csq); await copaSimOne(); V40.renderLiga(); });
    const csa = document.getElementById('v40EpCopaSimAll');
    if (csa) csa.addEventListener('click', async () => { if (!V40.guard()) return; busy(csa); let g = 0; while (g++ < 100 && await copaSimOne()) {} V40.renderLiga(); });
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
      if (ed.score) delete ed.score[b.dataset.epk]; ed.lastSim = null;
      const S = copaSolve(ed);
      if (S.champion && !ed.champion) { ed.champion = S.champion; V40.confetti && V40.confetti(true); V40.sound && V40.sound('trophy'); }
      V40.set(COPA, ed); V40.renderLiga();
    }));
    const cu = document.getElementById('v40EpCopaUndo');
    if (cu) cu.addEventListener('click', () => { const ed = V40.get(COPA, null); if (!ed) return; const k = ed.log.pop(); if (k) { delete ed.res[k]; if (ed.score) delete ed.score[k]; } ed.lastSim = null; ed.champion = null; V40.set(COPA, ed); V40.renderLiga(); });
    const cr = document.getElementById('v40EpCopaReset');
    if (cr) cr.addEventListener('click', () => { if (confirm('Recomeçar a Copa dos Campeões?')) { V40.set(COPA, null); V40.renderLiga(); } });
  };

  // ao abrir: começa a acompanhar (e pega os episódios de hoje já marcados)
  setTimeout(() => { try { track(); } catch (e) {} }, 1500);
})();
