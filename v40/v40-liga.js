/* =====================================================================
 * UCM Watchlist — v40 BETA — 🥇 Liga (campeonatos)
 *  - Pontos corridos por título (nota arredondada = pontos; empate = mesma posição)
 *  - Campeonato de heróis/grupos: Filmes · Séries · Geral
 *  - Mata-mata dos títulos nota 10 (você escolhe o "verdadeiro 10")
 *  - Por fase · Duelo · Histórico de posições · Artilheiro e melhor defesa
 * ===================================================================== */
(function () {
  'use strict';
  const V40 = window.V40;

  V40.ligaTab = V40.get('liga-tab', 'titulos');

  // ---------- tabela de pontos corridos ----------
  // ordem: pontos ▸ nota exata ▸ ordem cronológica. Posição "densa": mesmo ponto = mesma posição.
  V40.leagueTable = function (list) {
    const parts = (list || V40.participants()).filter(p => p.rating > 0);
    parts.sort((a, b) => (b.pts - a.pts) || (b.rating - a.rating) || (a.order - b.order));
    let pos = 0, lastPts = null;
    parts.forEach(p => {
      if (p.pts !== lastPts) { pos++; lastPts = p.pts; }
      p.pos = pos;
    });
    return parts;
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
      r.pts = r.all.reduce((s, p) => s + p.pts, 0);
      r.tens = r.all.filter(p => p.pts === 10).length;
      r.min = r.all.length ? Math.min.apply(null, r.all.map(p => p.rating)) : null;
    });
    return rows;
  };
  V40.heroTable = function (rows, which) {
    const key = which === 'filmes' ? 'avgFilmes' : which === 'series' ? 'avgSeries' : 'avgGeral';
    const listKey = which === 'filmes' ? 'filmes' : which === 'series' ? 'series' : 'all';
    const ranked = rows.filter(r => r[key] != null).map(r => ({ r, val: r[key], n: r[listKey].length, pts: r[listKey].reduce((s, p) => s + p.pts, 0) }));
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

  // ---------- render da aba ----------
  V40.renderLiga = function () {
    const el = document.getElementById('tabLiga');
    if (!el) return;
    const all = V40.participants();
    const table = V40.leagueTable(all);
    const heroRows = V40.heroLeague();
    const hist = recordHistory(table, heroRows);
    const rodada = V40.rodada(all);
    const tabs = [['titulos', '📋 Títulos'], ['herois', '🦸 Heróis'], ['mata', '⚔️ Mata-mata 10'], ['fases', '🗂 Por fase'], ['duelo', '🥊 Duelo'], ['historico', '📈 Histórico']];
    let body = '';
    if (V40.ligaTab === 'titulos') body = titlesHtml(all, table, hist);
    else if (V40.ligaTab === 'herois') body = heroesHtml(heroRows, hist);
    else if (V40.ligaTab === 'mata') body = knockoutHtml(all);
    else if (V40.ligaTab === 'fases') body = phasesHtml(all);
    else if (V40.ligaTab === 'duelo') body = duelHtml(all);
    else body = historyHtml(heroRows, hist);
    el.innerHTML = `
      <h2 class="v40-page-title">🥇 Liga UCM</h2>
      <p class="v40-muted" style="margin-top:-6px;">Rodada <b>${rodada}</b> · ${all.length} participantes · nota arredondada vira ponto (7,5 → 8)</p>
      <div class="v40-subtabs">${tabs.map(([k, l]) => `<button data-liga="${k}" class="${V40.ligaTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div id="v40LigaBody">${body}</div>`;
    el.querySelectorAll('[data-liga]').forEach(b => b.addEventListener('click', () => {
      V40.ligaTab = b.dataset.liga; V40.set('liga-tab', V40.ligaTab); V40.renderLiga();
    }));
    wireLiga(el, all, table, heroRows);
    ensureTabReloadBtn('tabLiga');
  };

  // ---------- 📋 títulos ----------
  function zoneOf(p, maxPos) {
    if (p.pos === 1) return 'champ';
    if (p.pos === 2) return 'g';
    if (maxPos >= 4 && p.pos === maxPos) return 'z';
    return '';
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
        <span class="lpts">${p.pts}</span>
        <span class="lrat">${V40.fmt1(p.rating)}</span>
      </div>`;
    }).join('');
    return `
      <div class="stat-card v40-champ-card">
        <div class="v40-champ-crown">🏆</div>
        <div><b>${champs.length === 1 ? 'Campeão' : champs.length + ' campeões empatados'}</b> com ${champs[0].pts} pontos</div>
        <div class="v40-muted">${champs.slice(0, 6).map(p => V40.esc(p.name)).join(' · ')}${champs.length > 6 ? ' …' : ''}</div>
        ${champs.length > 1 && champs[0].pts === 10 ? '<button class="v40-link" data-goto="mata">⚔️ Decidir o verdadeiro 10 no mata-mata ›</button>' : ''}
      </div>
      <div class="stat-card">
        <h4>📋 Classificação — pontos corridos</h4>
        <div class="v40-lrow head"><span class="lpos">#</span><span class="lname">TÍTULO</span><span class="lpts">PTS</span><span class="lrat">NOTA</span></div>
        ${rows}
        <div class="v40-legend">
          <span><i class="zc"></i>Campeão(ões)</span><span><i class="zg"></i>Vice (Libertadores)</span>${maxPos >= 4 ? '<span><i class="zz"></i>Rebaixamento — talvez valha rever</span>' : ''}
        </div>
        <p class="v40-muted" style="margin:6px 0 0;">Empate de pontos = mesma posição. Dentro do empate, a ordem é pela nota exata e depois pela ordem cronológica (só exibição). ▲▼ = posições desde a rodada anterior.</p>
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
        <span class="lpts">${x.pts}</span>
        <span class="lrat">${V40.fmt1(x.val)}</span>
      </div>`).join('');
    return `
      <div class="v40-grid2">
        <div class="stat-card v40-mini">
          <h4>⚽ Artilheiro</h4>
          ${scorer ? `<div class="v40-big">${scorer.g.emoji} ${V40.esc(scorer.g.label)}</div><div class="v40-muted">${scorer.tens} título(s) nota 10 · ${scorer.pts} pts</div>` : '<div class="v40-muted">—</div>'}
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
        ${list.map(p => `<div class="v40-lrow ${p.pos === 1 ? 'champ' : ''}"><span class="lpos">${p.pos}º</span><span class="lname">${p.icon} ${V40.esc(p.name)}</span><span class="lpts">${p.pts}</span><span class="lrat">${V40.fmt1(p.rating)}</span></div>`).join('') || '<p class="v40-muted">Nada com nota nessa fase ainda.</p>'}
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
      ['🏅 Pontos', pa.pts, pb.pts, pa.pts - pb.pts],
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

  // ---------- ⚔️ mata-mata dos 10 ----------
  // participantes: títulos CONCLUÍDOS que valem 10 pontos (nota ≥ 9,5). Chave do tamanho da próxima
  // potência de 2; quem sobra, os melhores cabeças de chave (nota exata, depois ordem cronológica)
  // passam direto da 1ª rodada.
  function tens(all) {
    return all.filter(p => p.done && p.pts === 10).sort((a, b) => (b.rating - a.rating) || (a.order - b.order));
  }
  function seedOrder(size) {
    let order = [1];
    while (order.length < size) {
      const n = order.length * 2 + 1;
      order = order.reduce((acc, s) => acc.concat([s, n - s]), []);
    }
    return order;
  }
  function roundName(size) {
    if (size === 2) return 'Final';
    if (size === 4) return 'Semifinal';
    if (size === 8) return 'Quartas de final';
    if (size === 16) return 'Oitavas de final';
    return `Rodada de ${size}`;
  }
  V40.newKnockout = function (all) {
    const seeds = tens(all || V40.participants());
    if (seeds.length < 2) return null;
    let size = 1;
    while (size < seeds.length) size *= 2;
    const slots = seedOrder(size).map(s => (s <= seeds.length ? seeds[s - 1].pid : null));
    const first = [];
    for (let i = 0; i < size; i += 2) first.push({ a: slots[i], b: slots[i + 1], w: null });
    const ko = { created: new Date().toISOString(), seeds: seeds.map(p => p.pid), size, rounds: [first], champion: null, picks: [] };
    autoAdvance(ko);
    V40.set('knockout', ko);
    return ko;
  };
  function autoAdvance(ko) {
    // resolve byes e monta as rodadas seguintes conforme os vencedores saem
    for (let r = 0; r < ko.rounds.length; r++) {
      const round = ko.rounds[r];
      round.forEach(m => {
        if (m.w) return;
        if (m.a && !m.b) m.w = m.a;
        else if (m.b && !m.a) m.w = m.b;
      });
      const done = round.every(m => m.w || (!m.a && !m.b));
      if (done && round.length > 1 && !ko.rounds[r + 1]) {
        const next = [];
        for (let i = 0; i < round.length; i += 2) next.push({ a: round[i].w || null, b: round[i + 1] ? (round[i + 1].w || null) : null, w: null });
        ko.rounds.push(next);
      }
      if (done && round.length === 1) ko.champion = round[0].w;
    }
  }
  function currentMatch(ko) {
    for (let r = 0; r < ko.rounds.length; r++) {
      const i = ko.rounds[r].findIndex(m => !m.w && m.a && m.b);
      if (i >= 0) return { r, i, m: ko.rounds[r][i] };
    }
    return null;
  }
  function knockoutHtml(all) {
    const eligible = tens(all);
    let ko = V40.get('knockout', null);
    if (eligible.length < 2) {
      return `<div class="stat-card"><h4>⚔️ Mata-mata dos 10</h4><p>Precisa de pelo menos 2 títulos concluídos valendo 10 pontos (nota 9,5 a 10). Agora: ${eligible.length}.</p></div>`;
    }
    if (!ko) ko = V40.newKnockout(all);
    const byPid = {};
    all.forEach(p => { byPid[p.pid] = p; });
    const missing = eligible.filter(p => !ko.seeds.includes(p.pid));
    const gone = ko.seeds.filter(pid => !eligible.some(p => p.pid === pid));
    const nm = pid => pid && byPid[pid] ? `${byPid[pid].icon} ${V40.esc(byPid[pid].name)}` : (pid ? '(saiu da lista)' : '<i>passa direto</i>');
    const cur = currentMatch(ko);
    let stage = '';
    if (ko.champion) {
      const c = byPid[ko.champion];
      stage = `<div class="stat-card v40-ko-champ">
        <div class="v40-champ-crown">👑</div>
        <div class="v40-muted">O VERDADEIRO 10</div>
        <div class="v40-big">${nm(ko.champion)}</div>
        ${c ? `<div class="v40-muted">nota ${V40.fmt1(c.rating)} · campeão em ${V40.fmtBR((ko.finishedAt || V40.today()).slice(0, 10), true)}</div>` : ''}
      </div>`;
    } else if (cur) {
      const sizeOfRound = ko.size / Math.pow(2, cur.r);
      const pa = byPid[cur.m.a], pb = byPid[cur.m.b];
      const card = (p, side) => `<button class="v40-ko-pick" data-pick="${side}">
          ${p && V40.posterUrl && V40.posterUrl(p.items[0], 'w185') ? `<img class="v40-ko-img" src="${V40.posterUrl(p.items[0], 'w185')}" alt="">` : `<span class="ico">${p ? p.icon : '❔'}</span>`}
          <span class="nm">${p ? V40.esc(p.name) : '(saiu)'}</span>
          <span class="v40-muted">${p ? 'nota ' + V40.fmt1(p.rating) : ''}${p && p.completedAt ? ' · visto ' + V40.fmtBR(p.completedAt, true) : ''}</span>
        </button>`;
      stage = `<div class="stat-card">
        <h4>⚔️ ${roundName(sizeOfRound)} — jogo ${ko.rounds[cur.r].slice(0, cur.i + 1).filter(m => m.a && m.b).length} de ${ko.rounds[cur.r].filter(m => m.a && m.b).length}</h4>
        <p class="v40-muted" style="margin-top:-4px;">Qual dos dois é <b>mais 10</b>? Toque no vencedor.</p>
        <div class="v40-ko-match">${card(pa, 'a')}<div class="v40-vs">VS</div>${card(pb, 'b')}</div>
      </div>`;
    }
    const bracket = ko.rounds.map((round, r) => {
      const sizeOfRound = ko.size / Math.pow(2, r);
      return `<div class="v40-ko-round"><div class="v40-ko-rname">${roundName(sizeOfRound)}</div>${round.map(m => `
        <div class="v40-ko-m">
          <span class="${m.w && m.w === m.a ? 'win' : (m.w ? 'lose' : '')}">${nm(m.a)}</span>
          <span class="${m.w && m.w === m.b ? 'win' : (m.w ? 'lose' : '')}">${nm(m.b)}</span>
        </div>`).join('')}</div>`;
    }).join('');
    return `
      ${missing.length || gone.length ? `<div class="stat-card v40-warn">${missing.length ? `🆕 ${missing.length} título(s) novo(s) com 10 ficou(aram) fora deste torneio. ` : ''}${gone.length ? `${gone.length} participante(s) não vale(m) mais 10. ` : ''}<button class="v40-link" id="v40KoReset2">Recomeçar com a lista atual ›</button></div>` : ''}
      ${stage}
      <div class="stat-card">
        <h4>🗂 Chaveamento (${ko.seeds.length} participantes)</h4>
        <div class="v40-ko-bracket">${bracket}</div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
          <button id="v40KoUndo" ${ko.picks.length ? '' : 'disabled'}>↺ Desfazer último jogo</button>
          <button id="v40KoReset" class="v40-danger">🔄 Recomeçar torneio</button>
        </div>
        <p class="v40-muted">Cabeças de chave pela nota exata (e ordem cronológica). Quando o número de participantes não é 2, 4, 8, 16, 32…, os melhores cabeças passam direto da 1ª rodada.</p>
      </div>`;
  }
  function pickWinner(side) {
    if (!V40.guard()) return;
    const ko = V40.get('knockout', null);
    if (!ko) return;
    const cur = currentMatch(ko);
    if (!cur) return;
    cur.m.w = side === 'a' ? cur.m.a : cur.m.b;
    ko.picks.push({ r: cur.r, i: cur.i });
    autoAdvance(ko);
    if (ko.champion) {
      ko.finishedAt = new Date().toISOString();
      V40.confetti(true);
      V40.sound('trophy');
      V40.logEvent('ko-champion', { name: ko.champion });
    } else V40.sound('tick');
    V40.set('knockout', ko);
    V40.renderLiga();
  }
  function undoPick() {
    const ko = V40.get('knockout', null);
    if (!ko || !ko.picks.length) return;
    const last = ko.picks.pop();
    // apaga o resultado e tudo que dependia dele (rodadas seguintes são remontadas)
    ko.rounds[last.r][last.i].w = null;
    ko.rounds = ko.rounds.slice(0, last.r + 1);
    ko.champion = null; delete ko.finishedAt;
    // refaz byes e rodadas seguintes a partir dos resultados que ficaram
    autoAdvance(ko);
    // re-aplica picks posteriores não existem (eram depois do desfeito) — ok
    V40.set('knockout', ko);
    V40.renderLiga();
  }

  // ---------- imagem pra compartilhar ----------
  V40.shareLigaImage = function () {
    const table = V40.leagueTable();
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
    ctx.fillText(`Rodada ${V40.rodada()} · ${V40.fmtBR(V40.today(), true)}`, W / 2, 175);
    ctx.textAlign = 'left';
    let y = 250;
    ctx.font = 'bold 30px "Baloo 2", sans-serif';
    ctx.fillStyle = '#9a927e';
    ctx.fillText('#', 70, y); ctx.fillText('TÍTULO', 150, y); ctx.textAlign = 'right'; ctx.fillText('PTS', 900, y); ctx.fillText('NOTA', 1010, y); ctx.textAlign = 'left';
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
      ctx.fillText(V40.fmt1(p.rating), 1010, y);
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
          <div><b>${r.pts}</b><small>PONTOS</small></div>
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
    el.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => pickWinner(b.dataset.pick)));
    const undo = document.getElementById('v40KoUndo');
    if (undo) undo.addEventListener('click', undoPick);
    const reset = () => {
      if (!confirm('Recomeçar o mata-mata do zero (com os títulos nota 10 de agora)?')) return;
      V40.newKnockout(); V40.renderLiga();
    };
    const r1 = document.getElementById('v40KoReset'); if (r1) r1.addEventListener('click', reset);
    const r2 = document.getElementById('v40KoReset2'); if (r2) r2.addEventListener('click', reset);
  }
})();
