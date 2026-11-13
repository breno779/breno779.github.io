/* =====================================================================
 * UCM Watchlist — v40.8 — ⚽ Simulação de futebol pras ligas
 *  A nota vira a "força" do time: quanto maior a diferença, maior a chance de vencer — mas sem
 *  garantia (zebra existe). Placar sorteado com distribuição de Poisson (como gols de verdade),
 *  minutos dos gols, prorrogação e pênaltis no mata-mata.
 *  Usado pela Liga do Multiverso, Copa do Infinito, Liga dos Episódios e Copa dos Campeões.
 * ===================================================================== */
(function () {
  'use strict';
  const V40 = window.V40;
  const NEUTRAL = 7;          // força de quem ainda não tem nota
  const BASE = 1.3;           // gols esperados num jogo equilibrado (cada lado)
  const K = 0.36;             // peso da diferença de nota

  function poisson(l) {
    const L = Math.exp(-l);
    let k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
  }
  const lam = (ra, rb) => Math.min(4.2, Math.max(0.18, BASE * Math.exp(K * (ra - rb))));
  const mins = (n, from, to) => Array.from({ length: n }, () => from + Math.floor(Math.random() * (to - from + 1))).sort((x, y) => x - y);
  const force = r => (typeof r === 'number' && r > 0 ? r : NEUTRAL);

  // simula um jogo. ko = mata-mata (sem empate: prorrogação e pênaltis)
  V40.futSim = function (ra, rb, ko, lineA, lineB) {
    ra = force(ra); rb = force(rb);
    const la = lam(ra, rb), lb = lam(rb, ra);
    const ga = poisson(la), gb = poisson(lb);
    const ev = [];
    mins(ga, 1, 90).forEach(m => ev.push([m, 'a']));
    mins(gb, 1, 90).forEach(m => ev.push([m, 'b']));
    const s = { ga, gb, ev, ra, rb };
    if (ko && ga === gb) {
      const ea = poisson(la / 3), eb = poisson(lb / 3);
      mins(ea, 91, 120).forEach(m => ev.push([m, 'a']));
      mins(eb, 91, 120).forEach(m => ev.push([m, 'b']));
      s.et = true; s.ga += ea; s.gb += eb;
      if (s.ga === s.gb) {
        const pA = Math.min(0.92, Math.max(0.6, 0.76 + (ra - rb) * 0.012)), pB = Math.min(0.92, Math.max(0.6, 0.76 + (rb - ra) * 0.012));
        let a = 0, b = 0;
        for (let i = 0; i < 5; i++) { if (Math.random() < pA) a++; if (Math.random() < pB) b++; }
        let guard = 0;
        while (a === b && guard++ < 40) { const x = Math.random() < pA, y = Math.random() < pB; if (x !== y) { if (x) a++; else b++; } }
        if (a === b) a++;
        s.pen = [a, b];
      }
    }
    ev.sort((x, y) => x[0] - y[0]);
    // autores dos gols: sorteados na escalação (quem aparece primeiro no elenco marca mais)
    const scorer = l => { if (!l || !l.length) return null; const w = l.map((_, i) => 1 / (1 + i * 0.18)); let r = Math.random() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < l.length; i++) { r -= w[i]; if (r <= 0) return l[i]; } return l[0]; };
    ev.forEach(e => { e[2] = scorer(e[1] === 'a' ? lineA : lineB); });
    if (lineA) s.la = lineA; if (lineB) s.lb = lineB;
    s.w = s.pen ? (s.pen[0] > s.pen[1] ? 'a' : 'b') : (s.ga > s.gb ? 'a' : s.ga < s.gb ? 'b' : 'd');
    return s;
  };
  // troca os lados (pra guardar na ordem da chave do par)
  V40.futFlip = function (s) {
    if (!s) return s;
    return Object.assign({}, s, { ga: s.gb, gb: s.ga, ra: s.rb, rb: s.ra, ev: s.ev.map(([m, x, n]) => [m, x === 'a' ? 'b' : 'a', n]), la: s.lb, lb: s.la, pen: s.pen ? [s.pen[1], s.pen[0]] : undefined, w: s.w === 'd' ? 'd' : (s.w === 'a' ? 'b' : 'a') });
  };
  // placar compacto pra guardar: [gols1, gols2] ou [g1, g2, pên1, pên2]
  V40.futPack = s => (s.pen ? [s.ga, s.gb, s.pen[0], s.pen[1]] : [s.ga, s.gb]);
  V40.futTxt = function (sc) {
    if (!sc) return '';
    return `${sc[0]} × ${sc[1]}${sc.length > 2 ? ` (pên. ${sc[2]}×${sc[3]})` : ''}`;
  };
  // gols de um resultado guardado (sem placar = jogo decidido na mão: vitória 1×0, empate 0×0)
  V40.futGoals = function (score, r) {
    if (Array.isArray(score)) return [score[0], score[1]];
    return r === 'a' ? [1, 0] : r === 'b' ? [0, 1] : [0, 0];
  };
  const minTxt = m => `${m}'`;
  // placar animado com os gols (A e B: {name, icon})
  V40.futBoardHtml = function (s, A, B) {
    if (!s) return '';
    const evs = (s.ev || []).map(([m, x, n]) => `<div class="v40-fut-ev ${x}"><span>${minTxt(m)}</span> ⚽ <b>${V40.esc(n || (x === 'a' ? A : B).name)}</b>${n ? ` <small class="v40-muted">(${V40.esc((x === 'a' ? A : B).name)})</small>` : ''}</div>`).join('');
    const lu = (l, T) => l && l.length ? `<div><b>${T.icon || ''} ${V40.esc(T.name)}</b><br><span class="v40-muted">${l.map(V40.esc).join(' · ')}</span></div>` : '';
    const lineups = (s.la && s.la.length) || (s.lb && s.lb.length) ? `<details class="v40-fut-lu"><summary>👕 Escalações</summary>${lu(s.la, A)}${lu(s.lb, B)}</details>` : '';
    return `<div class="v40-fut-board">
      <div class="v40-fut-teams"><span>${A.icon || ''} ${V40.esc(A.name)}</span><b class="v40-fut-score">${s.ga} <i>×</i> ${s.gb}</b><span>${V40.esc(B.name)} ${B.icon || ''}</span></div>
      ${s.et ? `<div class="v40-muted v40-fut-note">⏱ prorrogação${s.pen ? ` · pênaltis ${s.pen[0]} × ${s.pen[1]}` : ''}</div>` : ''}
      <div class="v40-fut-evs">${evs || '<div class="v40-muted">0 × 0 — ninguém marcou.</div>'}</div>
      ${lineups}
      <div class="v40-muted v40-fut-note">força (nota): ${V40.fmt1 ? V40.fmt1(s.ra) : s.ra} × ${V40.fmt1 ? V40.fmt1(s.rb) : s.rb}</div>
    </div>`;
  };
  // frase do jogo
  V40.futNarr = function (s, A, B) {
    const nm = t => `${t.icon || ''} ${t.name}`.trim();
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const plac = `${s.ga}×${s.gb}`;
    if (s.pen) { const W = s.pen[0] > s.pen[1] ? A : B; return `🥅 Nos pênaltis! ${nm(W)} passa depois do ${plac} (${s.pen[0]}×${s.pen[1]}).`; }
    if (s.w === 'd') return s.ga === 0 ? pick([`0×0 entre ${nm(A)} e ${nm(B)}. Jogo travado.`, `Ninguém balançou a rede: ${nm(A)} 0×0 ${nm(B)}.`]) : pick([`${plac}! ${nm(A)} e ${nm(B)} empatam num jogo aberto.`, `Empate em ${plac} entre ${nm(A)} e ${nm(B)}.`]);
    const W = s.w === 'a' ? A : B, L = s.w === 'a' ? B : A;
    const wr = s.w === 'a' ? s.ra : s.rb, lr = s.w === 'a' ? s.rb : s.ra;
    const diff = Math.abs(s.ga - s.gb), tot = s.ga + s.gb;
    if (lr - wr >= 1) return pick([`🦓 Zebra! ${nm(W)} vence ${nm(L)} por ${plac}.`, `🦓 Ninguém esperava: ${nm(W)} ${plac} em cima de ${nm(L)}!`]);
    if (diff >= 3) return pick([`💥 Goleada! ${nm(W)} atropela ${nm(L)}: ${plac}.`, `${nm(W)} passeia: ${plac} sobre ${nm(L)}.`]);
    if (tot >= 5) return `🔥 Jogaço! ${nm(W)} vence ${nm(L)} por ${plac}.`;
    const late = (s.ev || []).filter(e => e[1] === s.w).pop();
    if (diff === 1 && late && late[0] >= 85) return `⏱ No finzinho! Gol aos ${late[0]}' e ${nm(W)} vence ${nm(L)} por ${plac}.`;
    return pick([`${nm(W)} vence ${nm(L)} por ${plac}.`, `${plac} pra ${nm(W)} sobre ${nm(L)}.`, `Vitória de ${nm(W)}: ${plac}.`]);
  };
  // 👕 escalação: até 11 personagens do elenco; a cada jogo pelo menos metade muda
  const LASTK = 'v40fut-last';
  function lastGet() { try { return JSON.parse(localStorage.getItem(LASTK) || '{}') || {}; } catch (e) { return {}; } }
  V40.futLineup = function (teamId, pool) {
    pool = (pool || []).slice();
    if (!pool.length) return [];
    // elenco pequeno: escala só 2/3 dele, pra sempre dar pra trocar metade no jogo seguinte
    const size = pool.length >= 17 ? 11 : Math.max(1, Math.min(11, pool.length < 3 ? pool.length : Math.floor(pool.length * 2 / 3)));
    const all = lastGet();
    const prev = (all[teamId] || []).filter(n => pool.includes(n));
    const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    // no máximo metade (arredondada pra baixo) repete do jogo anterior
    const keep = shuffle(prev.slice()).slice(0, Math.floor(size / 2));
    const fresh = shuffle(pool.filter(n => !prev.includes(n)));
    let lineup = keep.concat(fresh.slice(0, size - keep.length));
    if (lineup.length < size) lineup = lineup.concat(shuffle(prev.filter(n => !lineup.includes(n))).slice(0, size - lineup.length));
    lineup.sort((a, b) => pool.indexOf(a) - pool.indexOf(b));
    all[teamId] = lineup;
    try { const k = Object.keys(all); if (k.length > 800) delete all[k[0]]; localStorage.setItem(LASTK, JSON.stringify(all)); } catch (e) {}
    return lineup;
  };
  // busca o elenco dos dois times (com tempo limite) e já escala
  const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
  V40.futPrepare = async function (idA, descA, idB, descB) {
    const get = d => (V40.futCast && d ? withTimeout(V40.futCast(d).catch(() => []), 6000) : Promise.resolve([]));
    const [pa, pb] = await Promise.all([get(descA), get(descB)]);
    return [V40.futLineup(idA, pa || []), V40.futLineup(idB, pb || [])];
  };
  // de onde vem o elenco de um time da Liga do Multiverso
  V40.teamCastDesc = function (t) {
    if (!t || !t.items || !t.items[0]) return null;
    const it = t.items[0];
    if (t.kind === 'serie') return { type: 'season', it, season: typeof t.season === 'number' ? t.season : 1 };
    return { type: 'movie', it };
  };
  // força de um time da Liga do Multiverso: média das notas (episódios da temporada, ou nota do filme)
  V40.teamStrength = function (t) {
    if (!t || !t.units) return null;
    const vals = [];
    // filme: nota do filme · série: nota da série no geral (se já tiver), senão média dos episódios
    t.units.forEach(u => {
      const it = u.it || {};
      if (typeof it.rating === 'number' && it.rating > 0) { vals.push(it.rating); return; }
      const eps = Array.isArray(it.epRatings) ? it.epRatings.slice(u.from || 0, u.to == null ? undefined : u.to).filter(v => typeof v === 'number') : [];
      if (eps.length) vals.push(eps.reduce((a, b) => a + b, 0) / eps.length);
      else if (typeof it.rating === 'number' && it.rating > 0) vals.push(it.rating);
    });
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
})();
