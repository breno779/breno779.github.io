/* =====================================================================
 * UCM Watchlist — v40.8.8 — 🌀 Super Mundial do Multiverso da Loucura
 *  Reúne os campeões de todas as competições:
 *   🏅 campeão da Liga do Multiverso · ♾️ campeão da Copa do Infinito ·
 *   🏆 campeão da Copa dos Campeões (o melhor episódio)
 *  + 1 convidado (o melhor colocado da Liga que ainda não está no Mundial) → 4 times.
 *  Semifinais e final em jogo único (empate: prorrogação e pênaltis), simulado no futebol.
 * ===================================================================== */
(function () {
  'use strict';
  const V40 = window.V40;
  const KEY = 'mundial';

  // quem já garantiu vaga (e quem ainda falta)
  function slots() {
    const teams = V40.ligaTeams ? V40.ligaTeams() : [];
    const by = {}; teams.forEach(t => { by[t.pid] = t; });
    const out = [];
    // 🏅 Liga do Multiverso: só quando todos os jogos acabaram
    let table = [], ligaDone = false;
    try {
      const prog = V40.ligaProgress(teams);
      table = V40.ligaStandings(teams);
      ligaDone = prog.total > 0 && prog.played >= prog.total;
    } catch (e) {}
    out.push({ id: 'liga', label: '🏅 Campeão da Liga do Multiverso', team: ligaDone && table[0] ? table[0] : null });
    // ♾️ Copa do Infinito
    const lib = V40.get('liga4-liberta', null);
    out.push({ id: 'copa', label: '♾️ Campeão da Copa do Infinito', team: lib && lib.champion && by[lib.champion] ? by[lib.champion] : null });
    // 🏆 Copa dos Campeões (episódios)
    const ec = V40.get('eps-copa', null);
    // o episódio campeão não joga sozinho: quem entra é a TEMPORADA dele (time da Liga do Multiverso)
    let epT = null, epName = null;
    if (ec && ec.champion) {
      const info = (ec.info || []).find(c => c.pid === ec.champion);
      epName = info ? info.name : ec.champion;
      const p = String(ec.champion).split(':'), key = p[1], e = +p[2];
      epT = teams.find(t => t.kind === 'serie' && (t.units || []).some(u => u.it && u.it.key === key && e >= (u.from || 0) && (u.to == null || e < u.to))) || null;
    }
    out.push({ id: 'eps', label: '🏆 Temporada do melhor episódio (Copa dos Campeões)', team: epT, note: epName ? `melhor episódio: ${epName}${epT ? '' : ' — a temporada dele ainda não está completa na Liga'}` : null });
    // 🎟️ convidado: melhor da Liga que ainda não está
    // 🎟️ convidados: completam as 4 vagas com os melhores da Liga que ainda não estão
    // (se um time ganhou duas competições, ele ocupa uma vaga só e entra mais um convidado)
    if (ligaDone && out.every(x => x.team)) {
      const seen = new Set();
      out.forEach(x => { if (seen.has(x.team.pid)) { x.dup = true; } seen.add(x.team.pid); });
      const uniq = out.filter(x => !x.dup);
      let gi = 1;
      while (uniq.length < 4) {
        const g = table.find(t => !seen.has(t.pid));
        if (!g) break;
        seen.add(g.pid);
        const slot = { id: 'guest' + gi, label: `🎟️ Convidado${gi > 1 ? ' ' + gi : ''} (melhor da Liga que ainda não está)`, team: g };
        out.push(slot); uniq.push(slot); gi++;
      }
    } else out.push({ id: 'guest1', label: '🎟️ Convidado (melhor da Liga que ainda não está)', team: null });
    return out;
  }
  V40.mundialSlots = slots;

  // força e elenco de cada participante (episódio ou time da Liga)
  const epParse = pid => { const p = String(pid).split(':'); const it = items.find(i => i.key === p[1]); return it ? { it, e: +p[2] } : null; };
  function strength(t) {
    if (t.ep) { const x = epParse(t.pid); const r = x && Array.isArray(x.it.epRatings) ? x.it.epRatings[x.e] : null; return typeof r === 'number' ? r : null; }
    return V40.teamStrength(t);
  }
  function castDesc(t) {
    if (t.ep) { const x = epParse(t.pid); if (!x) return null; const code = V40.epCodeFor ? V40.epCodeFor(x.it, x.e) : null; const m = code && /T(\d+)E(\d+)/.exec(code); return m ? { type: 'ep', it: x.it, s: +m[1], n: +m[2] } : null; }
    return V40.teamCastDesc(t);
  }

  function solve(ed) {
    const g = [
      { key: 'sf1', label: 'Semifinal 1', a: ed.seeds[0], b: ed.seeds[3] },
      { key: 'sf2', label: 'Semifinal 2', a: ed.seeds[1], b: ed.seeds[2] }
    ];
    const w = k => ed.res[k] ? (ed.res[k] === 'a' ? g.find(x => x.key === k).a : g.find(x => x.key === k).b) : undefined;
    g.push({ key: 'final', label: '🏆 Grande Final', a: w('sf1'), b: w('sf2') });
    g.forEach(x => { x.done = !!ed.res[x.key]; x.w = x.done ? (ed.res[x.key] === 'a' ? x.a : x.b) : null; });
    const fin = g[2];
    return { games: g, champion: fin.done ? fin.w : null, cur: g.find(x => !x.done && x.a && x.b) || null };
  }

  V40.mundialHtml = function () {
    const sl = slots();
    const ed = V40.get(KEY, null);
    const ready = sl.filter(s => s.team && !s.dup).length >= 4;
    const rules = `<details class="v40-help"><summary>📜 Regulamento</summary><ol style="margin:6px 0 0 18px;padding:0;font-size:0.8rem;">
      <li>Jogam os campeões de todas as competições: Liga do Multiverso, Copa do Infinito e a <b>temporada</b> do melhor episódio (campeão da Copa dos Campeões). Episódio sozinho não joga: quem representa é a temporada dele.</li>
      <li>A 4ª vaga é de um convidado: o melhor colocado da Liga do Multiverso que ainda não está no Mundial (se um time ocupa duas vagas, entra mais um convidado).</li>
      <li>Semifinais (1º × 4º e 2º × 3º, na ordem das vagas) e Grande Final, em jogo único. Empate: prorrogação e pênaltis.</li>
      <li>Simulação de futebol: a nota é a força de cada time e os personagens são os jogadores.</li>
      <li>Marcado pro último dia da lista (e precisa que as 3 competições tenham campeão).</li></ol></details>`;
    const slotRows = sl.map(s => `<div class="v40-row"><span style="flex:1">${s.label}<br><small class="${s.team ? '' : 'v40-muted'}">${s.team ? `${s.team.icon || ''} <b>${V40.esc(s.team.name)}</b>${s.dup ? ' <i class="v40-muted">(já classificado em outra vaga)</i>' : ''}` : '⏳ ainda não definido'}</small>${s.note ? `<br><small class="v40-muted">${V40.esc(s.note)}</small>` : ''}</span></div>`).join('');
    let body = '';
    if (!ed) {
      body = `<div class="stat-card"><h4>🎫 Vagas</h4>${slotRows}
        ${(() => { const f = V40.finals && V40.finals(); const early = f && V40.today() < f.mundial; return ready && !early ? `<button class="v40-primary" id="v40MunStart" style="margin-top:10px;width:100%;">🌀 Começar o Super Mundial</button>` : `<p class="v40-muted" style="margin-top:8px;">${f ? `📅 Marcado pro último dia da lista: <b>${V40.fmtBR(f.mundial, true)}</b>.` : ''} ${ready ? '' : 'Precisa que as 3 competições tenham campeão.'}</p>`; })()}
        ${V40.finalsHtml ? V40.finalsHtml('mundial') : ''}</div>`;
    } else {
      const S = solve(ed);
      const all = {}; (ed.teams || []).forEach(t => { all[t.pid] = t; });
      const nm = pid => pid && all[pid] ? `${all[pid].icon || ''} ${V40.esc(all[pid].name)}` : '<i class="v40-muted">a definir</i>';
      const champ = S.champion ? `<div class="stat-card v40-champ-card" style="text-align:center;"><h4>🌀 Campeão do Multiverso da Loucura</h4><div style="font-size:1.3rem;font-weight:800;">${nm(S.champion)}</div><p class="v40-muted">Edição ${ed.n} · ${V40.fmtBR ? V40.fmtBR(ed.finishedAt || V40.today(), true) : ''}</p></div>` : '';
      const ls = ed.lastSim && ed.res[ed.lastSim.key] && all[ed.lastSim.a] && all[ed.lastSim.b] ? `<div class="v40-narr">📣 ${V40.esc(V40.futNarr(ed.lastSim.s, all[ed.lastSim.a], all[ed.lastSim.b]))}</div>${V40.futBoardHtml(ed.lastSim.s, all[ed.lastSim.a], all[ed.lastSim.b])}` : '';
      const cur = S.cur;
      const card = cur ? `<div class="stat-card"><h4>⚔️ ${cur.label}</h4><p style="text-align:center;font-weight:700;">${nm(cur.a)} <span class="v40-muted">×</span> ${nm(cur.b)}</p>
        <div class="v40-fut-btns"><button class="v40-primary" id="v40MunSim">▶️ Simular jogo</button><button id="v40MunSimQ">⚡ Direto pro resultado</button></div>
        <div style="display:flex;gap:8px;margin-top:10px;"><button id="v40MunUndo" ${ed.log.length ? '' : 'disabled'}>↺ Desfazer último</button></div>
        ${ls ? `<details class="v40-help" style="margin-top:10px;"><summary>⚽ Último jogo</summary>${ls}</details>` : ''}</div>` : (S.champion ? `<div class="stat-card">${ls}<div style="display:flex;gap:8px;flex-wrap:wrap;"><button id="v40MunUndo">↺ Desfazer último</button><button id="v40MunReset">🔄 Nova edição</button></div></div>` : '');
      const bracket = `<div class="stat-card"><h4>🗺 Chave</h4><div class="v40-ko-bracket">${['Semifinais', 'Final'].map((rn, i) => `<div class="v40-ko-round"><div class="v40-ko-rname">${rn}</div>${S.games.filter(g => (i === 0) === g.key.startsWith('sf')).map(g => `<div class="v40-ko-m">${(ed.score || {})[g.key] ? `<small class="v40-fut-sc">${V40.futTxt(ed.score[g.key])} ${all[g.a] && all[g.b] ? V40.futReplayBtn('mun|' + ed.n + '|' + g.key, all[g.a], all[g.b], ed.score[g.key], ed.res[g.key]) : ''}</small>` : ''}<span class="${g.done && g.w === g.a ? 'win' : (g.done ? 'lose' : '')}">${nm(g.a)}</span><span class="${g.done && g.w === g.b ? 'win' : (g.done ? 'lose' : '')}">${nm(g.b)}</span></div>`).join('')}</div>`).join('')}</div></div>`;
      body = champ + card + bracket + V40.futScorersHtml(S.games.filter(g => g.done && g.a && g.b).map(g => ({ id: 'mun|' + ed.n + '|' + g.key, A: all[g.a], B: all[g.b], sc: (ed.score || {})[g.key], r: ed.res[g.key] })), `Artilheiros do Super Mundial · edição ${ed.n}`);
    }
    const hist = V40.get('mundial-campeoes', []);
    const histHtml = hist.length ? `<div class="stat-card"><h4>🏛 Campeões do Mundial</h4>${hist.slice().reverse().map(h => `<div class="v40-row"><span style="flex:1">${h.icon || ''} <b>${V40.esc(h.name)}</b><br><small class="v40-muted">edição ${h.n} · ${h.d ? h.d.split('-').reverse().join('/') : ''}</small></span></div>`).join('')}</div>` : '';
    return `<div class="stat-card"><h4>🌀 Super Mundial do Multiverso da Loucura</h4><p class="v40-muted" style="margin:0 0 6px;">Os campeões de todas as competições num mata-mata só.</p>${rules}</div>${body}${histHtml}`;
  };

  async function play(watch, btn) {
    if (V40.guard && !V40.guard()) return;
    const ed = V40.get(KEY, null);
    if (!ed) return;
    const S = solve(ed);
    const cur = S.cur;
    if (!cur) return;
    const all = {}; (ed.teams || []).forEach(t => { all[t.pid] = t; });
    const A = all[cur.a], B = all[cur.b];
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Escalando os times…'; }
    const [la, lb] = await V40.futPrepare(cur.a, castDesc(A), cur.b, castDesc(B));
    const sm = V40.futSim(strength(A), strength(B), true, la, lb);
    const ed2 = V40.get(KEY, null);
    ed2.res[cur.key] = sm.w; ed2.log.push(cur.key);
    ed2.score = ed2.score || {}; ed2.score[cur.key] = V40.futPack(sm);
    ed2.lastSim = { key: cur.key, a: cur.a, b: cur.b, s: sm };
    V40.futStore('mun|' + ed2.n + '|' + cur.key, sm, cur.a, cur.b);
    const S2 = solve(ed2);
    if (S2.champion && !ed2.champion) {
      ed2.champion = S2.champion; ed2.finishedAt = V40.today();
      const h = V40.get('mundial-campeoes', []);
      const c = all[S2.champion] || {};
      h.push({ n: ed2.n, pid: S2.champion, name: c.name, icon: c.icon, d: V40.today() });
      V40.set('mundial-campeoes', h);
      V40.confetti && V40.confetti(true); V40.sound && V40.sound('trophy');
    } else V40.sound && V40.sound('tick');
    V40.set(KEY, ed2);
    V40.renderLiga();
    if (watch) V40.futWatch(sm, A, B);
  }

  V40.wireMundial = function (el) {
    const st = el.querySelector('#v40MunStart');
    if (st) st.addEventListener('click', () => {
      if (V40.guard && !V40.guard()) return;
      const sl = slots();
      const ok = sl.filter(s => s.team && !s.dup);
      if (ok.length < 4) return;
      const teams = ok.slice(0, 4).map(s => ({ pid: s.team.pid, name: s.team.name, icon: s.team.icon, ep: false }));
      const n = (V40.get('mundial-campeoes', []) || []).length + 1;
      V40.set(KEY, { n, created: new Date().toISOString(), seeds: teams.map(t => t.pid), teams, res: {}, log: [], score: {}, champion: null });
      V40.renderLiga();
    });
    const s1 = el.querySelector('#v40MunSim'); if (s1) s1.addEventListener('click', () => play(true, s1));
    const s2 = el.querySelector('#v40MunSimQ'); if (s2) s2.addEventListener('click', () => play(false, s2));
    const u = el.querySelector('#v40MunUndo');
    if (u) u.addEventListener('click', () => {
      const ed = V40.get(KEY, null); if (!ed || !ed.log.length) return;
      const k = ed.log.pop(); delete ed.res[k]; if (ed.score) delete ed.score[k]; ed.lastSim = null;
      if (ed.champion) { const h = V40.get('mundial-campeoes', []).filter(x => x.n !== ed.n); V40.set('mundial-campeoes', h); ed.champion = null; delete ed.finishedAt; }
      V40.set(KEY, ed); V40.renderLiga();
    });
    const r = el.querySelector('#v40MunReset');
    if (r) r.addEventListener('click', () => { if (!confirm('Começar uma nova edição do Super Mundial? (o campeão desta continua na galeria)')) return; V40.set(KEY, null); V40.renderLiga(); });
  };
})();
