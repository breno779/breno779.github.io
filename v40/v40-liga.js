/* =====================================================================
 * UCM Watchlist — v40 BETA — 🥇 Liga (campeonatos)
 *  - Pontos corridos por título (nota exata = pontos; empate = mesma posição)
 *  - Campeonato de heróis/grupos: Filmes · Séries · Geral
 *  - Mata-mata dos títulos nota 10 (você escolhe o "verdadeiro 10")
 *  - Por fase · Duelo · Histórico de posições · Artilheiro e melhor defesa
 * ===================================================================== */
(function () {
  'use strict';
  const V40 = window.V40;

  V40.ligaTab = V40.get('liga-tab', 'titulos');

  // ---------- tabela de pontos corridos (regulamento v40.3) ----------
  // ordem: 1) pontos (nota exata) ▸ 2) ⭐ favorito ▸ 3) consistência (% de episódios com nota 9+;
  // filme conta como 1 episódio) ▸ 4) decisão sua num duelo (só quando o empate vale vaga).
  // Posição: empate sem decisão = mesma posição (1º, 1º, 3º…).
  V40.LIGA_DIRECT = 2;     // 1º e 2º vão direto pro mata-mata
  V40.LIGA_REP_END = 10;   // 3º ao 10º vão pra repescagem
  function consistency(p) {
    let n = 0, good = 0;
    p.items.forEach(it => {
      const eps = Array.isArray(it.epRatings) ? it.epRatings.filter(v => typeof v === 'number') : [];
      if (eps.length) { n += eps.length; good += eps.filter(v => v >= 9).length; }
      else if (V40.effRating(it) > 0) { n += 1; if (V40.effRating(it) >= 9) good += 1; }
    });
    return n ? good / n : 0;
  }
  const tbRank = () => V40.get('liga-tb', []);
  V40.leagueTable = function (list) {
    const parts = (list || V40.participants()).filter(p => p.rating > 0);
    const rank = tbRank();
    const idx = {};
    rank.forEach((pid, i) => { idx[pid] = i; });
    parts.forEach(p => {
      p.fav = p.items.some(it => it.favorite) ? 1 : 0;
      p.cons = Math.round(consistency(p) * 1000) / 1000;
      p.autoKey = `${p.pts}|${p.fav}|${p.cons}`;
    });
    parts.sort((a, b) => (b.pts - a.pts) || (b.fav - a.fav) || (b.cons - a.cons)
      || ((idx[a.pid] != null && idx[b.pid] != null) ? idx[a.pid] - idx[b.pid] : 0)
      || ((idx[a.pid] != null ? 0 : 1) - (idx[b.pid] != null ? 0 : 1))
      || (a.order - b.order));
    // grupos de empate (mesmos critérios automáticos)
    let i = 0;
    while (i < parts.length) {
      let j = i;
      while (j + 1 < parts.length && parts[j + 1].autoKey === parts[i].autoKey) j++;
      const group = parts.slice(i, j + 1);
      const doneMembers = group.filter(p => p.done);
      const resolved = group.length === 1 || (doneMembers.length > 0 && doneMembers.every(p => idx[p.pid] != null));
      let pos = i + 1;
      group.forEach((p, k) => {
        p.tieSize = group.length;
        p.tieStart = i;
        p.tieResolved = resolved;
        if (resolved && idx[p.pid] != null) p.pos = i + 1 + k;
        else if (resolved) p.pos = i + 1 + group.filter(x => idx[x.pid] != null).length;
        else p.pos = pos;
      });
      i = j + 1;
    }
    // zonas: só títulos concluídos ocupam vaga
    let n = 0;
    parts.forEach(p => {
      p.zone = '';
      p.seed = null;
      if (!p.done) return;
      n++;
      p.seed = n;
      if (n <= V40.LIGA_DIRECT) p.zone = 'direto';
      else if (n <= V40.LIGA_REP_END) p.zone = 'rep';
    });
    return parts;
  };
  // empates que decidem vaga (cortam a linha 2|3 ou 10|11 entre os concluídos) e ainda não foram decididos
  V40.pendingTies = function (table) {
    table = table || V40.leagueTable();
    const out = [];
    const seen = new Set();
    table.forEach(p => {
      if (p.tieResolved || p.tieSize < 2 || seen.has(p.tieStart)) return;
      seen.add(p.tieStart);
      const members = table.filter(x => x.tieStart === p.tieStart && x.done);
      if (members.length < 2) return;
      const seeds = members.map(x => x.seed);
      const lo = Math.min.apply(null, seeds), hi = Math.max.apply(null, seeds);
      const cuts = [V40.LIGA_DIRECT, V40.LIGA_REP_END].filter(c => lo <= c && hi > c);
      if (cuts.length) out.push({ members, cuts, lo, hi });
    });
    return out;
  };
  V40.resolveTie = function (orderedPids) {
    const rank = tbRank().filter(pid => !orderedPids.includes(pid)).concat(orderedPids);
    V40.set('liga-tb', rank);
  };
  V40.openTieResolver = function (tie) {
    const chosen = [];
    const draw = () => {
      V40.modal(`<h3>⚖️ Desempate valendo vaga</h3>
        <p class="v40-muted">Esses títulos empataram em tudo (nota${tie.members[0].fav ? ', favorito' : ''} e consistência) e o empate decide ${tie.cuts.map(c => c === V40.LIGA_DIRECT ? 'quem vai direto pro mata-mata' : 'quem entra na repescagem').join(' e ')}.<br>Toque do <b>melhor</b> pro <b>pior</b>.</p>
        <div class="v40-tie-list">${tie.members.map(p => {
          const k = chosen.indexOf(p.pid);
          return `<button class="v40-tie-btn ${k >= 0 ? 'on' : ''}" data-tie="${p.pid}"><b class="v40-tie-n">${k >= 0 ? k + 1 + 'º' : ''}</b> ${p.icon} ${V40.esc(p.name)} <small class="v40-muted">${V40.fmt1(p.rating)}</small></button>`;
        }).join('')}</div>
        <div style="display:flex;gap:8px;margin-top:10px;">
          <button id="v40TieClear">↺ Limpar</button>
          <button class="v40-primary" id="v40TieOk" ${chosen.length >= tie.members.length - 1 ? '' : 'disabled'}>✔ Confirmar ordem</button>
        </div>`);
      document.querySelectorAll('[data-tie]').forEach(b => b.addEventListener('click', () => {
        const pid = b.dataset.tie;
        const k = chosen.indexOf(pid);
        if (k >= 0) chosen.splice(k); else chosen.push(pid);
        draw();
      }));
      document.getElementById('v40TieClear').addEventListener('click', () => { chosen.length = 0; draw(); });
      document.getElementById('v40TieOk').addEventListener('click', () => {
        const rest = tie.members.map(p => p.pid).filter(pid => !chosen.includes(pid));
        V40.resolveTie(chosen.concat(rest));
        closeModal();
        V40.toast('⚖️ Desempate decidido');
        V40.renderLiga();
      });
    };
    draw();
  };
  V40.rodada = function (parts) {
    return (parts || V40.participants()).filter(p => p.rating > 0 && p.done).length;
  };

  // ---------- campeonato de heróis ----------
  V40.heroLeague = function () {
    const parts = V40.participants().filter(p => p.rating > 0);
    const rows = HERO_GROUPS.map(g => ({ g, filmes: [], series: [] }));
    const byId = {};
    rows.forEach(r => { byId[r.g.id] = r; });
    parts.forEach(p => (p.heroes || []).forEach(g => {
      const r = byId[g.id];
      if (!r) return;
      (p.kind === 'serie' ? r.series : r.filmes).push(p);
    }));
    const avg = l => l.length ? l.reduce((s, p) => s + p.rating, 0) / l.length : null;
    rows.forEach(r => {
      r.avgFilmes = avg(r.filmes);
      r.avgSeries = avg(r.series);
      const ps = [r.avgFilmes, r.avgSeries].filter(v => v != null);
      r.avgGeral = ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null;
      r.all = r.filmes.concat(r.series);
      r.pts = V40.round1(r.all.reduce((s, p) => s + p.pts, 0));
      r.tens = r.all.filter(p => p.pts === 10).length;
      r.min = r.all.length ? Math.min.apply(null, r.all.map(p => p.rating)) : null;
    });
    return rows;
  };
  V40.heroTable = function (rows, which) {
    const key = which === 'filmes' ? 'avgFilmes' : which === 'series' ? 'avgSeries' : 'avgGeral';
    const listKey = which === 'filmes' ? 'filmes' : which === 'series' ? 'series' : 'all';
    const ranked = rows.filter(r => r[key] != null).map(r => ({ r, val: r[key], n: r[listKey].length, pts: V40.round1(r[listKey].reduce((s, p) => s + p.pts, 0)) }));
    ranked.sort((a, b) => (b.val - a.val) || (b.pts - a.pts) || (b.n - a.n));
    ranked.forEach((x, i) => { x.pos = i + 1; });
    return ranked;
  };

  // ---------- histórico de posições (1 registro por rodada) ----------
  function recordHistory(table, heroRows) {
    const hist = V40.get('liga-history', []);
    const r = V40.rodada();
    const last = hist[hist.length - 1];
    const titles = {};
    table.forEach(p => { titles[p.pid] = p.pos; });
    const heroes = {};
    V40.heroTable(heroRows, 'geral').forEach(x => { heroes[x.r.g.id] = x.pos; });
    if (!last || last.r !== r) {
      hist.push({ r, d: V40.today(), titles, heroes });
      while (hist.length > 120) hist.shift();
      V40.set('liga-history', hist);
    } else {
      // mesma rodada (ex.: nota mudou): atualiza o registro dela
      last.titles = titles; last.heroes = heroes; last.d = V40.today();
      V40.set('liga-history', hist);
    }
    return hist;
  }
  function prevSnapshot(hist) {
    return hist.length >= 2 ? hist[hist.length - 2] : null;
  }
  const moveHtml = (prev, now) => {
    if (prev == null || now == null) return '';
    const d = prev - now;
    if (d > 0) return `<span class="hmove up">▲${d}</span>`;
    if (d < 0) return `<span class="hmove down">▼${-d}</span>`;
    return '';
  };

  // =====================================================================
  // v40.4 — CAMPEONATO DE VERDADE: todos contra todos, você escolhe cada jogo
  //   vitória 3 · empate 1 · derrota 0. Séries viram 1 time só (todas as temporadas/partes
  //   juntas, What If T1+T2+T3 também). Entram os concluídos e os em andamento.
  //   Os 8 primeiros jogam a Libertadores (quartas ▸ semi ▸ final).
  // =====================================================================
  const L4_KEY = 'liga4';
  function teamBase(name) {
    return String(name).replace(/\s+T\d.*$/, '').replace(/\s+\(\d+ eps\)$/, '').replace(/\s*⏳\s*$/, '').trim();
  }
  V40.ligaTeams = function () {
    const map = new Map();
    V40.participants().forEach(p => {
      // só série junta (todas as temporadas viram 1 time); filme é sempre independente
      const base = p.kind === 'serie' ? teamBase(p.name) : p.name;
      const key = p.kind === 'serie' ? 'T:serie:' + base : 'T:' + p.pid;
      if (!map.has(key)) map.set(key, { pid: key, name: base, icon: p.icon, kind: p.kind, members: [], order: p.order });
      const t = map.get(key);
      t.members.push(p);
      t.order = Math.min(t.order, p.order);
    });
    // entra quem você já concluiu ou começou (o que não lançou ainda não tem como ter começado)
    const started = m => m.done || m.inProgress || m.items.some(it => Array.isArray(it.epDone) && it.epDone.some(Boolean));
    return [...map.values()].filter(t => t.members.some(started)).map(t => {
      t.items = [].concat.apply([], t.members.map(m => m.items));
      t.done = t.members.every(m => m.done);
      t.inProgress = !t.done;
      t.poster = null;
      for (const it of t.items) { const u = V40.posterUrl && V40.posterUrl(it, 'w185'); if (u) { t.poster = u; break; } }
      return t;
    }).sort((a, b) => a.order - b.order);
  };
  const l4 = () => { const s = V40.get(L4_KEY, null); return s && s.res ? migrateL4(s) : { res: {}, log: [] }; };
  // v40.4 → v40.4.1: filmes passaram a ter id próprio (antes 'T:filme:Nome')
  function migrateL4(st) {
    if (!JSON.stringify(st).includes('T:filme:')) return st;
    const byName = {};
    V40.participants().forEach(p => { if (p.kind !== 'serie') byName['T:filme:' + p.name] = 'T:' + p.pid; });
    const fix = id => byName[id] || id;
    const fixKey = k => { const [a, b] = k.split('§').map(fix); return a < b ? a + '§' + b : b + '§' + a; };
    const res = {};
    Object.keys(st.res).forEach(k => {
      const [a0] = k.split('§'); const nk = fixKey(k); const [na] = nk.split('§');
      let v = st.res[k];
      if (v !== 'd' && fix(a0) !== na) v = v === 'a' ? 'b' : 'a';   // a ordem do par mudou
      res[nk] = v;
    });
    st.res = res; st.log = st.log.map(fixKey);
    V40.set(L4_KEY, st);
    const ed = V40.get('liga4-liberta', null);
    if (ed) { ed.seeds = ed.seeds.map(fix); if (ed.champion) ed.champion = fix(ed.champion); V40.set('liga4-liberta', ed); }
    return st;
  }
  const pairKey = (a, b) => (a < b ? a + '§' + b : b + '§' + a);
  V40.ligaStandings = function (teams) {
    teams = teams || V40.ligaTeams();
    const st = l4();
    const by = {};
    teams.forEach(t => { by[t.pid] = Object.assign(t, { J: 0, V: 0, E: 0, D: 0, P: 0 }); });
    Object.keys(st.res).forEach(k => {
      const [a, b] = k.split('§');
      const A = by[a], B = by[b];
      if (!A || !B) return;
      const r = st.res[k];
      A.J++; B.J++;
      if (r === 'd') { A.E++; B.E++; A.P++; B.P++; }
      else if (r === 'a') { A.V++; B.D++; A.P += 3; }
      else { B.V++; A.D++; B.P += 3; }
    });
    const list = teams.slice();
    list.forEach(t => { t.apr = t.J ? t.P / (t.J * 3) : 0; });
    list.sort((x, y) => (y.P - x.P) || (y.V - x.V) || (y.apr - x.apr) || (x.order - y.order));
    let pos = 0, lastKey = null;
    list.forEach((t, i) => {
      const k = t.P + '|' + t.V + '|' + t.J;
      if (k !== lastKey) { pos = i + 1; lastKey = k; }
      t.pos = pos;
      t.zone = i < 8 ? 'liberta' : '';
    });
    return list;
  };
  V40.ligaProgress = function (teams) {
    teams = teams || V40.ligaTeams();
    const n = teams.length;
    const ids = new Set(teams.map(t => t.pid));
    const st = l4();
    const played = Object.keys(st.res).filter(k => { const [a, b] = k.split('§'); return ids.has(a) && ids.has(b); }).length;
    const total = n * (n - 1) / 2;
    const perRound = Math.max(1, Math.floor(n / 2));
    return { n, played, total, rodada: Math.floor(played / perRound) };
  };
  let skipped = new Set();
  function nextMatch(teams) {
    const st = l4();
    const J = {};
    teams.forEach(t => { J[t.pid] = 0; });
    Object.keys(st.res).forEach(k => { const [a, b] = k.split('§'); if (a in J && b in J) { J[a]++; J[b]++; } });
    let best = null, bestScore = Infinity, bestSkip = null, bestSkipScore = Infinity;
    const seed = st.log.length * 7919;
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const a = teams[i], b = teams[j];
        const k = pairKey(a.pid, b.pid);
        if (st.res[k]) continue;
        // equilibra quem jogou menos; o resto é "sorteio" fixo pra não repetir sempre o mesmo time
        const score = (J[a.pid] + J[b.pid]) * 100000 + Math.max(J[a.pid], J[b.pid]) * 1000 + ((i * 131 + j * 977 + seed) % 997);
        if (skipped.has(k)) { if (score < bestSkipScore) { bestSkipScore = score; bestSkip = [a, b]; } continue; }
        if (score < bestScore) { bestScore = score; best = [a, b]; }
      }
    }
    if (!best && bestSkip) { skipped = new Set(); best = bestSkip; }
    return best;
  }
  function l4Result(aPid, bPid, r) {
    if (!V40.guard()) return;
    const st = l4();
    const k = pairKey(aPid, bPid);
    // r é do ponto de vista do botão: 'a' = venceu aPid, 'b' = venceu bPid, 'd' = empate
    let val = 'd';
    if (r !== 'd') { const winner = r === 'a' ? aPid : bPid; val = k.split('§')[0] === winner ? 'a' : 'b'; }
    st.res[k] = val;
    st.log.push(k);
    V40.set(L4_KEY, st);
    V40.sound('tick');
    V40.renderLiga();
  }
  function l4Undo() {
    const st = l4();
    const k = st.log.pop();
    if (!k) return;
    delete st.res[k];
    V40.set(L4_KEY, st);
    V40.renderLiga();
  }
  const teamCard = (t, attrs) => `<button class="v40-l4-team" ${attrs}>
      ${t.poster ? `<img src="${t.poster}" alt="" onerror="this.outerHTML='<span class=&quot;ph&quot;>${t.icon}</span>'">` : `<span class="ph">${t.icon}</span>`}
      <span class="nm">${V40.esc(t.name)}</span>
    </button>`;
  // posições da tabela nova a cada rodada (n/2 jogos), pras setinhas ▲▼
  function recordL4History(table, rodada) {
    const hist = V40.get('liga4-history', []);
    const titles = {};
    table.forEach(t => { titles[t.pid] = t.pos; });
    const last = hist[hist.length - 1];
    if (!last || last.r !== rodada) { hist.push({ r: rodada, d: V40.today(), titles }); while (hist.length > 200) hist.shift(); }
    else { last.titles = titles; last.d = V40.today(); }
    V40.set('liga4-history', hist);
    return hist;
  }
  function l4TableHtml(table, prog, hist) {
    if (!table.length) return '<div class="stat-card"><p>Ninguém em campo ainda. Conclua ou comece um título e ele entra no campeonato.</p></div>';
    const prev = prevSnapshot(hist);
    const leader = table[0];
    const rows = table.map(t => `<div class="v40-l4row ${t.zone === 'liberta' ? 'lib' : ''}">
        <span class="lpos">${t.pos}º</span>
        <span class="lname">${t.pos === 1 && t.J ? '👑 ' : ''}${t.icon} ${V40.esc(t.name)}${t.inProgress ? ' <small class="v40-prog">em andamento</small>' : ''} ${moveHtml(prev && prev.titles[t.pid], t.pos)}</span>
        <span>${t.J}</span><span>${t.V}</span><span>${t.E}</span><span>${t.D}</span>
        <span class="lpts">${t.P}</span>
      </div>`).join('');
    return `
      <div class="stat-card v40-champ-card">
        <div class="v40-champ-crown">🏆</div>
        ${prog.played ? `<div><b>Líder:</b> ${leader.icon} ${V40.esc(leader.name)} — ${leader.P} pts</div>` : '<div><b>Campeonato zerado</b> — todo mundo com 0 pontos</div>'}
        <div class="v40-muted">${prog.played} de ${prog.total} jogos · ${Math.round(prog.played / Math.max(1, prog.total) * 1000) / 10}%</div>
        <div class="v40-l4-bar"><i style="width:${prog.played / Math.max(1, prog.total) * 100}%"></i></div>
        <button class="v40-link" data-goto="jogos">⚽ Jogar a próxima partida ›</button>
      </div>
      <div class="stat-card">
        <h4>📋 Classificação</h4>
        <div class="v40-l4row head"><span class="lpos">#</span><span class="lname">TIME</span><span>J</span><span>V</span><span>E</span><span>D</span><span class="lpts">P</span></div>
        ${rows}
        <div class="v40-legend"><span><i class="zc"></i>1º ao 8º: Libertadores</span></div>
        <p class="v40-muted" style="margin:6px 0 0;">Vitória 3 · empate 1 · derrota 0. Desempate: vitórias ▸ aproveitamento. Séries contam como 1 time (todas as temporadas juntas). ▲▼ = desde a rodada anterior.</p>
      </div>
      <button class="big-action v40-share-btn" id="v40ShareLiga">📤 Compartilhar a tabela como imagem</button>`;
  }
  function l4GamesHtml(teams, prog) {
    const st = l4();
    const by = {};
    teams.forEach(t => { by[t.pid] = t; });
    const m = teams.length >= 2 ? nextMatch(teams) : null;
    const last = st.log.slice(-12).reverse().map(k => {
      const [a, b] = k.split('§');
      const A = by[a], B = by[b];
      if (!A || !B) return '';
      const r = st.res[k];
      const res = r === 'd' ? 'empate' : (r === 'a' ? 'venceu ' + V40.esc(A.name) : 'venceu ' + V40.esc(B.name));
      return `<div class="v40-row"><span style="flex:1">${A.icon} ${V40.esc(A.name)} <b>×</b> ${B.icon} ${V40.esc(B.name)}<br><small class="v40-muted">${res}</small></span></div>`;
    }).join('');
    return `
      <div class="stat-card">
        <h4>⚽ Jogo ${Math.min(prog.played + 1, prog.total)} de ${prog.total}</h4>
        ${m ? `<p class="v40-muted" style="margin-top:-4px;">Toque no vencedor, ou no = pra empate.</p>
        <div class="v40-l4-match">
          ${teamCard(m[0], `data-l4="a" data-ta="${V40.esc(m[0].pid)}" data-tb="${V40.esc(m[1].pid)}"`)}
          <button class="v40-l4-draw" data-l4="d" data-ta="${V40.esc(m[0].pid)}" data-tb="${V40.esc(m[1].pid)}">=</button>
          ${teamCard(m[1], `data-l4="b" data-ta="${V40.esc(m[0].pid)}" data-tb="${V40.esc(m[1].pid)}"`)}
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
          <button id="v40L4Skip" data-k="${V40.esc(pairKey(m[0].pid, m[1].pid))}">⏭ Pular este jogo</button>
          <button id="v40L4Undo" ${st.log.length ? '' : 'disabled'}>↺ Desfazer último</button>
        </div>` : (teams.length < 2 ? '<p>Precisa de pelo menos 2 times em campo.</p>' : `<p>🎉 Todos os jogos foram disputados! Hora da <button class="v40-link" data-goto="mata">🏆 Libertadores ›</button></p><button id="v40L4Undo" ${st.log.length ? '' : 'disabled'}>↺ Desfazer último</button>`)}
        <div class="v40-l4-bar" style="margin-top:10px;"><i style="width:${prog.played / Math.max(1, prog.total) * 100}%"></i></div>
        <p class="v40-muted">Rodada ${prog.rodada} · ${prog.n} times · cada time enfrenta todos os outros uma vez. Quem jogou menos entra em campo primeiro. Time novo (título que você começar) entra com 0 pontos e os jogos dele vão aparecendo.</p>
      </div>
      ${last ? `<div class="stat-card"><h4>🗒 Últimos resultados</h4>${last}</div>` : ''}`;
  }
  // ---------- 🏆 Libertadores (8 primeiros: quartas ▸ semi ▸ final) ----------
  const LIB_KEY = 'liga4-liberta';
  const LIB = [
    { a: { s: 1 }, b: { s: 8 }, phase: 'q', label: 'Quartas de final 1' },
    { a: { s: 4 }, b: { s: 5 }, phase: 'q', label: 'Quartas de final 2' },
    { a: { s: 2 }, b: { s: 7 }, phase: 'q', label: 'Quartas de final 3' },
    { a: { s: 3 }, b: { s: 6 }, phase: 'q', label: 'Quartas de final 4' },
    { a: { m: 0 }, b: { m: 1 }, phase: 's', label: 'Semifinal 1' },
    { a: { m: 2 }, b: { m: 3 }, phase: 's', label: 'Semifinal 2' },
    { a: { m: 4 }, b: { m: 5 }, phase: 'f', label: 'Final' }
  ];
  function libSolve(ed) {
    const picks = {};
    (ed.picks || []).forEach(x => { picks[x.i] = x.side; });
    const res = [];
    const side = src => { if (src.s) return ed.seeds[src.s - 1] || null; const m = res[src.m]; return m.done ? m.w : undefined; };
    LIB.forEach((def, i) => {
      const a = side(def.a), b = side(def.b);
      const m = { i, def, a, b, w: undefined, done: false, played: false };
      if (a !== undefined && b !== undefined) {
        if (!a || !b) { m.w = a || b || null; m.done = true; }
        else if (picks[i]) { m.w = picks[i] === 'a' ? a : b; m.done = true; m.played = true; }
      }
      res.push(m);
    });
    return res;
  }
  function libHtml(teams, table, prog) {
    const by = {};
    teams.forEach(t => { by[t.pid] = t; });
    const ed = V40.get(LIB_KEY, null);
    const champs = V40.get('liga4-campeoes', []);
    const nm = pid => pid && by[pid] ? `${by[pid].icon} ${V40.esc(by[pid].name)}` : (pid ? '(saiu)' : '<i class="v40-muted">—</i>');
    const rules = `<details class="v40-help"><summary>📜 Regulamento</summary><ol style="margin:6px 0 0 18px;padding:0;font-size:0.8rem;">
        <li>Pontos corridos, todos contra todos (1 jogo cada). Você escolhe o vencedor de cada jogo ou dá empate.</li>
        <li>Vitória 3 · empate 1 · derrota 0. Desempate: vitórias ▸ aproveitamento.</li>
        <li>Séries viram 1 time (todas as temporadas e partes juntas). Entram concluídos e em andamento.</li>
        <li>Os 8 primeiros jogam a Libertadores: 1×8, 4×5, 2×7, 3×6 nas quartas, depois semi e final. No mata-mata não tem empate.</li>
      </ol></details>`;
    if (!ed) {
      const top = table.slice(0, 8);
      return `<div class="stat-card">
        <h4>🏆 Libertadores — edição ${champs.length + 1}</h4>
        ${teams.length < 8 ? `<p>Precisa de pelo menos 8 times no campeonato. Agora: ${teams.length}.</p>` : `
        <p class="v40-muted" style="margin-top:-4px;">Classificados pela tabela de agora (${prog.played} de ${prog.total} jogos disputados):</p>
        ${top.map((t, k) => `<div class="v40-l4row lib"><span class="lpos">${k + 1}º</span><span class="lname">${t.icon} ${V40.esc(t.name)}</span><span></span><span></span><span></span><span></span><span class="lpts">${t.P}</span></div>`).join('')}
        <button class="v40-primary" id="v40LibStart" style="margin-top:10px;width:100%;">▶️ Começar a Libertadores</button>
        ${prog.played < prog.total ? `<p class="v40-muted">Ainda faltam ${prog.total - prog.played} jogos dos pontos corridos — o ideal é começar quando acabarem.</p>` : ''}`}
        ${champs.length ? `<p class="v40-muted">🏅 Campeões: ${champs.slice().reverse().map(c => `${V40.esc(c.name)} (ed. ${c.n})`).join(' · ')}</p>` : ''}
        ${rules}
      </div>`;
    }
    const res = libSolve(ed);
    const cur = res.find(m => !m.done && m.a && m.b);
    let stage = '';
    if (ed.champion) {
      stage = `<div class="stat-card v40-ko-champ"><div class="v40-champ-crown">👑</div><div class="v40-muted">CAMPEÃO DA LIBERTADORES · EDIÇÃO ${ed.n}</div><div class="v40-big">${nm(ed.champion)}</div><div class="v40-muted">${V40.fmtBR((ed.finishedAt || V40.today()).slice(0, 10), true)}</div></div>`;
    } else if (cur) {
      stage = `<div class="stat-card"><h4>⚔️ ${cur.def.label}</h4><p class="v40-muted" style="margin-top:-4px;">Mata-mata não tem empate: toque no vencedor.</p>
        <div class="v40-l4-match two">${teamCard(by[cur.a] || { name: '(saiu)', icon: '❔' }, `data-lib="${cur.i}" data-side="a"`)}<div class="v40-vs">VS</div>${teamCard(by[cur.b] || { name: '(saiu)', icon: '❔' }, `data-lib="${cur.i}" data-side="b"`)}</div></div>`;
    }
    const seedTag = pid => { const k = ed.seeds.indexOf(pid); return k >= 0 ? `<small class="v40-muted">${k + 1}º</small> ` : ''; };
    const bracket = [['q', 'Quartas'], ['s', 'Semifinais'], ['f', 'Final']].map(([ph, name]) => `<div class="v40-ko-round"><div class="v40-ko-rname">${name}</div>${res.filter(m => m.def.phase === ph).map(m => `
        <div class="v40-ko-m"><span class="${m.done && m.w === m.a ? 'win' : (m.played ? 'lose' : '')}">${m.a === undefined ? '<i class="v40-muted">a definir</i>' : seedTag(m.a) + nm(m.a)}</span>
        <span class="${m.done && m.w === m.b ? 'win' : (m.played ? 'lose' : '')}">${m.b === undefined ? '<i class="v40-muted">a definir</i>' : seedTag(m.b) + nm(m.b)}</span></div>`).join('')}</div>`).join('');
    return `${stage}
      <div class="stat-card"><h4>🗂 Chave — edição ${ed.n}</h4><div class="v40-ko-bracket">${bracket}</div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
          <button id="v40LibUndo" ${ed.picks.length ? '' : 'disabled'}>↺ Desfazer último jogo</button>
          <button id="v40LibReset" class="v40-danger">🔄 Recomeçar</button>
          ${ed.champion ? '<button id="v40LibNew">▶️ Nova edição</button>' : ''}
        </div>${rules}</div>`;
  }
  function libPick(i, s) {
    if (!V40.guard()) return;
    const ed = V40.get(LIB_KEY, null);
    if (!ed) return;
    ed.picks.push({ i, side: s });
    const res = libSolve(ed);
    const fin = res[res.length - 1];
    if (fin.done && fin.w && !ed.champion) {
      ed.champion = fin.w; ed.finishedAt = new Date().toISOString();
      const t = V40.ligaTeams().find(x => x.pid === fin.w);
      const list = V40.get('liga4-campeoes', []);
      list.push({ n: ed.n, pid: fin.w, name: t ? t.name : fin.w, at: ed.finishedAt, created: ed.created });
      V40.set('liga4-campeoes', list);
      V40.confetti(true); V40.sound('trophy');
      V40.logEvent('ko-champion', { name: t ? t.name : fin.w });
    } else V40.sound('tick');
    V40.set(LIB_KEY, ed);
    V40.renderLiga();
  }
  function libUndo() {
    const ed = V40.get(LIB_KEY, null);
    if (!ed || !ed.picks.length) return;
    ed.picks.pop();
    if (ed.champion) { V40.set('liga4-campeoes', V40.get('liga4-campeoes', []).filter(c => c.created !== ed.created)); ed.champion = null; delete ed.finishedAt; }
    V40.set(LIB_KEY, ed);
    V40.renderLiga();
  }
  function wireL4(el) {
    el.querySelectorAll('[data-l4]').forEach(b => b.addEventListener('click', () => l4Result(b.dataset.ta, b.dataset.tb, b.dataset.l4)));
    const sk = document.getElementById('v40L4Skip');
    if (sk) sk.addEventListener('click', () => { skipped.add(sk.dataset.k); V40.renderLiga(); });
    const un = document.getElementById('v40L4Undo');
    if (un) un.addEventListener('click', l4Undo);
    el.querySelectorAll('[data-lib]').forEach(b => b.addEventListener('click', () => libPick(+b.dataset.lib, b.dataset.side)));
    const ls = document.getElementById('v40LibStart');
    if (ls) ls.addEventListener('click', () => {
      if (!V40.guard()) return;
      const prog = V40.ligaProgress();
      if (prog.played < prog.total && !confirm(`Ainda faltam ${prog.total - prog.played} jogos dos pontos corridos. Começar a Libertadores com a tabela de agora mesmo assim?`)) return;
      const table = V40.ligaStandings();
      V40.set(LIB_KEY, { n: V40.get('liga4-campeoes', []).length + 1, created: new Date().toISOString(), seeds: table.slice(0, 8).map(t => t.pid), picks: [], champion: null });
      V40.renderLiga();
    });
    const lu = document.getElementById('v40LibUndo'); if (lu) lu.addEventListener('click', libUndo);
    const lr = document.getElementById('v40LibReset');
    if (lr) lr.addEventListener('click', () => {
      const ed = V40.get(LIB_KEY, null);
      if (ed && ed.picks.length && !confirm('Recomeçar a Libertadores do zero? Os jogos já decididos nela se perdem.')) return;
      if (ed && ed.champion) V40.set('liga4-campeoes', V40.get('liga4-campeoes', []).filter(c => c.created !== ed.created));
      V40.set(LIB_KEY, null); V40.renderLiga();
    });
    const ln = document.getElementById('v40LibNew'); if (ln) ln.addEventListener('click', () => { V40.set(LIB_KEY, null); V40.renderLiga(); });
  }

  // ---------- render da aba ----------
  V40.renderLiga = function () {
    const el = document.getElementById('tabLiga');
    if (!el) return;
    const all = V40.participants();
    const teams = V40.ligaTeams();
    const table = V40.ligaStandings(teams);
    const prog = V40.ligaProgress(teams);
    const heroRows = V40.heroLeague();
    const hist = recordHistory(V40.leagueTable(all), heroRows);
    const hist4 = recordL4History(table, prog.rodada);
    const tabs = [['titulos', '📋 Tabela'], ['jogos', '⚽ Jogos'], ['mata', '🏆 Libertadores'], ['herois', '🦸 Heróis'], ['fases', '🗂 Por fase'], ['duelo', '🥊 Duelo'], ['historico', '📈 Histórico']];
    let body = '';
    if (V40.ligaTab === 'titulos') body = l4TableHtml(table, prog, hist4);
    else if (V40.ligaTab === 'jogos') body = l4GamesHtml(teams, prog);
    else if (V40.ligaTab === 'herois') body = heroesHtml(heroRows, hist);
    else if (V40.ligaTab === 'mata') body = libHtml(teams, table, prog);
    else if (V40.ligaTab === 'fases') body = phasesHtml(all);
    else if (V40.ligaTab === 'duelo') body = duelHtml(all);
    else body = historyHtml(heroRows, hist);
    el.innerHTML = `
      <h2 class="v40-page-title">🥇 Liga UCM</h2>
      <p class="v40-muted" style="margin-top:-6px;">Rodada <b>${prog.rodada}</b> · ${prog.n} times · ${prog.played}/${prog.total} jogos · vitória 3, empate 1, derrota 0</p>
      <div class="v40-subtabs">${tabs.map(([k, l]) => `<button data-liga="${k}" class="${V40.ligaTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div id="v40LigaBody">${body}</div>`;
    el.querySelectorAll('[data-liga]').forEach(b => b.addEventListener('click', () => {
      V40.ligaTab = b.dataset.liga; V40.set('liga-tab', V40.ligaTab); V40.renderLiga();
    }));
    wireLiga(el, all, table, heroRows);
    wireL4(el);
    ensureTabReloadBtn('tabLiga');
  };

  // ---------- 📋 títulos ----------
  function zoneOf(p, maxPos) {
    if (p.zone === 'direto') return 'champ';
    if (p.zone === 'rep') return 'g';
    if (maxPos >= 12 && p.pos === maxPos) return 'z';
    return '';
  }
  function tiesHtml(table) {
    const ties = V40.pendingTies(table);
    if (!ties.length) return '';
    return `<div class="stat-card v40-warn">⚖️ <b>Empate valendo vaga</b><br>${ties.map((t, k) => `${t.members.length} títulos empatados em tudo disputam ${t.cuts.map(c => c === V40.LIGA_DIRECT ? 'vaga direta no mata-mata' : 'vaga na repescagem').join(' e ')}. <button class="v40-link" data-tiefix="${k}">Decidir ›</button>`).join('<br>')}</div>`;
  }
  function titlesHtml(all, table, hist) {
    if (!table.length) return '<div class="stat-card"><p>Nenhum título com nota ainda. Dê nota a um filme ou série e ele estreia na tabela.</p></div>';
    const prev = prevSnapshot(hist);
    const maxPos = table[table.length - 1].pos;
    const champs = table.filter(p => p.pos === 1);
    const unrated = all.filter(p => !(p.rating > 0)).sort((a, b) => a.order - b.order);
    let lastPos = null;
    const rows = table.map(p => {
      const showPos = p.pos !== lastPos; lastPos = p.pos;
      const z = zoneOf(p, maxPos);
      return `<div class="v40-lrow ${z}${showPos ? ' first' : ''}" data-pid="${p.pid}">
        <span class="lpos">${showPos ? p.pos + 'º' : ''}</span>
        <span class="lname">${p.pos === 1 ? '👑 ' : ''}${p.icon} ${V40.esc(p.name)}${p.inProgress ? ' <small class="v40-prog">em andamento</small>' : ''} ${moveHtml(prev && prev.titles[p.pid], p.pos)}</span>
        <span class="lpts">${V40.fmt1(p.pts)}</span>
        <span class="lrat">${V40.fmt1(p.rating)}</span>
      </div>`;
    }).join('');
    return `
      ${tiesHtml(table)}
      <div class="stat-card v40-champ-card">
        <div class="v40-champ-crown">🏆</div>
        <div><b>${champs.length === 1 ? 'Líder' : champs.length + ' líderes empatados'}</b> com ${V40.fmt1(champs[0].pts)} pontos</div>
        <div class="v40-muted">${champs.slice(0, 6).map(p => V40.esc(p.name)).join(' · ')}${champs.length > 6 ? ' …' : ''}</div>
        <button class="v40-link" data-goto="mata">🏆 Quem é o verdadeiro 10? Ver o mata-mata ›</button>
      </div>
      <div class="stat-card">
        <h4>📋 Classificação — pontos corridos</h4>
        <div class="v40-lrow head"><span class="lpos">#</span><span class="lname">TÍTULO</span><span class="lpts">PTS</span><span class="lrat">NOTA</span></div>
        ${rows}
        <div class="v40-legend">
          <span><i class="zc"></i>1º e 2º: direto pro mata-mata</span><span><i class="zg"></i>3º ao 10º: repescagem</span>${maxPos >= 12 ? '<span><i class="zz"></i>Lanterna</span>' : ''}
        </div>
        <p class="v40-muted" style="margin:6px 0 0;">Desempate: ⭐ favorito ▸ consistência (% de episódios com nota 9+; filme conta como 1 episódio) ▸ você decide, se o empate valer vaga. Só títulos concluídos ocupam vaga. ▲▼ = posições desde a rodada anterior.</p>
      </div>
      <div class="stat-card">
        <button class="v40-collapse" data-toggle="v40Unrated">🕓 Ainda não estrearam (sem nota): ${unrated.length} ▾</button>
        <div id="v40Unrated" hidden>${unrated.map(p => `<div class="v40-lrow"><span class="lpos"></span><span class="lname">${p.icon} ${V40.esc(p.name)}</span><span class="lpts">—</span><span class="lrat"></span></div>`).join('')}</div>
      </div>
      <button class="big-action v40-share-btn" id="v40ShareLiga">📤 Compartilhar a tabela como imagem</button>`;
  }

  // ---------- 🦸 heróis ----------
  V40.heroWhich = V40.get('hero-which', 'geral');
  function heroesHtml(heroRows, hist) {
    const which = V40.heroWhich;
    const ranked = V40.heroTable(heroRows, which);
    const prev = prevSnapshot(hist);
    const withAny = heroRows.filter(r => r.all.length);
    const scorer = withAny.slice().sort((a, b) => (b.tens - a.tens) || (b.pts - a.pts))[0];
    const defense = withAny.filter(r => r.all.length >= 2).sort((a, b) => (b.min - a.min) || (b.all.length - a.all.length))[0];
    const none = heroRows.filter(r => !ranked.some(x => x.r === r));
    const label = { filmes: '🎬 Só filmes', series: '📺 Só séries', geral: '⭐ Geral' };
    const rows = ranked.map(x => `
      <div class="v40-hrow" data-hero="${x.r.g.id}">
        <span class="lpos">${x.pos}º</span>
        <span class="lname">${x.pos === 1 ? '👑 ' : ''}${x.r.g.emoji} ${V40.esc(x.r.g.label)} ${which === 'geral' ? moveHtml(prev && prev.heroes[x.r.g.id], x.pos) : ''}</span>
        <span class="lnum">${x.n}</span>
        <span class="lpts">${V40.fmt1(x.pts)}</span>
        <span class="lrat">${V40.fmt1(x.val)}</span>
      </div>`).join('');
    return `
      <div class="v40-grid2">
        <div class="stat-card v40-mini">
          <h4>⚽ Artilheiro</h4>
          ${scorer ? `<div class="v40-big">${scorer.g.emoji} ${V40.esc(scorer.g.label)}</div><div class="v40-muted">${scorer.tens} título(s) nota 10 · ${V40.fmt1(scorer.pts)} pts</div>` : '<div class="v40-muted">—</div>'}
        </div>
        <div class="stat-card v40-mini">
          <h4>🧱 Melhor defesa</h4>
          ${defense ? `<div class="v40-big">${defense.g.emoji} ${V40.esc(defense.g.label)}</div><div class="v40-muted">pior nota dele: ${V40.fmt1(defense.min)} (${defense.all.length} títulos)</div>` : '<div class="v40-muted">precisa de 2+ títulos</div>'}
        </div>
      </div>
      <div class="v40-subtabs small">${['geral', 'filmes', 'series'].map(k => `<button data-hw="${k}" class="${which === k ? 'on' : ''}">${label[k]}</button>`).join('')}</div>
      <div class="stat-card">
        <h4>${label[which]} — média de nota</h4>
        <div class="v40-hrow head"><span class="lpos">#</span><span class="lname">HERÓI / GRUPO (toque pro cartão)</span><span class="lnum">TÍT.</span><span class="lpts">PTS</span><span class="lrat">MÉDIA</span></div>
        ${rows || '<p class="v40-muted">Ninguém com nota nessa tabela ainda.</p>'}
        <p class="v40-muted" style="margin:8px 0 0;">${which === 'geral' ? 'Geral = média da média dos filmes com a média das séries (ou a única que existir). ' : ''}Empate na média: desempata por pontos e depois por nº de títulos. Os episódios de What If…? T1/T2 jogam como um título só (sem herói).</p>
      </div>
      ${none.length ? `<div class="stat-card"><button class="v40-collapse" data-toggle="v40HeroNone">Sem título com nota nessa tabela: ${none.length} ▾</button><div id="v40HeroNone" hidden class="v40-muted">${none.map(r => `${r.g.emoji} ${V40.esc(r.g.label)}`).join(' · ')}</div></div>` : ''}`;
  }

  // ---------- 🗂 por fase ----------
  V40.ligaPhase = V40.get('liga-phase', null);
  function phasesHtml(all) {
    const phases = PHASE_ORDER.filter(ph => all.some(p => p.phase === ph));
    if (!V40.ligaPhase || !phases.includes(V40.ligaPhase)) V40.ligaPhase = phases[0];
    const list = V40.leagueTable(all.filter(p => p.phase === V40.ligaPhase));
    const total = all.filter(p => p.phase === V40.ligaPhase).length;
    const champs = list.filter(p => p.pos === 1);
    const summary = phases.map(ph => {
      const t = V40.leagueTable(all.filter(p => p.phase === ph));
      const avg = t.length ? t.reduce((s, p) => s + p.rating, 0) / t.length : null;
      return { ph, avg, n: t.length, champ: t.filter(p => p.pos === 1) };
    });
    return `
      <div class="stat-card">
        <h4>🗂 Campeonato por fase</h4>
        <select id="v40PhaseSel" class="v40-select">${phases.map(ph => `<option value="${V40.esc(ph)}" ${ph === V40.ligaPhase ? 'selected' : ''}>${V40.esc(ph)}</option>`).join('')}</select>
        <p class="v40-muted">${list.length}/${total} títulos com nota nessa fase${champs.length ? ` · campeão: ${champs.map(p => V40.esc(p.name)).join(', ')}` : ''}</p>
        <div class="v40-lrow head"><span class="lpos">#</span><span class="lname">TÍTULO</span><span class="lpts">PTS</span><span class="lrat">NOTA</span></div>
        ${list.map(p => `<div class="v40-lrow ${p.pos === 1 ? 'champ' : ''}"><span class="lpos">${p.pos}º</span><span class="lname">${p.icon} ${V40.esc(p.name)}</span><span class="lpts">${V40.fmt1(p.pts)}</span><span class="lrat">${V40.fmt1(p.rating)}</span></div>`).join('') || '<p class="v40-muted">Nada com nota nessa fase ainda.</p>'}
      </div>
      <div class="stat-card">
        <h4>🏁 Resumo das fases</h4>
        ${summary.map(s => `<div class="v40-phase-sum"><span>${V40.esc(s.ph.length > 34 ? s.ph.slice(0, 32) + '…' : s.ph)}</span><b>${s.avg != null ? V40.fmt1(s.avg) : '—'}</b><small>${s.n} c/ nota</small></div>`).join('')}
      </div>`;
  }

  // ---------- 🥊 duelo ----------
  V40.duelA = null; V40.duelB = null;
  function duelHtml(all) {
    const opts = all.slice().sort((a, b) => a.order - b.order);
    const optHtml = sel => opts.map(p => `<option value="${p.pid}" ${sel === p.pid ? 'selected' : ''}>${p.icon} ${V40.esc(p.name)}${p.rating > 0 ? ' — ' + V40.fmt1(p.rating) : ''}</option>`).join('');
    if (!V40.duelA) { const t = V40.leagueTable(all); V40.duelA = t[0] ? t[0].pid : opts[0].pid; V40.duelB = t[1] ? t[1].pid : opts[1].pid; }
    return `<div class="stat-card">
      <h4>🥊 Duelo entre dois títulos</h4>
      <select id="v40DuelA" class="v40-select">${optHtml(V40.duelA)}</select>
      <div class="v40-vs">VS</div>
      <select id="v40DuelB" class="v40-select">${optHtml(V40.duelB)}</select>
      <div id="v40DuelOut">${duelResultHtml(all, V40.duelA, V40.duelB)}</div>
    </div>`;
  }
  function durationMin(p) {
    return p.items.reduce((s, it) => {
      const k = simpleKind(it);
      if (k === 'serie') return s + (extractEpsCount(it.text) || 1) * perEpisodeMinutes(it);
      if (isShortItem(it.text)) return s + 20;
      return s + 130;
    }, 0);
  }
  function duelResultHtml(all, a, b) {
    const pa = all.find(p => p.pid === a), pb = all.find(p => p.pid === b);
    if (!pa || !pb) return '';
    if (pa === pb) return '<p class="v40-muted">Escolha dois títulos diferentes.</p>';
    const table = V40.leagueTable(all);
    const posOf = p => { const x = table.find(t => t.pid === p.pid); return x ? x.pos : null; };
    const heroes = p => (p.heroes || []).map(g => g.emoji + ' ' + g.label).join(', ') || '—';
    const rows = [
      ['⭐ Nota', pa.rating > 0 ? V40.fmt1(pa.rating) : '—', pb.rating > 0 ? V40.fmt1(pb.rating) : '—', (pa.rating || 0) - (pb.rating || 0)],
      ['🏅 Pontos', V40.fmt1(pa.pts), V40.fmt1(pb.pts), pa.pts - pb.pts],
      ['📋 Posição', posOf(pa) ? posOf(pa) + 'º' : '—', posOf(pb) ? posOf(pb) + 'º' : '—', (posOf(pb) || 999) - (posOf(pa) || 999)],
      ['⏱ Duração', Math.round(durationMin(pa) / 60 * 10) / 10 + 'h', Math.round(durationMin(pb) / 60 * 10) / 10 + 'h', 0],
      ['🦸 Herói', heroes(pa), heroes(pb), 0],
      ['🗓 Visto em', pa.completedAt ? V40.fmtBR(pa.completedAt, true) : (pa.done ? 'antes da lista' : 'ainda não'), pb.completedAt ? V40.fmtBR(pb.completedAt, true) : (pb.done ? 'antes da lista' : 'ainda não'), 0]
    ];
    const score = rows.slice(0, 3).reduce((s, r) => s + Math.sign(r[3]), 0);
    let verdict;
    if (!(pa.rating > 0) && !(pb.rating > 0)) verdict = 'Nenhum dos dois tem nota ainda — duelo adiado ⏳';
    else if (score > 0) verdict = `🏆 ${V40.esc(pa.name)} vence o duelo`;
    else if (score < 0) verdict = `🏆 ${V40.esc(pb.name)} vence o duelo`;
    else verdict = '🤝 Empate técnico — só o mata-mata resolve';
    return `<table class="v40-duel"><tr><th></th><th>${V40.esc(pa.name)}</th><th>${V40.esc(pb.name)}</th></tr>
      ${rows.map(r => `<tr><td>${r[0]}</td><td class="${r[3] > 0 ? 'win' : ''}">${V40.esc(String(r[1]))}</td><td class="${r[3] < 0 ? 'win' : ''}">${V40.esc(String(r[2]))}</td></tr>`).join('')}
    </table><div class="v40-verdict">${verdict}</div>`;
  }
  V40.openDuel = function (pid) {
    V40.duelA = pid;
    const t = V40.leagueTable();
    const other = t.find(p => p.pid !== pid);
    V40.duelB = other ? other.pid : null;
    V40.ligaTab = 'duelo'; V40.set('liga-tab', 'duelo');
    closeModal();
    switchTab('tabLiga');
  };

  // ---------- 📈 histórico ----------
  V40.histHero = V40.get('hist-hero', null);
  function historyHtml(heroRows, hist) {
    const ranked = V40.heroTable(heroRows, 'geral');
    if (!V40.histHero && ranked[0]) V40.histHero = ranked[0].r.g.id;
    const g = HERO_GROUPS.find(x => x.id === V40.histHero);
    const pts = hist.filter(h => h.heroes && h.heroes[V40.histHero] != null).map(h => ({ r: h.r, pos: h.heroes[V40.histHero] }));
    // maiores subidas desde o primeiro registro
    const first = hist[0], last = hist[hist.length - 1];
    let movers = [];
    if (first && last && first !== last) {
      movers = Object.keys(last.heroes).map(id => ({ id, d: (first.heroes[id] || last.heroes[id]) - last.heroes[id] }))
        .filter(m => m.d !== 0).sort((a, b) => b.d - a.d);
    }
    const name = id => { const x = HERO_GROUPS.find(h => h.id === id); return x ? x.emoji + ' ' + V40.esc(x.label) : id; };
    return `<div class="stat-card">
        <h4>📈 Histórico de posições (Geral)</h4>
        <select id="v40HistSel" class="v40-select">${ranked.map(x => `<option value="${x.r.g.id}" ${x.r.g.id === V40.histHero ? 'selected' : ''}>${x.r.g.emoji} ${V40.esc(x.r.g.label)}</option>`).join('')}</select>
        ${pts.length >= 2 ? posChartSvg(pts) : `<p class="v40-muted">O gráfico aparece depois de pelo menos 2 rodadas registradas${g ? ' com ' + V40.esc(g.label) + ' na tabela' : ''}. Cada título concluído com nota = 1 rodada.</p>`}
      </div>
      <div class="stat-card">
        <h4>🚀 Quem mais subiu / caiu</h4>
        ${movers.length ? movers.slice(0, 5).map(m => `<div class="v40-row">${name(m.id)} <span class="hmove up">▲${m.d}</span></div>`).join('') + movers.slice(-3).reverse().filter(m => m.d < 0).map(m => `<div class="v40-row">${name(m.id)} <span class="hmove down">▼${-m.d}</span></div>`).join('') : '<p class="v40-muted">Ainda sem movimento registrado — a partir de agora cada rodada fica guardada.</p>'}
        <p class="v40-muted">Registro começou na rodada ${first ? first.r : '—'} (${first ? V40.fmtBR(first.d, true) : ''}).</p>
      </div>`;
  }
  function posChartSvg(pts) {
    const W = 320, H = 150, pad = 26;
    const maxPos = Math.max.apply(null, pts.map(p => p.pos).concat([3]));
    const minR = pts[0].r, maxR = pts[pts.length - 1].r;
    const x = r => pad + (maxR === minR ? 0 : (r - minR) / (maxR - minR)) * (W - pad * 2);
    const y = pos => pad / 2 + (pos - 1) / Math.max(1, maxPos - 1) * (H - pad * 1.5);
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.r).toFixed(1)},${y(p.pos).toFixed(1)}`).join(' ');
    const dots = pts.map(p => `<circle cx="${x(p.r).toFixed(1)}" cy="${y(p.pos).toFixed(1)}" r="3.2"><title>Rodada ${p.r}: ${p.pos}º</title></circle>`).join('');
    return `<svg class="v40-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Posição por rodada">
      <text x="2" y="${y(1) + 4}" class="ax">1º</text><text x="2" y="${y(maxPos) + 4}" class="ax">${maxPos}º</text>
      <line x1="${pad}" x2="${W - pad}" y1="${y(1)}" y2="${y(1)}" class="grid"/>
      <path d="${path}" class="line"/>${dots}
      <text x="${pad}" y="${H - 2}" class="ax">rod. ${minR}</text><text x="${W - pad}" y="${H - 2}" class="ax" text-anchor="end">rod. ${maxR}</text>
    </svg>`;
  }

  // ---------- 🏆 mata-mata (regulamento v40.3) ----------
  // 1º e 2º (entre os concluídos) vão direto pra semifinal. 3º ao 10º jogam a repescagem:
  //   1ª fase: 3×10 · 6×7 (lado A) e 4×9 · 5×8 (lado B) → final da repescagem de cada lado.
  // Semifinais: 1º × vencedor B e 2º × vencedor A. Depois a final: o campeão é o Verdadeiro 10.
  // Guardamos só a classificação do início (seeds) e os seus palpites; o resto é recalculado.
  const KO_KEY = 'liga-edicao';
  const MATCHES = [
    { a: { s: 3 }, b: { s: 10 }, phase: 'rep1', label: 'Repescagem · lado A' },
    { a: { s: 6 }, b: { s: 7 }, phase: 'rep1', label: 'Repescagem · lado A' },
    { a: { s: 4 }, b: { s: 9 }, phase: 'rep1', label: 'Repescagem · lado B' },
    { a: { s: 5 }, b: { s: 8 }, phase: 'rep1', label: 'Repescagem · lado B' },
    { a: { m: 0 }, b: { m: 1 }, phase: 'rep2', label: 'Final da repescagem · vaga A' },
    { a: { m: 2 }, b: { m: 3 }, phase: 'rep2', label: 'Final da repescagem · vaga B' },
    { a: { s: 1 }, b: { m: 5 }, phase: 'semi', label: 'Semifinal 1' },
    { a: { s: 2 }, b: { m: 4 }, phase: 'semi', label: 'Semifinal 2' },
    { a: { m: 6 }, b: { m: 7 }, phase: 'final', label: 'Final' }
  ];
  const PHASES = [['rep1', 'Repescagem — 1ª fase'], ['rep2', 'Repescagem — final'], ['semi', 'Semifinais'], ['final', 'Final']];
  function currentSeeds(table) {
    const done = (table || V40.leagueTable()).filter(p => p.done && p.seed && p.seed <= V40.LIGA_REP_END);
    const seeds = [];
    done.forEach(p => { seeds[p.seed - 1] = p.pid; });
    return seeds;
  }
  // resolve a chave: cada jogo vira {a, b, w, ready, done}; undefined = ainda não definido
  function solve(ed) {
    const picks = {};
    (ed.picks || []).forEach(x => { picks[x.i] = x.side; });
    const res = [];
    const side = src => {
      if (src.s) return ed.seeds[src.s - 1] || null;
      const m = res[src.m];
      return m.done ? m.w : undefined;
    };
    MATCHES.forEach((def, i) => {
      const a = side(def.a), b = side(def.b);
      const m = { i, def, a, b, w: undefined, done: false, bye: false, played: false };
      if (a !== undefined && b !== undefined) {
        if (!a || !b) { m.w = a || b || null; m.done = true; m.bye = true; }
        else if (picks[i]) { m.w = picks[i] === 'a' ? a : b; m.done = true; m.played = true; }
      }
      res.push(m);
    });
    return res;
  }
  V40.ligaEdition = function () { return V40.get(KO_KEY, null); };
  // último Verdadeiro 10 (edições novas; se ainda não teve, o do mata-mata antigo)
  V40.lastTrue10 = function () {
    const l4c = V40.get('liga4-campeoes', []);
    if (l4c.length) return l4c[l4c.length - 1].name;
    const list = V40.get('liga-campeoes', []);
    if (list.length) return list[list.length - 1].name;
    const ko = V40.get('knockout', null);
    if (ko && ko.champion) { const p = V40.participants().find(x => x.pid === ko.champion); return p ? p.name : null; }
    return null;
  };
  V40.newEdition = function () {
    const table = V40.leagueTable();
    const seeds = currentSeeds(table);
    const editions = V40.get('liga-campeoes', []);
    const ed = { n: editions.length + 1, created: new Date().toISOString(), seeds, picks: [], champion: null };
    V40.set(KO_KEY, ed);
    return ed;
  };
  function koPick(i, s) {
    if (!V40.guard()) return;
    const ed = V40.ligaEdition();
    if (!ed) return;
    ed.picks.push({ i, side: s });
    const res = solve(ed);
    const fin = res[res.length - 1];
    if (fin.done && fin.w && !ed.champion) {
      ed.champion = fin.w;
      ed.finishedAt = new Date().toISOString();
      const list = V40.get('liga-campeoes', []);
      const p = V40.participants().find(x => x.pid === fin.w);
      list.push({ n: ed.n, pid: fin.w, name: p ? p.name : fin.w, rating: p ? p.rating : null, at: ed.finishedAt, created: ed.created });
      V40.set('liga-campeoes', list);
      V40.confetti(true); V40.sound('trophy');
      V40.logEvent('ko-champion', { name: p ? p.name : fin.w });
    } else V40.sound('tick');
    V40.set(KO_KEY, ed);
    V40.renderLiga();
  }
  function koUndo() {
    const ed = V40.ligaEdition();
    if (!ed || !ed.picks.length) return;
    ed.picks.pop();
    if (ed.champion) {
      V40.set('liga-campeoes', V40.get('liga-campeoes', []).filter(c => c.created !== ed.created));
      ed.champion = null; delete ed.finishedAt;
    }
    V40.set(KO_KEY, ed);
    V40.renderLiga();
  }
  function knockoutHtml(all) {
    const table = V40.leagueTable(all);
    const byPid = {};
    all.forEach(p => { byPid[p.pid] = p; });
    const tbl = {};
    table.forEach(p => { tbl[p.pid] = p; });
    const nm = pid => pid && byPid[pid] ? `${byPid[pid].icon} ${V40.esc(byPid[pid].name)}` : (pid ? '(saiu da lista)' : '<i class="v40-muted">—</i>');
    const seedTag = (ed, pid) => { const k = ed.seeds.indexOf(pid); return k >= 0 ? `<small class="v40-muted">${k + 1}º</small> ` : ''; };
    const ties = V40.pendingTies(table);
    const seedsNow = currentSeeds(table);
    const ed = V40.ligaEdition();
    const doneCount = table.filter(p => p.done).length;
    const rules = `<details class="v40-help"><summary>📜 Regulamento</summary>
      <ol style="margin:6px 0 0 18px;padding:0;font-size:0.8rem;">
        <li>Pontos corridos: a pontuação é a nota exata.</li>
        <li>Desempate: ⭐ favorito ▸ consistência (% de episódios com nota 9+; filme conta como 1 episódio) ▸ você decide num duelo, se o empate valer vaga.</li>
        <li>Só títulos concluídos ocupam vaga. 1º e 2º vão direto pras semifinais.</li>
        <li>3º ao 10º jogam a repescagem: 3×10 e 6×7 (lado A), 4×9 e 5×8 (lado B). Cada lado dá 1 vaga.</li>
        <li>Semifinais: 1º × vencedor B e 2º × vencedor A. O campeão da final é o 👑 Verdadeiro 10.</li>
        <li>A chave usa a classificação do dia em que a edição começa.</li>
      </ol></details>`;
    if (!ed) {
      const list = seedsNow.map((pid, k) => `<div class="v40-lrow ${k < V40.LIGA_DIRECT ? 'champ' : 'g'}"><span class="lpos">${k + 1}º</span><span class="lname">${nm(pid)}</span><span class="lpts">${tbl[pid] ? V40.fmt1(tbl[pid].pts) : ''}</span><span class="lrat">${k < V40.LIGA_DIRECT ? 'direto' : 'repesc.'}</span></div>`).join('');
      return `${tiesHtml(table)}
        <div class="stat-card">
          <h4>🏆 Mata-mata — edição ${V40.get('liga-campeoes', []).length + 1}</h4>
          ${doneCount < 2 ? `<p>Precisa de pelo menos 2 títulos concluídos com nota. Agora: ${doneCount}.</p>` : `
          <p class="v40-muted" style="margin-top:-4px;">Classificados pela tabela de agora:</p>
          ${list}
          <button class="v40-primary" id="v40EdStart" style="margin-top:10px;width:100%;" ${ties.length ? 'disabled' : ''}>▶️ Começar a edição</button>
          ${ties.length ? '<p class="v40-muted">Decida o empate acima antes de começar.</p>' : ''}`}
          ${rules}
        </div>`;
    }
    const res = solve(ed);
    const cur = res.find(m => !m.done && m.a && m.b);
    const changed = seedsNow.join('|') !== ed.seeds.join('|');
    let stage = '';
    if (ed.champion) {
      const c = byPid[ed.champion];
      stage = `<div class="stat-card v40-ko-champ">
        <div class="v40-champ-crown">👑</div>
        <div class="v40-muted">O VERDADEIRO 10 · EDIÇÃO ${ed.n}</div>
        <div class="v40-big">${nm(ed.champion)}</div>
        ${c ? `<div class="v40-muted">nota ${V40.fmt1(c.rating)} · ${seedTag(ed, ed.champion).replace(/<[^>]+>/g, '')}na tabela · campeão em ${V40.fmtBR((ed.finishedAt || V40.today()).slice(0, 10), true)}</div>` : ''}
      </div>`;
    } else if (cur) {
      const pa = byPid[cur.a], pb = byPid[cur.b];
      const card = (p, s, pid) => `<button class="v40-ko-pick" data-kopick="${cur.i}" data-side="${s}">
          ${p && V40.posterUrl && V40.posterUrl(p.items[0], 'w185') ? `<img class="v40-ko-img" src="${V40.posterUrl(p.items[0], 'w185')}" alt="">` : `<span class="ico">${p ? p.icon : '❔'}</span>`}
          <span class="nm">${p ? V40.esc(p.name) : '(saiu)'}</span>
          <span class="v40-muted">${ed.seeds.indexOf(pid) + 1}º na tabela${p ? ' · nota ' + V40.fmt1(p.rating) : ''}</span>
        </button>`;
      stage = `<div class="stat-card">
        <h4>⚔️ ${cur.def.label}</h4>
        <p class="v40-muted" style="margin-top:-4px;">Qual dos dois é <b>mais 10</b>? Toque no vencedor.</p>
        <div class="v40-ko-match">${card(pa, 'a', cur.a)}<div class="v40-vs">VS</div>${card(pb, 'b', cur.b)}</div>
      </div>`;
    }
    const bracket = PHASES.map(([ph, name]) => {
      const ms = res.filter(m => m.def.phase === ph);
      return `<div class="v40-ko-round"><div class="v40-ko-rname">${name}</div>${ms.map(m => `
        <div class="v40-ko-m" title="${V40.esc(m.def.label)}">
          <span class="${m.done && m.w && m.w === m.a ? 'win' : (m.played ? 'lose' : '')}">${m.a === undefined ? '<i class="v40-muted">a definir</i>' : seedTag(ed, m.a) + nm(m.a)}</span>
          <span class="${m.done && m.w && m.w === m.b ? 'win' : (m.played ? 'lose' : '')}">${m.b === undefined ? '<i class="v40-muted">a definir</i>' : seedTag(ed, m.b) + nm(m.b)}</span>
        </div>`).join('')}</div>`;
    }).join('');
    return `
      ${changed && !ed.champion ? `<div class="stat-card v40-warn">📋 A classificação mudou desde que esta edição começou. <button class="v40-link" id="v40EdReset2">Recomeçar com a tabela de agora ›</button></div>` : ''}
      ${stage}
      <div class="stat-card">
        <h4>🗂 Chave — edição ${ed.n}</h4>
        <div class="v40-ko-bracket">${bracket}</div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
          <button id="v40KoUndo" ${ed.picks.length ? '' : 'disabled'}>↺ Desfazer último jogo</button>
          <button id="v40EdReset" class="v40-danger">🔄 Recomeçar</button>
          ${ed.champion ? '<button id="v40EdNew">▶️ Nova edição</button>' : ''}
        </div>
        ${rules}
      </div>`;
  }

  // ---------- imagem pra compartilhar ----------
  V40.shareLigaImage = function () {
    const table = V40.ligaStandings().map(t => Object.assign({}, t, { pts: t.P, rating: t.J }));
    const heroes = V40.heroTable(V40.heroLeague(), 'geral').slice(0, 5);
    const W = 1080, H = 1350;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#15141b'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let x = 0; x < W; x += 24) for (let y = 0; y < H; y += 24) ctx.fillRect(x, y, 2, 2);
    ctx.fillStyle = '#b6332c'; ctx.fillRect(0, 0, W, 14);
    ctx.fillStyle = '#efe4c8';
    ctx.font = 'bold 76px Bangers, Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LIGA UCM 🥇', W / 2, 120);
    ctx.font = '600 34px "Baloo 2", sans-serif';
    ctx.fillStyle = '#d9a441';
    ctx.fillText(`Rodada ${V40.ligaProgress().rodada} · ${V40.fmtBR(V40.today(), true)}`, W / 2, 175);
    ctx.textAlign = 'left';
    let y = 250;
    ctx.font = 'bold 30px "Baloo 2", sans-serif';
    ctx.fillStyle = '#9a927e';
    ctx.fillText('#', 70, y); ctx.fillText('TIME', 150, y); ctx.textAlign = 'right'; ctx.fillText('PTS', 900, y); ctx.fillText('J', 1010, y); ctx.textAlign = 'left';
    y += 20;
    let lastPos = null;
    table.slice(0, 12).forEach(p => {
      y += 58;
      if (p.pos === 1) { ctx.fillStyle = 'rgba(217,164,65,0.16)'; ctx.fillRect(50, y - 42, W - 100, 56); }
      ctx.fillStyle = p.pos === 1 ? '#d9a441' : '#efe4c8';
      ctx.font = 'bold 34px "JetBrains Mono", monospace';
      if (p.pos !== lastPos) ctx.fillText(p.pos + 'º', 66, y);
      lastPos = p.pos;
      ctx.font = '600 34px "Baloo 2", sans-serif';
      let name = (p.pos === 1 ? '👑 ' : '') + p.name;
      while (ctx.measureText(name).width > 680 && name.length > 4) name = name.slice(0, -2);
      if (name !== (p.pos === 1 ? '👑 ' : '') + p.name) name += '…';
      ctx.fillText(name, 150, y);
      ctx.textAlign = 'right';
      ctx.font = 'bold 34px "JetBrains Mono", monospace';
      ctx.fillText(String(p.pts), 900, y);
      ctx.fillStyle = '#9a927e';
      ctx.fillText(String(p.rating), 1010, y);
      ctx.textAlign = 'left';
    });
    y += 90;
    ctx.fillStyle = '#d9a441';
    ctx.font = 'bold 46px Bangers, Impact, sans-serif';
    ctx.fillText('TOP 5 HERÓIS (GERAL)', 66, y);
    heroes.forEach(x => {
      y += 56;
      ctx.fillStyle = '#efe4c8';
      ctx.font = '600 34px "Baloo 2", sans-serif';
      ctx.fillText(`${x.pos}º  ${x.r.g.emoji} ${x.r.g.label}`, 66, y);
      ctx.textAlign = 'right';
      ctx.font = 'bold 34px "JetBrains Mono", monospace';
      ctx.fillStyle = '#d9a441';
      ctx.fillText(V40.fmt1(x.val), 1010, y);
      ctx.textAlign = 'left';
    });
    ctx.fillStyle = '#9a927e';
    ctx.font = '500 26px "Baloo 2", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Cronologia UCM — watchlist', W / 2, H - 40);
    cv.toBlob(async blob => {
      if (!blob) { V40.toast('❌ Não deu pra gerar a imagem'); return; }
      const file = new File([blob], 'liga-ucm.png', { type: 'image/png' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Liga UCM' });
          return;
        }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'liga-ucm.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      V40.toast('🖼️ Imagem salva!');
    }, 'image/png');
  };

  // ---------- 🦸 cartão do herói ----------
  V40.openHeroCard = function (id) {
    const g = HERO_GROUPS.find(x => x.id === id);
    if (!g) return;
    const rows = V40.heroLeague();
    const r = rows.find(x => x.g.id === id);
    const posIn = which => { const t = V40.heroTable(rows, which); const x = t.find(y => y.r.g.id === id); return x ? x.pos + 'º/' + t.length : '—'; };
    // títulos do herói (com e sem nota)
    const mine = items.filter(it => simpleKind(it) !== 'jogo' && heroGroupsOf(it).some(h => h.id === id));
    const seen = mine.filter(it => it.done).length;
    const rated = r.all.slice().sort((a, b) => b.rating - a.rating);
    const best = rated[0], worst = rated[rated.length - 1];
    const hist = V40.get('liga-history', []).filter(h => h.heroes && h.heroes[id] != null).map(h => ({ r: h.r, pos: h.heroes[id] }));
    V40.modal(`
      <div class="v40-hero-card">
        <div class="v40-hero-emoji">${g.emoji}</div>
        <h3 style="text-align:center;margin-bottom:2px;">${V40.esc(g.label)}</h3>
        ${g._origLabel && g._origLabel !== g.label ? `<p class="v40-muted" style="text-align:center;margin:0;">(${V40.esc(g._origLabel)})</p>` : ''}
        <div class="v40-hero-stats">
          <div><b>${r.avgGeral != null ? V40.fmt1(r.avgGeral) : '—'}</b><small>GERAL · ${posIn('geral')}</small></div>
          <div><b>${r.avgFilmes != null ? V40.fmt1(r.avgFilmes) : '—'}</b><small>FILMES · ${posIn('filmes')}</small></div>
          <div><b>${r.avgSeries != null ? V40.fmt1(r.avgSeries) : '—'}</b><small>SÉRIES · ${posIn('series')}</small></div>
          <div><b>${seen}/${mine.length}</b><small>VISTOS</small></div>
          <div><b>${V40.fmt1(r.pts)}</b><small>PONTOS</small></div>
          <div><b>${r.tens}</b><small>NOTAS 10</small></div>
        </div>
        ${best ? `<p>🏆 Melhor: <b>${V40.esc(best.name)}</b> (${V40.fmt1(best.rating)})${worst && worst !== best ? `<br>📉 Pior: <b>${V40.esc(worst.name)}</b> (${V40.fmt1(worst.rating)})` : ''}</p>` : '<p class="v40-muted">Nenhum título dele com nota ainda.</p>'}
        ${hist.length >= 2 ? '<p class="v40-muted" style="margin-bottom:0;">Posição na Geral por rodada:</p>' + posChartSvg(hist) : ''}
        <div class="v40-hero-list">${mine.map(it => {
          const er = V40.effRating(it);
          return `<div class="v40-row"><span style="flex:1">${it.done ? '✅' : (V40.inProgress(it) ? '▶️' : '⬜')} ${V40.esc(V40.cleanName(it))}</span><b>${er > 0 ? V40.fmt1(er) : '—'}</b></div>`;
        }).join('')}</div>
        <button id="v40HeroGoList" class="v40-primary" style="width:100%;margin-top:10px;">Ver na lista</button>
      </div>`);
    document.getElementById('v40HeroGoList').addEventListener('click', () => {
      closeModal(); switchTabSilent('tabLista'); setHeroFilter(id);
    });
  };

  // ---------- eventos ----------
  function wireLiga(el, all) {
    el.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => {
      const t = document.getElementById(b.dataset.toggle);
      if (t) t.hidden = !t.hidden;
    }));
    el.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => {
      V40.ligaTab = b.dataset.goto; V40.set('liga-tab', V40.ligaTab); V40.renderLiga();
    }));
    el.querySelectorAll('[data-hw]').forEach(b => b.addEventListener('click', () => {
      V40.heroWhich = b.dataset.hw; V40.set('hero-which', V40.heroWhich); V40.renderLiga();
    }));
    el.querySelectorAll('.v40-hrow[data-hero]').forEach(r => r.addEventListener('click', () => V40.openHeroCard(r.dataset.hero)));
    el.querySelectorAll('.v40-lrow[data-pid]').forEach(r => r.addEventListener('click', () => {
      V40.duelA = r.dataset.pid; V40.duelB = null;
      const t = V40.leagueTable();
      const other = t.find(p => p.pid !== r.dataset.pid);
      V40.duelB = other ? other.pid : null;
      V40.ligaTab = 'duelo'; V40.set('liga-tab', 'duelo'); V40.renderLiga();
    }));
    const share = document.getElementById('v40ShareLiga');
    if (share) share.addEventListener('click', V40.shareLigaImage);
    const ps = document.getElementById('v40PhaseSel');
    if (ps) ps.addEventListener('change', () => { V40.ligaPhase = ps.value; V40.set('liga-phase', ps.value); V40.renderLiga(); });
    const da = document.getElementById('v40DuelA'), db = document.getElementById('v40DuelB');
    const upd = () => { V40.duelA = da.value; V40.duelB = db.value; document.getElementById('v40DuelOut').innerHTML = duelResultHtml(all, da.value, db.value); };
    if (da) { da.addEventListener('change', upd); db.addEventListener('change', upd); }
    const hs = document.getElementById('v40HistSel');
    if (hs) hs.addEventListener('change', () => { V40.histHero = hs.value; V40.set('hist-hero', hs.value); V40.renderLiga(); });
    el.querySelectorAll('[data-kopick]').forEach(b => b.addEventListener('click', () => koPick(+b.dataset.kopick, b.dataset.side)));
    el.querySelectorAll('[data-tiefix]').forEach(b => b.addEventListener('click', () => {
      const t = V40.pendingTies()[+b.dataset.tiefix];
      if (t) V40.openTieResolver(t);
    }));
    const undo = document.getElementById('v40KoUndo');
    if (undo) undo.addEventListener('click', koUndo);
    const start = document.getElementById('v40EdStart');
    if (start) start.addEventListener('click', () => { if (!V40.guard()) return; V40.newEdition(); V40.renderLiga(); });
    const reset = () => {
      const ed = V40.ligaEdition();
      if (ed && ed.picks.length && !confirm('Recomeçar a edição do zero com a tabela de agora? Os jogos já decididos nela se perdem.')) return;
      if (ed && ed.champion) V40.set('liga-campeoes', V40.get('liga-campeoes', []).filter(c => c.created !== ed.created));
      V40.set(KO_KEY, null); V40.renderLiga();
    };
    const r1 = document.getElementById('v40EdReset'); if (r1) r1.addEventListener('click', reset);
    const r2 = document.getElementById('v40EdReset2'); if (r2) r2.addEventListener('click', reset);
    const nw = document.getElementById('v40EdNew');
    if (nw) nw.addEventListener('click', () => { V40.set(KO_KEY, null); V40.renderLiga(); });
  }
})();
