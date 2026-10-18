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

  // ---------- render da aba ----------
  V40.renderLiga = function () {
    const el = document.getElementById('tabLiga');
    if (!el) return;
    const all = V40.participants();
    const table = V40.leagueTable(all);
    const heroRows = V40.heroLeague();
    const hist = recordHistory(table, heroRows);
    const rodada = V40.rodada(all);
    const tabs = [['titulos', '📋 Títulos'], ['herois', '🦸 Heróis'], ['mata', '🏆 Mata-mata'], ['fases', '🗂 Por fase'], ['duelo', '🥊 Duelo'], ['historico', '📈 Histórico']];
    let body = '';
    if (V40.ligaTab === 'titulos') body = titlesHtml(all, table, hist);
    else if (V40.ligaTab === 'herois') body = heroesHtml(heroRows, hist);
    else if (V40.ligaTab === 'mata') body = knockoutHtml(all);
    else if (V40.ligaTab === 'fases') body = phasesHtml(all);
    else if (V40.ligaTab === 'duelo') body = duelHtml(all);
    else body = historyHtml(heroRows, hist);
    el.innerHTML = `
      <h2 class="v40-page-title">🥇 Liga UCM</h2>
      <p class="v40-muted" style="margin-top:-6px;">Rodada <b>${rodada}</b> · ${all.length} participantes · a nota exata é a pontuação (9,8 fica à frente de 9,6)</p>
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
      ctx.fillText(V40.fmt1(p.pts), 900, y);
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
