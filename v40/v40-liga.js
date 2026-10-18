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
  //   Copa do Infinito: 8 vagas até 51 times, +1 por time novo, até 32 (com fase de grupos).
  // =====================================================================
  const L4_KEY = 'liga4';
  function teamBase(name) {
    return String(name).replace(/\s+T\d.*$/, '').replace(/\s+\(\d+ eps\)$/, '').replace(/\s*⏳\s*$/, '').trim();
  }
  // tamanho de cada temporada nos itens que juntam várias temporadas num item só
  const EXTRA_SEASON_SIZES = { k19: [13, 13, 19, 17, 14] };
  function seasonSizesOf(it) {
    if (EXTRA_SEASON_SIZES[it.key]) return EXTRA_SEASON_SIZES[it.key];
    for (const cfg of (typeof TRIOS !== 'undefined' ? TRIOS : [])) {
      const k = cfg.keys.indexOf(it.key);
      if (k >= 0) return cfg.seasonSizes[k];
    }
    return null;
  }
  // v40.4.3: cada TEMPORADA é um time (partes da mesma temporada juntam; ex.: Agents of SHIELD T1
  // em 3 partes vira "T1"). Filme é sempre independente. Só entra o que você CONCLUIU (temporada
  // inteira vista / filme visto) — o que não lançou ou você não terminou fica de fora até terminar.
  V40.ligaTeams = function (projectAll) {
    const map = new Map();
    const seriesSeasons = {};
    const add = (key, base, season, icon, kind, unit, order) => {
      if (!map.has(key)) map.set(key, { pid: key, base, season, icon, kind, units: [], order });
      const t = map.get(key);
      t.units.push(unit);
      t.order = Math.min(t.order, order);
    };
    V40.participants().forEach(p => p.items.forEach(it => {
      const order = p.order;
      if (p.kind !== 'serie') {
        add('T:i' + it.id, V40.shortName(it), null, p.icon, 'filme', { it, from: 0, to: null }, order);
        return;
      }
      const base = teamBase(V40.shortName(it));
      const c = V40.catOf(it);
      let seasons = c && c.x && c.x.s != null ? c.x.s : null;
      if (seasons == null) { const m = /\bT(\d+)\b/.exec(it.text); seasons = m ? +m[1] : 1; }
      const list = Array.isArray(seasons) ? seasons : [seasons];
      seriesSeasons[base] = seriesSeasons[base] || new Set();
      list.forEach(s => seriesSeasons[base].add(s));
      const sizes = list.length > 1 ? seasonSizesOf(it) : null;
      if (list.length > 1 && sizes && sizes.length === list.length) {
        let from = 0;
        list.forEach((s, k) => { add('T:s:' + base + '|' + s, base, s, p.icon, 'serie', { it, from, to: from + sizes[k] }, order); from += sizes[k]; });
      } else if (list.length > 1) {
        add('T:s:' + base + '|' + list.join('-'), base, 'T' + list[0] + '–T' + list[list.length - 1], p.icon, 'serie', { it, from: 0, to: null }, order);
      } else {
        add('T:s:' + base + '|' + list[0], base, list[0], p.icon, 'serie', { it, from: 0, to: null }, order);
      }
    }));
    const unitDone = u => {
      if (u.it.done) return true;
      if (u.to == null) return false;
      const d = Array.isArray(u.it.epDone) ? u.it.epDone : [];
      for (let i = u.from; i < u.to; i++) if (!d[i]) return false;
      return true;
    };
    // projeção: todos os times que vão existir quando a lista acabar (lançados até o fim da lista)
    const endD = projectAll ? (V40.endDate && V40.endDate()) : null;
    const released = t => !endD || t.units.every(u => { const c = V40.catOf(u.it); const r = c && c.x && c.x.rel; return !r || r <= endD; });
    return [...map.values()].filter(t => projectAll ? released(t) : t.units.every(unitDone)).map(t => {
      const multi = t.kind === 'serie' && seriesSeasons[t.base] && seriesSeasons[t.base].size > 1;
      t.name = t.kind === 'serie' && multi ? `${t.base} ${typeof t.season === 'number' ? 'T' + t.season : t.season}` : t.base;
      t.items = t.units.map(u => u.it);
      t.done = true; t.inProgress = false;
      t.poster = null;
      for (const it of t.items) { const u = V40.posterUrl && V40.posterUrl(it, 'w185'); if (u) { t.poster = u; break; } }
      t.franchise = franchiseOf(t);
      return t;
    }).sort((a, b) => a.order - b.order);
  };
  // ---------- ⚡ clássicos: mesma franquia / mesma série ----------
  const FRANCHISES = [
    { id: 'aranha-holland', re: /^Spider-Man: (Homecoming|Far From Home|No Way Home|Brand New Day)/, name: 'Clássico do Aranha de Holland', emoji: '🕷️', c: ['#c8102e', '#0b3d91'], pat: 'web' },
    { id: 'aranhaverso', re: /Spider-Verse/, name: 'Clássico do Aranhaverso', emoji: '🌀', c: ['#ff2e88', '#00b3ff'], pat: 'glitch' },
    { id: 'aranha-garfield', re: /Amazing Spider-Man/, name: 'Clássico do Espetacular', emoji: '🕸️', c: ['#d7263d', '#1b1f3b'], pat: 'web' },
    { id: 'aranha-raimi', re: /^Spider-Man( 2| 3)?$/, name: 'Clássico do Aranha de Raimi', emoji: '🕸️', c: ['#8e0e1a', '#1c2d6b'], pat: 'web' },
    { id: 'aranha-animado', re: /^(Ultimate Spider-Man|Marvel's Spider-Man|Your Friendly Neighborhood Spider-Man)/, name: 'Clássico do Aranha Animado', emoji: '🕸️', c: ['#e63946', '#1d3557'], pat: 'web' },
    { id: 'venom', re: /Venom/, name: 'Clássico Simbionte', emoji: '🖤', c: ['#050505', '#7d7d7d'], pat: 'goo' },
    { id: 'wolverine', re: /Wolverine|Logan|Deadpool/, name: 'Clássico das Garras', emoji: '🗡️', c: ['#e8b511', '#1d3c78'], pat: 'claw' },
    { id: 'xmen', re: /X-Men/, name: 'Clássico dos Mutantes', emoji: '🧬', c: ['#141428', '#f2c94c'], pat: 'x' },
    { id: 'vingadores', re: /^(The )?Avengers|^Marvel's Avengers/, name: 'Clássico dos Vingadores', emoji: '🛡️', c: ['#1d3557', '#c1121f'], pat: 'bolt' },
    { id: 'ferro', re: /^Iron Man/, name: 'Clássico do Homem de Ferro', emoji: '🔧', c: ['#a4161a', '#e0a100'], pat: 'grid' },
    { id: 'thor', re: /^Thor/, name: 'Clássico do Trovão', emoji: '⚡', c: ['#1b263b', '#7fb7e6'], pat: 'bolt' },
    { id: 'capitao', re: /^Captain America/, name: 'Clássico do Capitão', emoji: '⭐', c: ['#0a3161', '#b31942'], pat: 'stars' },
    { id: 'guardioes', re: /Guardians of the Galaxy|I Am Groot/, name: 'Clássico dos Guardiões', emoji: '🚀', c: ['#f77f00', '#3a0ca3'], pat: 'cosmic' },
    { id: 'formiga', re: /Ant-Man/, name: 'Clássico Quântico', emoji: '🐜', c: ['#9d0208', '#14213d'], pat: 'hex' },
    { id: 'wakanda', re: /Black Panther|Wakanda/, name: 'Clássico de Wakanda', emoji: '🐾', c: ['#3c1361', '#9a9ab0'], pat: 'hex' },
    { id: 'estranho', re: /Doctor Strange/, name: 'Clássico Místico', emoji: '🔮', c: ['#3d1a5b', '#ff9f1c'], pat: 'rings' },
    { id: 'quarteto', re: /Fantastic Four/, name: 'Clássico Fantástico', emoji: '🔵', c: ['#1f4e9c', '#dfe7f5'], pat: 'rings' },
    { id: 'hulk', re: /Hulk/, name: 'Clássico Esmaga', emoji: '💚', c: ['#1b5e20', '#6a1b9a'], pat: 'grid' },
    { id: 'demolidor', re: /Daredevil/, name: "Clássico de Hell's Kitchen", emoji: '😈', c: ['#6a040f', '#111111'], pat: 'city' },
    { id: 'ruas', re: /Jessica Jones|Luke Cage|Iron Fist|Defenders|Punisher/, name: 'Clássico das Ruas', emoji: '🏙️', c: ['#2b2d42', '#ef233c'], pat: 'city' },
    { id: 'westview', re: /WandaVision|Agatha|VisionQuest/, name: 'Clássico de Westview', emoji: '📺', c: ['#ad1457', '#ffca28'], pat: 'tv' },
    { id: 'loki', re: /^Loki/, name: 'Clássico da TVA', emoji: '🐍', c: ['#14532d', '#d4af37'], pat: 'clock' },
    { id: 'whatif', re: /What If/, name: 'Clássico do Multiverso', emoji: '👁️', c: ['#240046', '#7b2cbf'], pat: 'cosmic' },
    { id: 'shield', re: /S\.H\.I\.E\.L\.D|Agent Carter/, name: 'Clássico da S.H.I.E.L.D.', emoji: '🦅', c: ['#0d1b2a', '#8d99ae'], pat: 'grid' }
  ];
  function franchiseOf(t) {
    for (const it of t.items) {
      const c = V40.catOf(it);
      const names = [c && c.en, V40.shortName(it)].filter(Boolean);
      const f = FRANCHISES.find(f => names.some(n => f.re.test(n)));
      if (f) return f;
    }
    if (t.kind === 'serie') return { id: 'serie:' + t.base, name: 'Clássico de ' + t.base, emoji: '🔥', c: ['#5a189a', '#d9a441'], pat: 'plain' };
    return null;
  }
  V40.isClassic = (a, b) => !!(a && b && a.franchise && b.franchise && a.franchise.id === b.franchise.id);
  const classicBanner = f => `<div class="v40-classic" data-pat="${f.pat}" style="--c1:${f.c[0]};--c2:${f.c[1]}">
      <span class="v40-classic-emo">${f.emoji}</span>
      <div class="v40-classic-txt"><small>⚡ CLÁSSICO ⚡</small><b>${V40.esc(f.name)}</b></div>
      <span class="v40-classic-emo r">${f.emoji}</span>
    </div>`;
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
    list.forEach(t => { t.apr = t.J ? t.P / (t.J * 3) : 0; t.mp = 0; });
    // igual Brasileirão: pontos ▸ vitórias ▸ confronto direto (mini-tabela só com os empatados)
    // ▸ aproveitamento ▸ jogo extra pelo título ▸ ordem alfabética. Posição sempre 1º, 2º, 3º…
    const alpha = (x, y) => x.name.localeCompare(y.name, 'pt-BR', { sensitivity: 'base' });
    list.sort((x, y) => (y.P - x.P) || (y.V - x.V) || alpha(x, y));
    const ex = st.extra || null;
    for (let i = 0; i < list.length;) {
      let j = i;
      while (j + 1 < list.length && list[j + 1].P === list[i].P && list[j + 1].V === list[i].V) j++;
      if (j > i) {
        const grp = list.slice(i, j + 1);
        const ids = new Set(grp.map(t => t.pid));
        grp.forEach(t => { t.mp = 0; });
        Object.keys(st.res).forEach(k => {
          const [a, b] = k.split('§');
          if (!ids.has(a) || !ids.has(b)) return;
          const r = st.res[k];
          if (r === 'd') { by[a].mp++; by[b].mp++; } else if (r === 'a') by[a].mp += 3; else by[b].mp += 3;
        });
        const exRank = t => (ex && ex.w && ex.pids.includes(t.pid)) ? (t.pid === ex.w ? 0 : 1) : 2;
        grp.sort((x, y) => (y.mp - x.mp) || (y.apr - x.apr) || ((exRank(x) < 2 && exRank(y) < 2) ? exRank(x) - exRank(y) : 0) || alpha(x, y));
        list.splice(i, grp.length, ...grp);
      }
      i = j + 1;
    }
    list.forEach((t, i) => {
      t.pos = i + 1;
      t.zone = i < V40.libSlots(list.length) ? 'liberta' : '';
    });
    return list;
  };
  // empate na liderança com o campeonato completo: precisa de jogo extra (sem empate)
  V40.ligaTitleTie = function (table, prog) {
    if (!table || table.length < 2 || !prog || !prog.total || prog.played < prog.total) return null;
    const L = table[0];
    const tied = table.filter(t => t.P === L.P && t.V === L.V && t.mp === L.mp && Math.abs(t.apr - L.apr) < 1e-9);
    if (tied.length < 2) return null;
    const ex = l4().extra;
    const ids = tied.map(t => t.pid).sort();
    if (ex && ex.w && ex.pids.slice().sort().join('|') === ids.join('|')) return null;
    return tied;
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
    const before = V40.ligaStandings();
    st.res[k] = val;
    st.log.push(k);
    const day = V40.today();
    if (!st.day || st.day.d !== day) st.day = { d: day, keys: [] };
    st.day.keys.push(k);
    st.months = st.months || {};
    st.months[day.slice(0, 7)] = (st.months[day.slice(0, 7)] || 0) + 1;
    st.narr = narrate(before, aPid, bPid, r);
    V40.set(L4_KEY, st);
    V40.sound('tick');
    const lim = V40.ligaDaily();
    if (lim.left === 0) { V40.set('liga4-rodadas-cheias', (V40.get('liga4-rodadas-cheias', 0) || 0) + 1); V40.toast('✅ Rodada do dia completa! Amanhã tem mais.'); try { checkAchievements(); } catch (e) {} }
    else if (st.log.length % 10 === 0) { try { checkAchievements(); } catch (e) {} }
    V40.renderLiga();
  }
  // 📣 frase do jogo (usa a tabela de antes do resultado)
  function narrate(before, aPid, bPid, r) {
    const pos = {};
    before.forEach(t => { pos[t.pid] = t; });
    const A = pos[aPid], B = pos[bPid];
    if (!A || !B) return '';
    const n = before.length;
    const cl = V40.isClassic(A, B) ? A.franchise : null;
    const nm = t => `${t.icon} ${t.name}`;
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    if (r === 'd') {
      if (cl) return pick([`${cl.emoji} ${cl.name} termina empatado. Ninguém quis ceder!`, `Empate no ${cl.name}: a rivalidade continua.`]);
      if (A.pos === 1 || B.pos === 1) return `O líder ${nm(A.pos === 1 ? A : B)} só empatou com ${nm(A.pos === 1 ? B : A)}.`;
      return pick([`Tudo igual entre ${nm(A)} e ${nm(B)}.`, `${nm(A)} e ${nm(B)} dividem os pontos.`, `Empate sem graça entre ${nm(A)} e ${nm(B)}.`]);
    }
    const W = r === 'a' ? A : B, L = r === 'a' ? B : A;
    if (cl) return pick([`${cl.emoji} Deu ${nm(W)} no ${cl.name}!`, `${cl.emoji} ${nm(W)} leva o ${cl.name} e tira onda com ${nm(L)}.`]);
    if (L.pos === 1 && L.J > 0) return `💥 O líder caiu! ${nm(W)} derrubou ${nm(L)}.`;
    if (W.pos - L.pos >= Math.max(10, Math.round(n / 4)) && L.J > 0) return pick([`🦓 Zebra! ${nm(W)} (${W.pos}º) venceu ${nm(L)} (${L.pos}º).`, `🦓 Ninguém esperava: ${nm(W)} bateu ${nm(L)}!`]);
    if (W.pos === 1 && W.J > 0) return `👑 O líder ${nm(W)} segue firme: venceu ${nm(L)}.`;
    return pick([`${nm(W)} venceu ${nm(L)}.`, `Vitória de ${nm(W)} sobre ${nm(L)}.`, `${nm(W)} passou por ${nm(L)}.`, `3 pontos pra ${nm(W)}!`]);
  }
  // 🎯 ritmo pra Liga acabar junto com a lista: a Liga até 2 dias antes do fim da lista e a
  // Copa do Infinito nos 2 últimos dias (dia 1: grupos/1ª fase · dia 2: mata-mata até a final). Conta os times que ainda vão entrar (tudo lançado até lá).
  V40.ligaPace = function (teams) {
    const st = l4();
    const end = V40.endDate && V40.endDate();
    const projN = V40.ligaTeams(true).length;
    const nowN = (teams || V40.ligaTeams()).length;
    const totalProj = Math.max(projN, nowN) * (Math.max(projN, nowN) - 1) / 2;
    const playedAll = st.log.filter(k => st.res[k]).length;
    const todayDone = st.day && st.day.d === V40.today() ? st.day.keys.length : 0;
    const remaining = Math.max(0, totalProj - (playedAll - todayDone));   // conta a partir do começo de hoje
    let days = end ? Math.max(1, V40.daysBetween(V40.today(), end) - 1) : 365;  // de hoje até 2 dias antes do fim
    const perDay = Math.ceil(remaining / days);
    const copa1 = end ? V40.addDays(end, -1) : null;
    return { end, projN, totalProj, remaining, days, perDay, copa1, copa2: end };
  };
  // ⚽ limite por dia: 1 rodada (metade dos times) — ou mais, se for preciso pra acabar junto com a lista
  V40.ligaDaily = function (teams) {
    const st = l4();
    const n = (teams || V40.ligaTeams()).length;
    const rodada = Math.max(1, Math.floor(n / 2));
    let pace = null;
    try { pace = V40.ligaPace(teams); } catch (e) {}
    const size = Math.max(rodada, pace ? pace.perDay : 0);
    const today = st.day && st.day.d === V40.today() ? st.day.keys.length : 0;
    return { size, rodada, pace, done: Math.min(today, size), left: Math.max(0, size - today) };
  };
  function l4Undo() {
    const st = l4();
    const k = st.log.pop();
    if (!k) return;
    delete st.res[k];
    if (st.day && st.day.d === V40.today()) { const i = st.day.keys.lastIndexOf(k); if (i >= 0) st.day.keys.splice(i, 1); }
    const ymNow = V40.today().slice(0, 7);
    if (st.months && st.months[ymNow]) st.months[ymNow]--;
    st.narr = '';
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
    if (!table.length) return '<div class="stat-card"><p>Ninguém em campo ainda. Conclua um filme ou uma temporada e ele entra no campeonato.</p></div>';
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
        <div class="v40-legend"><span><i class="zc"></i>1º ao ${V40.libSlots(table.length)}º: Copa do Infinito${V40.libSlots(table.length) < 32 ? ` (cada time novo abre mais 1 vaga, até 32)` : ''}</span></div>
        <p class="v40-muted" style="margin:6px 0 0;">Vitória 3 · empate 1 · derrota 0. Desempate: vitórias ▸ aproveitamento ▸ ordem alfabética. Cada temporada é um time; só entra o que você concluiu. ⚡ Clássico = mesma franquia ou mesma série. ▲▼ = desde a rodada anterior.</p>
      </div>
      <button class="big-action v40-share-btn" id="v40ShareLiga">📤 Compartilhar a tabela como imagem</button>`;
  }
  function l4GamesHtml(teams, prog) {
    const st = l4();
    const by = {};
    teams.forEach(t => { by[t.pid] = t; });
    const daily = V40.ligaDaily(teams);
    const tieTitle = V40.ligaTitleTie(V40.ligaStandings(teams), prog);
    const m = teams.length >= 2 && daily.left > 0 ? nextMatch(teams) : null;
    const last = st.log.slice(-12).reverse().map(k => {
      const [a, b] = k.split('§');
      const A = by[a], B = by[b];
      if (!A || !B) return '';
      const r = st.res[k];
      const res = r === 'd' ? 'empate' : (r === 'a' ? 'venceu ' + V40.esc(A.name) : 'venceu ' + V40.esc(B.name));
      return `<div class="v40-row"><span style="flex:1">${V40.isClassic(A, B) ? `<small class="v40-classic-tag" style="--c1:${A.franchise.c[0]};--c2:${A.franchise.c[1]}">${A.franchise.emoji} clássico</small> ` : ''}${A.icon} ${V40.esc(A.name)} <b>×</b> ${B.icon} ${V40.esc(B.name)}<br><small class="v40-muted">${res}</small></span></div>`;
    }).join('');
    const extraHtml = tieTitle ? `<div class="stat-card v40-champ-card"><h4>🏆 Jogo extra pelo título</h4>
        <p class="v40-muted">O campeonato acabou com ${tieTitle.length} times empatados em tudo na liderança. ${tieTitle.length === 2 ? 'Toque no campeão (sem empate):' : 'Escolha o campeão:'}</p>
        <div class="${tieTitle.length === 2 ? 'v40-l4-match' : 'v40-l4-many'}">${tieTitle.map((t, k) => (k === 1 && tieTitle.length === 2 ? '<div class="v40-vs">VS</div>' : '') + teamCard(t, `data-l4extra="${V40.esc(t.pid)}"`)).join('')}</div></div>` : '';
    const narr = st.narr ? `<div class="v40-narr">📣 ${V40.esc(st.narr)}</div>` : '';
    const pc = daily.pace;
    const dailyBar = `<div class="v40-daily"><span>📅 Jogos de hoje: <b>${daily.done}/${daily.size}</b>${daily.size > daily.rodada ? ` <small class="v40-muted">(${Math.round(daily.size / daily.rodada * 10) / 10} rodadas)</small>` : ''}</span><div class="v40-l4-bar"><i style="width:${daily.done / daily.size * 100}%"></i></div>${pc && pc.end ? `<small class="v40-muted">🎯 Pra acabar junto com a lista (${V40.fmtBR(pc.end, true)}): ~${pc.perDay} jogos/dia · faltam ~${pc.remaining} jogos contando os ${pc.projN} times do fim</small>` : ''}</div>`;
    const finished = prog.played >= prog.total;
    return `${extraHtml}
      <div class="stat-card">
        <h4>⚽ Jogo ${Math.min(prog.played + 1, prog.total)} de ${prog.total}</h4>
        ${narr}${finished ? '' : dailyBar}
        ${!m && !finished && teams.length >= 2 ? `<div class="v40-daydone">✅ <b>Rodada de hoje completa!</b><br><span class="v40-muted">Limite de hoje: ${daily.size} jogos (1 rodada${daily.size > daily.rodada ? ', ou mais pra acabar junto com a lista' : ''}). Volta amanhã.</span></div><button id="v40L4Undo" ${st.log.length ? '' : 'disabled'}>↺ Desfazer último</button>` : ''}
        ${m ? `${V40.isClassic(m[0], m[1]) ? classicBanner(m[0].franchise) : ''}<p class="v40-muted" style="margin-top:-4px;">Toque no vencedor, ou no = pra empate.</p>
        <div class="v40-l4-match${V40.isClassic(m[0], m[1]) ? ' classic' : ''}" ${V40.isClassic(m[0], m[1]) ? `style="--c1:${m[0].franchise.c[0]};--c2:${m[0].franchise.c[1]}"` : ''}>
          ${teamCard(m[0], `data-l4="a" data-ta="${V40.esc(m[0].pid)}" data-tb="${V40.esc(m[1].pid)}"`)}
          <button class="v40-l4-draw" data-l4="d" data-ta="${V40.esc(m[0].pid)}" data-tb="${V40.esc(m[1].pid)}">=</button>
          ${teamCard(m[1], `data-l4="b" data-ta="${V40.esc(m[0].pid)}" data-tb="${V40.esc(m[1].pid)}"`)}
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
          <button id="v40L4Skip" data-k="${V40.esc(pairKey(m[0].pid, m[1].pid))}">⏭ Pular este jogo</button>
          <button id="v40L4Undo" ${st.log.length ? '' : 'disabled'}>↺ Desfazer último</button>
        </div>` : (teams.length < 2 ? '<p>Precisa de pelo menos 2 times em campo.</p>' : !finished ? '' : `<p>🎉 Todos os jogos foram disputados! Hora da <button class="v40-link" data-goto="mata">♾️ Copa do Infinito ›</button></p><button id="v40L4Undo" ${st.log.length ? '' : 'disabled'}>↺ Desfazer último</button>`)}
        <div class="v40-l4-bar" style="margin-top:10px;"><i style="width:${prog.played / Math.max(1, prog.total) * 100}%"></i></div>
        <p class="v40-muted">Rodada ${prog.rodada} · ${prog.n} times · cada time enfrenta todos os outros uma vez. Quem jogou menos entra em campo primeiro. Limite por dia: 1 rodada (metade dos times), ou o necessário pra acabar junto com a lista. Time novo (temporada ou filme que você concluir) entra com 0 pontos e os jogos dele vão aparecendo.</p>
      </div>
      ${last ? `<div class="stat-card"><h4>🗒 Últimos resultados</h4>${last}</div>` : ''}`;
  }
  // ---------- 📊 números do campeonato ----------
  V40.ligaStats = function (teams) {
    teams = teams || V40.ligaTeams();
    const st = l4();
    const by = {};
    teams.forEach(t => { by[t.pid] = { t, seq: [] }; });
    let classics = 0;
    const fr = {};
    st.log.forEach(k => {
      const r = st.res[k];
      if (!r) return;
      const [a, b] = k.split('§');
      const A = by[a], B = by[b];
      if (!A || !B) return;
      A.seq.push(r === 'd' ? 'E' : r === 'a' ? 'V' : 'D');
      B.seq.push(r === 'd' ? 'E' : r === 'b' ? 'V' : 'D');
      if (V40.isClassic(A.t, B.t)) {
        classics++;
        const f = A.t.franchise;
        fr[f.id] = fr[f.id] || { f, n: 0, d: 0 };
        fr[f.id].n++; if (r === 'd') fr[f.id].d++;
      }
    });
    const runs = seq => {
      let w = 0, bw = 0, u = 0, bu = 0;
      seq.forEach(x => { w = x === 'V' ? w + 1 : 0; u = x !== 'D' ? u + 1 : 0; bw = Math.max(bw, w); bu = Math.max(bu, u); });
      return { bw, bu };
    };
    const rows = Object.values(by).map(x => Object.assign({ t: x.t }, runs(x.seq), { V: x.seq.filter(c => c === 'V').length, E: x.seq.filter(c => c === 'E').length, D: x.seq.filter(c => c === 'D').length, J: x.seq.length }));
    const top = (key, min) => rows.filter(r => r.J >= (min || 1) && r[key] > 0).sort((p, q) => (q[key] - p[key]) || p.t.name.localeCompare(q.t.name))[0] || null;
    return {
      classics, franchises: Object.values(fr).sort((p, q) => q.n - p.n),
      winStreak: top('bw'), unbeaten: top('bu'), mostWins: top('V'), mostDraws: top('E'), mostLosses: top('D'),
      invictos: rows.filter(r => r.J >= 5 && r.D === 0).map(r => r.t),
      played: st.log.filter(k => st.res[k]).length
    };
  };
  function numbersHtml(teams, table, prog) {
    const S = V40.ligaStats(teams);
    const card = (ic, label, r, val) => `<div class="v40-num"><span class="ic">${ic}</span><div><small>${label}</small><b>${r ? `${r.t.icon} ${V40.esc(r.t.name)}` : '—'}</b>${r ? `<small class="v40-muted">${val(r)}</small>` : ''}</div></div>`;
    // rei de cada franquia: o time da franquia mais bem colocado
    const kings = {};
    table.forEach(t => { if (!t.franchise || t.franchise.id.indexOf('serie:') === 0) return; const id = t.franchise.id; (kings[id] = kings[id] || { f: t.franchise, list: [] }).list.push(t); });
    const kingRows = Object.values(kings).filter(k => k.list.length >= 2).sort((p, q) => p.list[0].pos - q.list[0].pos);
    const champs = V40.get('liga4-campeoes', []);
    return `
      <div class="stat-card"><h4>📊 Números da Liga do Multiverso</h4>
        <div class="v40-nums">
          ${card('🔥', 'Maior sequência de vitórias', S.winStreak, r => r.bw + ' seguidas')}
          ${card('🛡️', 'Maior invencibilidade', S.unbeaten, r => r.bu + ' jogos sem perder')}
          ${card('🏅', 'Mais vitórias', S.mostWins, r => r.V + ' vitórias')}
          ${card('🤝', 'Rei do empate', S.mostDraws, r => r.E + ' empates')}
          ${card('🪦', 'Saco de pancadas', S.mostLosses, r => r.D + ' derrotas')}
          <div class="v40-num"><span class="ic">⚡</span><div><small>Clássicos disputados</small><b>${S.classics}</b><small class="v40-muted">${prog.played} jogos no total</small></div></div>
        </div>
        ${S.invictos.length ? `<p class="v40-muted" style="margin:8px 0 0;">🛡️ Invictos (5+ jogos, nenhuma derrota): ${S.invictos.map(t => V40.esc(t.name)).join(' · ')}</p>` : ''}
      </div>
      ${S.franchises.length ? `<div class="stat-card"><h4>⚡ Clássicos por franquia</h4>${S.franchises.map(x => `<div class="v40-row"><span style="flex:1"><small class="v40-classic-tag" style="--c1:${x.f.c[0]};--c2:${x.f.c[1]}">${x.f.emoji}</small> ${V40.esc(x.f.name)}</span><span class="v40-muted">${x.n} jogo(s)${x.d ? ` · ${x.d} empate(s)` : ''}</span></div>`).join('')}</div>` : ''}
      ${kingRows.length ? `<div class="stat-card"><h4>👑 Rei de cada franquia</h4><p class="v40-muted" style="margin-top:-4px;">O mais bem colocado de cada franquia na tabela.</p>${kingRows.map(k => `<div class="v40-row"><span style="flex:1">${k.f.emoji} <b>${V40.esc(k.list[0].name)}</b> <small class="v40-muted">${V40.esc(k.f.name.replace('Clássico ', ''))}</small></span><span class="v40-muted">${k.list[0].pos}º · ${k.list[0].P} pts</span></div>`).join('')}</div>` : ''}
      ${galleryHtml(champs)}`;
  }
  // 🧤 galeria das Manoplas (campeões da Copa do Infinito)
  function galleryHtml(champs) {
    if (!champs.length) return '<div class="stat-card"><h4>🧤 Galeria das Manoplas</h4><p class="v40-muted">Os campeões da Copa do Infinito aparecem aqui, edição por edição.</p></div>';
    const all = V40.ligaTeams();
    return `<div class="stat-card"><h4>🧤 Galeria das Manoplas</h4><div class="v40-gallery">${champs.slice().reverse().map(c => {
      const t = all.find(x => x.pid === c.pid);
      return `<div class="v40-gal">${t && t.poster ? `<img src="${t.poster}" alt="" onerror="this.remove()">` : `<span class="ph">${t ? t.icon : '🏆'}</span>`}<b>${V40.esc(c.name)}</b><small>Edição ${c.n} · ${V40.fmtBR((c.at || '').slice(0, 10), true)}</small></div>`;
    }).join('')}</div></div>`;
  }

  // ---------- 🏆 Copa do Infinito ----------
  // vagas: 8 com até 51 times; cada time a mais abre 1 vaga, até parar em 32.
  // Com 32: fase de grupos (8 grupos de 4, todos contra todos no grupo, pode empatar) → os 2
  // primeiros de cada grupo vão pras oitavas. Com 8 a 31: mata-mata direto; quando não fecha
  // 8/16/32, os melhores colocados passam direto da 1ª fase (como bye).
  const LIB_KEY = 'liga4-liberta';
  V40.libSlots = n => Math.max(0, Math.min(32, n <= 51 ? Math.min(8, n) : 8 + (n - 51)));
  const GROUP_NAMES = 'ABCDEFGH';
  const GROUP_PAIRS = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];
  function koRoundName(size) {
    if (size === 2) return 'Final';
    if (size === 4) return 'Semifinal';
    if (size === 8) return 'Quartas de final';
    if (size === 16) return 'Oitavas de final';
    return 'Fase de ' + size;
  }
  function seedOrderN(size) {
    let order = [1];
    while (order.length < size) { const n = order.length * 2 + 1; order = order.reduce((acc, s) => acc.concat([s, n - s]), []); }
    return order;
  }
  function libGroups(ed) {
    // potes: 1–8, 9–16, 17–24, 25–32 (um de cada pote por grupo)
    return Array.from({ length: 8 }, (_, g) => [ed.seeds[g], ed.seeds[15 - g], ed.seeds[16 + g], ed.seeds[31 - g]]);
  }
  function groupTable(ed, g, members) {
    const rows = members.map((pid, k) => ({ pid, k, J: 0, V: 0, E: 0, D: 0, P: 0, seed: ed.seeds.indexOf(pid) }));
    GROUP_PAIRS.forEach(([x, y], m) => {
      const r = ed.res['g' + g + '_' + m];
      if (!r) return;
      const A = rows[x], B = rows[y];
      A.J++; B.J++;
      if (r === 'd') { A.E++; B.E++; A.P++; B.P++; } else if (r === 'a') { A.V++; B.D++; A.P += 3; } else { B.V++; A.D++; B.P += 3; }
    });
    return rows.sort((a, b) => (b.P - a.P) || (b.V - a.V) || (a.seed - b.seed));
  }
  // resolve tudo a partir dos resultados: lista de jogos {key, a, b, label, phase, w, done, played, draw}
  function libSolve(ed) {
    const res = ed.res || {};
    const out = { games: [], groups: null, champion: null };
    let slots;
    if (ed.format === 'groups') {
      const groups = libGroups(ed);
      out.groups = groups.map((members, g) => {
        GROUP_PAIRS.forEach(([x, y], m) => {
          const key = 'g' + g + '_' + m;
          out.games.push({ key, a: members[x], b: members[y], label: `Grupo ${GROUP_NAMES[g]} · rodada ${Math.floor(m / 2) + 1}`, phase: 'grupos', draw: true, w: res[key] ? (res[key] === 'a' ? members[x] : res[key] === 'b' ? members[y] : null) : undefined, done: !!res[key], played: !!res[key], order: Math.floor(m / 2) * 100 + g * 2 + (m % 2) });
        });
        return { g, members, table: groupTable(ed, g, members) };
      });
      out.games.sort((p, q) => p.order - q.order);
      const groupsDone = out.games.every(x => x.done);
      // oitavas: 1A×2B, 1C×2D, 1E×2F, 1G×2H, 1B×2A, 1D×2C, 1F×2E, 1H×2G
      const pos = (g, k) => groupsDone ? out.groups[g].table[k].pid : undefined;
      slots = [];
      [[0, 1], [2, 3], [4, 5], [6, 7], [1, 0], [3, 2], [5, 4], [7, 6]].forEach(([g1, g2]) => { slots.push(pos(g1, 0), pos(g2, 1)); });
    } else {
      const N = ed.seeds.length;
      let size = 2; while (size < N) size *= 2;
      slots = seedOrderN(size).map(s => (s <= N ? ed.seeds[s - 1] : null));
    }
    // mata-mata
    let round = [];
    for (let i = 0; i < slots.length; i += 2) round.push([slots[i], slots[i + 1]]);
    let size = slots.length, r = 0;
    while (round.length) {
      const winners = [];
      round.forEach(([a, b], i) => {
        const key = 'k' + r + '_' + i;
        const g = { key, a, b, label: koRoundName(size) + (round.length > 1 ? ` · jogo ${i + 1}` : ''), phase: 'k' + size, size, draw: false, w: undefined, done: false, played: false };
        if (a !== undefined && b !== undefined) {
          if (!a || !b) { g.w = a || b || null; g.done = true; g.bye = true; }
          else if (res[key]) { g.w = res[key] === 'a' ? a : b; g.done = true; g.played = true; }
        }
        out.games.push(g);
        winners.push(g.done ? g.w : undefined);
      });
      if (round.length === 1) { const f = out.games[out.games.length - 1]; if (f.done && f.w) out.champion = f.w; break; }
      const next = [];
      for (let i = 0; i < winners.length; i += 2) next.push([winners[i], winners[i + 1]]);
      round = next; size /= 2; r++;
    }
    return out;
  }
  function libHtml(teams, table, prog) {
    const by = {};
    teams.forEach(t => { by[t.pid] = t; });
    const ed = V40.get(LIB_KEY, null);
    const champs = V40.get('liga4-campeoes', []);
    const slotsNow = V40.libSlots(teams.length);
    const nm = pid => pid && by[pid] ? `${by[pid].icon} ${V40.esc(by[pid].name)}` : (pid ? '(saiu)' : (pid === null ? '<i class="v40-muted">passa direto</i>' : '<i class="v40-muted">a definir</i>'));
    const rules = `<details class="v40-help"><summary>📜 Regulamento</summary><ol style="margin:6px 0 0 18px;padding:0;font-size:0.8rem;">
        <li>Pontos corridos, todos contra todos (1 jogo cada). Você escolhe o vencedor de cada jogo ou dá empate.</li>
        <li>Vitória 3 · empate 1 · derrota 0. Desempate: vitórias ▸ aproveitamento ▸ ordem alfabética.</li>
        <li>Cada temporada é um time (partes da mesma temporada juntam). Filme é sempre independente. Só entra o que você concluiu.</li>
        <li>⚡ Clássico: jogo entre títulos da mesma franquia ou temporadas da mesma série.</li>
        <li>Vagas na Copa do Infinito: 8 com até 51 times; cada time novo abre mais 1 vaga, até 32.</li>
        <li>Com 32 vagas: fase de grupos (8 grupos de 4, pode empatar) e os 2 primeiros de cada grupo vão pras oitavas. Com menos: mata-mata direto, e os melhores colocados passam direto da 1ª fase quando a chave não fecha.</li>
        <li>No mata-mata não tem empate.</li>
      </ol></details>`;
    if (!ed) {
      const top = table.slice(0, slotsNow);
      return `<div class="stat-card">
        <h4>♾️ Copa do Infinito — edição ${champs.length + 1}</h4>
        ${slotsNow < 2 ? `<p>Precisa de pelo menos 2 times no campeonato. Agora: ${teams.length}.</p>` : `
        <p class="v40-muted" style="margin-top:-4px;"><b>${slotsNow} vagas</b> (${teams.length} times${slotsNow < 32 ? ` · a próxima vaga abre com o ${Math.max(52, teams.length + 1)}º time` : ' · máximo'}) · ${slotsNow === 32 ? 'com fase de grupos' : 'mata-mata direto'} · ${prog.played} de ${prog.total} jogos disputados</p>
        ${top.map((t, k) => `<div class="v40-l4row lib"><span class="lpos">${k + 1}º</span><span class="lname">${t.icon} ${V40.esc(t.name)}</span><span></span><span></span><span></span><span></span><span class="lpts">${t.P}</span></div>`).join('')}
        <button class="v40-primary" id="v40LibStart" style="margin-top:10px;width:100%;">▶️ Começar a Copa do Infinito</button>
        ${prog.played < prog.total ? `<p class="v40-muted">Ainda faltam ${prog.total - prog.played} jogos dos pontos corridos — o ideal é começar quando acabarem.</p>` : ''}
        ${(() => { try { const pc = V40.ligaPace(teams); return pc.end ? `<p class="v40-muted">📅 Planejada pros 2 últimos dias da lista: <b>${V40.fmtBR(pc.copa1, true)}</b> ${slotsNow === 32 ? 'fase de grupos' : '1ª metade dos jogos'} · <b>${V40.fmtBR(pc.copa2, true)}</b> ${slotsNow === 32 ? 'oitavas até a final' : 'até a final'}.</p>` : ''; } catch (e) { return ''; } })()}`}
        ${rules}
      </div>${champs.length ? galleryHtml(champs) : ''}`;
    }
    const S = libSolve(ed);
    const cur = S.games.find(g => !g.done && g.a && g.b);
    let stage = '';
    if (S.champion) {
      stage = `<div class="stat-card v40-ko-champ"><div class="v40-champ-crown">👑</div><div class="v40-muted">CAMPEÃO DA COPA DO INFINITO · EDIÇÃO ${ed.n} · CONQUISTOU A MANOPLA 🧤</div><div class="v40-big">${nm(S.champion)}</div><div class="v40-muted">${V40.fmtBR((ed.finishedAt || V40.today()).slice(0, 10), true)}</div></div>`;
    } else if (cur) {
      const A = by[cur.a] || { name: '(saiu)', icon: '❔' }, B = by[cur.b] || { name: '(saiu)', icon: '❔' };
      const cl = V40.isClassic(by[cur.a], by[cur.b]);
      stage = `<div class="stat-card"><h4>⚔️ ${cur.label}</h4>${cl ? classicBanner(A.franchise) : ''}
        <p class="v40-muted" style="margin-top:-4px;">${cur.draw ? 'Fase de grupos: toque no vencedor ou no = pra empate.' : 'Mata-mata não tem empate: toque no vencedor.'}</p>
        <div class="v40-l4-match${cl ? ' classic' : ''}" ${cl ? `style="--c1:${A.franchise.c[0]};--c2:${A.franchise.c[1]}"` : ''}>
          ${teamCard(A, `data-lib="${cur.key}" data-side="a"`)}
          ${cur.draw ? `<button class="v40-l4-draw" data-lib="${cur.key}" data-side="d">=</button>` : '<div class="v40-vs">VS</div>'}
          ${teamCard(B, `data-lib="${cur.key}" data-side="b"`)}
        </div></div>`;
    }
    const seedTag = pid => { const k = ed.seeds.indexOf(pid); return k >= 0 ? `<small class="v40-muted">${k + 1}º</small> ` : ''; };
    const groupsHtml = S.groups ? `<div class="stat-card"><h4>🗂 Fase de grupos</h4><div class="v40-lib-groups">${S.groups.map(gr => `
        <div class="v40-lib-group"><div class="v40-ko-rname">Grupo ${GROUP_NAMES[gr.g]}</div>
        ${gr.table.map((row, k) => `<div class="v40-lib-grow ${k < 2 ? 'q' : ''}"><span>${k + 1}</span><span class="n">${nm(row.pid)}</span><span>${row.J}</span><b>${row.P}</b></div>`).join('')}</div>`).join('')}</div>
        <p class="v40-muted" style="margin:6px 0 0;">Os 2 primeiros de cada grupo (em destaque) vão pras oitavas. Colunas: jogos e pontos.</p></div>` : '';
    const koGames = S.games.filter(g => g.phase !== 'grupos');
    const phases = [...new Set(koGames.map(g => g.phase))];
    const bracket = phases.map(ph => {
      const gs = koGames.filter(g => g.phase === ph);
      return `<div class="v40-ko-round"><div class="v40-ko-rname">${koRoundName(gs[0].size)}</div>${gs.map(m => `
        <div class="v40-ko-m"><span class="${m.done && m.w && m.w === m.a ? 'win' : (m.played ? 'lose' : '')}">${m.a === undefined ? '<i class="v40-muted">a definir</i>' : seedTag(m.a) + nm(m.a)}</span>
        <span class="${m.done && m.w && m.w === m.b ? 'win' : (m.played ? 'lose' : '')}">${m.b === undefined ? '<i class="v40-muted">a definir</i>' : seedTag(m.b) + nm(m.b)}</span></div>`).join('')}</div>`;
    }).join('');
    return `${stage}${groupsHtml}
      ${S.champion ? galleryHtml(V40.get('liga4-campeoes', [])) : ''}
      <div class="stat-card"><h4>🗂 Mata-mata — edição ${ed.n} (${ed.seeds.length} times)</h4><div class="v40-ko-bracket">${bracket}</div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
          <button id="v40LibUndo" ${(ed.log || []).length ? '' : 'disabled'}>↺ Desfazer último jogo</button>
          <button id="v40LibReset" class="v40-danger">🔄 Recomeçar</button>
          ${S.champion ? '<button id="v40LibNew">▶️ Nova edição</button>' : ''}
        </div>${rules}</div>`;
  }
  function libSyncChampion(ed) {
    const S = libSolve(ed);
    const list = V40.get('liga4-campeoes', []).filter(c => c.created !== ed.created);
    if (S.champion) {
      if (!ed.champion) {
        ed.finishedAt = new Date().toISOString();
        V40.confetti(true); V40.sound('trophy');
        const t0 = V40.ligaTeams().find(x => x.pid === S.champion);
        V40.logEvent('ko-champion', { name: t0 ? t0.name : S.champion });
      }
      ed.champion = S.champion;
      const t = V40.ligaTeams().find(x => x.pid === S.champion);
      list.push({ n: ed.n, pid: S.champion, name: t ? t.name : S.champion, at: ed.finishedAt, created: ed.created });
    } else { ed.champion = null; delete ed.finishedAt; }
    V40.set('liga4-campeoes', list);
  }
  function libPick(key, side) {
    if (!V40.guard()) return;
    const ed = V40.get(LIB_KEY, null);
    if (!ed) return;
    ed.res = ed.res || {}; ed.log = ed.log || [];
    ed.res[key] = side; ed.log.push(key);
    libSyncChampion(ed);
    if (!ed.champion) V40.sound('tick');
    V40.set(LIB_KEY, ed);
    V40.renderLiga();
  }
  function libUndo() {
    const ed = V40.get(LIB_KEY, null);
    if (!ed || !(ed.log || []).length) return;
    delete ed.res[ed.log.pop()];
    libSyncChampion(ed);
    V40.set(LIB_KEY, ed);
    V40.renderLiga();
  }
  function wireL4(el) {
    el.querySelectorAll('[data-l4]').forEach(b => b.addEventListener('click', () => l4Result(b.dataset.ta, b.dataset.tb, b.dataset.l4)));
    el.querySelectorAll('[data-l4extra]').forEach(b => b.addEventListener('click', () => {
      if (!V40.guard()) return;
      const tie = V40.ligaTitleTie(V40.ligaStandings(), V40.ligaProgress());
      if (!tie) return;
      const st = l4();
      st.extra = { pids: tie.map(t => t.pid), w: b.dataset.l4extra, at: new Date().toISOString() };
      V40.set(L4_KEY, st);
      V40.confetti(true); V40.sound('trophy');
      V40.toast('🏆 Campeão da Liga do Multiverso decidido no jogo extra!');
      V40.renderLiga();
    }));
    const sk = document.getElementById('v40L4Skip');
    if (sk) sk.addEventListener('click', () => { skipped.add(sk.dataset.k); V40.renderLiga(); });
    const un = document.getElementById('v40L4Undo');
    if (un) un.addEventListener('click', l4Undo);
    el.querySelectorAll('[data-lib]').forEach(b => b.addEventListener('click', () => libPick(b.dataset.lib, b.dataset.side)));
    const ls = document.getElementById('v40LibStart');
    if (ls) ls.addEventListener('click', () => {
      if (!V40.guard()) return;
      const prog = V40.ligaProgress();
      if (prog.played < prog.total && !confirm(`Ainda faltam ${prog.total - prog.played} jogos dos pontos corridos. Começar a Copa do Infinito com a tabela de agora mesmo assim?`)) return;
      const table = V40.ligaStandings();
      const n = V40.libSlots(table.length);
      V40.set(LIB_KEY, { n: V40.get('liga4-campeoes', []).length + 1, created: new Date().toISOString(), seeds: table.slice(0, n).map(t => t.pid), format: n === 32 ? 'groups' : 'ko', res: {}, log: [], champion: null });
      V40.renderLiga();
    });
    const lu = document.getElementById('v40LibUndo'); if (lu) lu.addEventListener('click', libUndo);
    const lr = document.getElementById('v40LibReset');
    if (lr) lr.addEventListener('click', () => {
      const ed = V40.get(LIB_KEY, null);
      if (ed && (ed.log || []).length && !confirm('Recomeçar a Copa do Infinito do zero? Os jogos já decididos nela se perdem.')) return;
      if (ed) V40.set('liga4-campeoes', V40.get('liga4-campeoes', []).filter(c => c.created !== ed.created));
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
    const tabs = [['titulos', '📋 Tabela'], ['jogos', '⚽ Jogos'], ['mata', '♾️ Copa do Infinito'], ['numeros', '📊 Números'], ['herois', '🦸 Heróis'], ['fases', '🗂 Por fase'], ['duelo', '🥊 Duelo'], ['historico', '📈 Histórico']];
    let body = '';
    if (V40.ligaTab === 'titulos') body = l4TableHtml(table, prog, hist4);
    else if (V40.ligaTab === 'jogos') body = l4GamesHtml(teams, prog);
    else if (V40.ligaTab === 'herois') body = heroesHtml(heroRows, hist);
    else if (V40.ligaTab === 'mata') body = libHtml(teams, table, prog);
    else if (V40.ligaTab === 'numeros') body = numbersHtml(teams, table, prog);
    else if (V40.ligaTab === 'fases') body = phasesHtml(all);
    else if (V40.ligaTab === 'duelo') body = duelHtml(all);
    else body = historyHtml(heroRows, hist);
    el.innerHTML = `
      <h2 class="v40-page-title">🥇 Liga do Multiverso</h2>
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
    ctx.fillText('LIGA DO MULTIVERSO 🥇', W / 2, 120);
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
          await navigator.share({ files: [file], title: 'Liga do Multiverso' });
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
