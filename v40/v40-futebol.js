/* =====================================================================
 * UCM Watchlist — v40.8 — ⚽ Simulação de futebol pras ligas (com o jogo animado, tipo botão)
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
      <div style="text-align:center;margin-top:6px;">${V40.futWatchBtn ? V40.futWatchBtn(s, A, B) : ''}</div>
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
    const get = d => (V40.futCast && d ? withTimeout(V40.futCast(d).catch(() => []), 3500) : Promise.resolve([]));
    const [pa, pb] = await Promise.all([get(descA), get(descB)]);
    return [V40.futLineup(idA, pa || []), V40.futLineup(idB, pb || [])];
  };
  // 📺 ver o jogo: campinho de botão visto de cima, cada jogador um círculo (tipo "simular partida")
  const REPLAY = {};
  let replayN = 0;
  V40.futWatchBtn = function (s, A, B, small) {
    const id = 'r' + (++replayN);
    REPLAY[id] = { s, A: { name: A.name, icon: A.icon }, B: { name: B.name, icon: B.icon } };
    return small ? `<button class="v40-fut-watch sm" data-futwatch="${id}" title="Ver o jogo">📺</button>` : `<button class="v40-fut-watch" data-futwatch="${id}">📺 Ver o jogo</button>`;
  };
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-futwatch]');
    if (!b) return;
    const r = REPLAY[b.dataset.futwatch];
    if (r) V40.futWatch(r.s, r.A, r.B);
  });
  const initials = n => String(n || '?').replace(/[^A-Za-zÀ-ÿ0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
  function formation(n) {
    // linhas (sem o goleiro), do fundo pro ataque
    const out = n - 1;
    if (out <= 0) return [];
    if (out >= 10) return [4, 4, 2];
    if (out >= 7) return [3, out - 5, 2];
    if (out >= 4) return [2, out - 3, 1];
    return [out];
  }
  V40.futWatch = function (s, A, B) {
    if (!s) return;
    const la = (s.la && s.la.length ? s.la : Array.from({ length: 11 }, (_, i) => A.name + ' ' + (i + 1))).slice(0, 11);
    const lb = (s.lb && s.lb.length ? s.lb : Array.from({ length: 11 }, (_, i) => B.name + ' ' + (i + 1))).slice(0, 11);
    const box = V40.modal(`<div class="v40-fw">
      <div class="v40-fw-hud"><span class="t a">${V40.esc((A.icon || '') + ' ' + A.name)}</span><b id="v40FwScore">0 × 0</b><span class="t b">${V40.esc(B.name + ' ' + (B.icon || ''))}</span></div>
      <div class="v40-fw-clock"><span id="v40FwClock">0'</span> <span id="v40FwTick" class="v40-muted"></span></div>
      <canvas id="v40FwCanvas"></canvas>
      <div id="v40FwFeed" class="v40-fw-feed"></div>
      <div class="v40-fw-ctl"><button data-fwsp="1">1×</button><button data-fwsp="2" class="on">2×</button><button data-fwsp="4">4×</button><button data-fwsp="skip">⏭ Fim</button><button onclick="closeModal()">Fechar</button></div>
    </div>`, true);
    const cv = box.querySelector('#v40FwCanvas');
    const W = Math.min(box.clientWidth - 24, 680), H = Math.round(W * 0.62);
    const dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    const M = 14, FW = W - 2 * M, FH = H - 2 * M;   // campo
    const R = Math.max(7, Math.min(11, W / 52));
    const endMin = s.et ? 120 : 90;
    let speed = 2, gameMin = 0, last = performance.now(), done = false, pauseUntil = 0, flash = null;
    const REAL_PER_MIN = 0.42;   // segundos por minuto de jogo no 1×
    // jogadores com posição base (time A defende a esquerda, B a direita)
    const mk = (list, side) => {
      const f = formation(list.length), ps = [];
      ps.push({ n: list[0], bx: side === 'a' ? 0.04 : 0.96, by: 0.5, gk: true });
      let k = 1;
      f.forEach((cnt, li) => {
        const x = 0.16 + li * (0.3 / Math.max(1, f.length - 1 || 1));
        for (let j = 0; j < cnt; j++, k++) ps.push({ n: list[k], bx: side === 'a' ? x : 1 - x, by: (j + 1) / (cnt + 1) });
      });
      return ps.map(p => Object.assign(p, { x: p.bx, y: p.by, side, ph: Math.random() * 6 }));
    };
    const PA = mk(la, 'a'), PB = mk(lb, 'b');
    const all = PA.concat(PB);
    const ball = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, holder: null };
    // roteiro: posse alternando, puxada pelo time mais forte; antes de cada gol, o autor ataca
    const goals = (s.ev || []).map(([m, side, name]) => ({ m, side, name, done: false }));
    let poss = Math.random() < 0.5 ? 'a' : 'b', nextSwitch = 1 + Math.random() * 3, nextPass = 0;
    const pa = 0.5 + Math.max(-0.25, Math.min(0.25, (s.ra - s.rb) * 0.07));
    let sa = 0, sb = 0;
    const feed = box.querySelector('#v40FwFeed');
    const say = t => { const d = document.createElement('div'); d.textContent = t; feed.prepend(d); while (feed.children.length > 4) feed.lastChild.remove(); };
    say('Apita o árbitro! Começa o jogo.');
    const team = sd => (sd === 'a' ? PA : PB);
    function passTo(sd, forward) {
      const T = team(sd).filter(p => !p.gk);
      const dir = sd === 'a' ? 1 : -1;
      const cur = ball.holder;
      let c = T.filter(p => p !== cur && (forward ? (p.x - ball.x) * dir > -0.05 : true));
      if (!c.length) c = T.filter(p => p !== cur);
      const p = c[Math.floor(Math.random() * c.length)];
      ball.holder = p; ball.tx = p.x; ball.ty = p.y;
    }
    function kickoff(sd) { ball.x = ball.tx = 0.5; ball.y = ball.ty = 0.5; poss = sd; all.forEach(p => { p.x = p.bx; p.y = p.by; }); ball.holder = null; passTo(sd, false); }
    function step(dt) {
      const now = performance.now();
      if (now < pauseUntil) return;
      if (flash && now >= pauseUntil) { kickoff(flash.side === 'a' ? 'b' : 'a'); flash = null; }
      const prevMin = gameMin;
      gameMin = Math.min(endMin, gameMin + dt * speed / REAL_PER_MIN);
      const g = goals.find(x => !x.done && x.m <= gameMin);
      const upcoming = goals.find(x => !x.done && x.m - gameMin < 2.2);
      if (upcoming) poss = upcoming.side;
      else if (gameMin >= nextSwitch) { poss = Math.random() < pa ? 'a' : 'b'; nextSwitch = gameMin + 1.5 + Math.random() * 4; }
      if (prevMin < 45 && gameMin >= 45 && !s.et && endMin === 90) say('Intervalo… e volta o segundo tempo.');
      if (prevMin < 90 && gameMin >= 90 && s.et) say('Fim do tempo normal: prorrogação!');
      if (g) {
        g.done = true;
        if (g.side === 'a') sa++; else sb++;
        ball.tx = g.side === 'a' ? 1.01 : -0.01; ball.ty = 0.5; ball.holder = null;
        flash = g; pauseUntil = now + 1700 / Math.min(speed, 2);
        box.querySelector('#v40FwScore').textContent = `${sa} × ${sb}`;
        say(`⚽ ${g.m}' GOL! ${g.name || (g.side === 'a' ? A : B).name} (${(g.side === 'a' ? A : B).name})`);
        V40.sound && V40.sound('tick');
        return;
      }
      // passes
      const tgtGoal = poss === 'a' ? 0.97 : 0.03;
      if (gameMin >= nextPass) {
        nextPass = gameMin + 0.35 + Math.random() * 0.6;
        if (upcoming) { ball.holder = null; ball.tx = ball.x + (tgtGoal - ball.x) * 0.45; ball.ty = 0.5 + (Math.random() - 0.5) * 0.3; }
        else passTo(poss, Math.random() < 0.7);
      }
      // jogadores: avançam com a posse, os mais perto vão na bola
      const t = now / 1000;
      all.forEach(p => {
        const att = p.side === poss;
        const dir = p.side === 'a' ? 1 : -1;
        const shift = p.gk ? 0 : (att ? 0.16 : -0.06) * dir + (ball.x - 0.5) * 0.35;
        let tx = p.bx + shift, ty = p.by + Math.sin(t * 0.9 + p.ph) * 0.035 + (ball.y - 0.5) * 0.15;
        const d = Math.hypot(ball.x - p.x, (ball.y - p.y) * 0.62);
        if (!p.gk && d < 0.16) { tx = tx * 0.4 + ball.x * 0.6; ty = ty * 0.4 + ball.y * 0.6; }
        if (p.gk) ty = 0.5 + (ball.y - 0.5) * 0.3;
        p.x += (Math.max(0.02, Math.min(0.98, tx)) - p.x) * Math.min(1, dt * 2.2 * speed);
        p.y += (Math.max(0.04, Math.min(0.96, ty)) - p.y) * Math.min(1, dt * 2.2 * speed);
      });
      if (ball.holder) { ball.tx = ball.holder.x; ball.ty = ball.holder.y; }
      ball.x += (ball.tx - ball.x) * Math.min(1, dt * 4 * speed);
      ball.y += (ball.ty - ball.y) * Math.min(1, dt * 4 * speed);
      if (gameMin >= endMin) finish();
    }
    function finish() {
      if (done) return;
      done = true; gameMin = endMin;
      goals.forEach(g => { if (!g.done) { g.done = true; if (g.side === 'a') sa++; else sb++; } });
      box.querySelector('#v40FwScore').textContent = `${sa} × ${sb}`;
      if (s.pen) say(`🥅 Pênaltis: ${s.pen[0]} × ${s.pen[1]} — ${(s.pen[0] > s.pen[1] ? A : B).name} passa!`);
      say(`🏁 Fim de jogo: ${A.name} ${sa} × ${sb} ${B.name}`);
    }
    function draw() {
      const now = performance.now();
      // gramado
      for (let i = 0; i < 10; i++) { ctx.fillStyle = i % 2 ? '#2f7d3a' : '#348a40'; ctx.fillRect(M + i * FW / 10, M, FW / 10 + 1, FH); }
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(M, M, FW, FH);
      ctx.beginPath(); ctx.moveTo(M + FW / 2, M); ctx.lineTo(M + FW / 2, M + FH); ctx.stroke();
      ctx.beginPath(); ctx.arc(M + FW / 2, M + FH / 2, FH * 0.15, 0, Math.PI * 2); ctx.stroke();
      [[M, 1], [M + FW, -1]].forEach(([x0, d]) => {
        ctx.strokeRect(d > 0 ? x0 : x0 - FW * 0.14, M + FH * 0.22, FW * 0.14, FH * 0.56);
        ctx.strokeRect(d > 0 ? x0 : x0 - FW * 0.05, M + FH * 0.36, FW * 0.05, FH * 0.28);
        ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(d > 0 ? x0 - 6 : x0, M + FH * 0.42, 6, FH * 0.16);
      });
      const X = v => M + v * FW, Y = v => M + v * FH;
      all.forEach(p => {
        ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), R, 0, Math.PI * 2);
        ctx.fillStyle = p.side === 'a' ? (p.gk ? '#f4a261' : '#e63946') : (p.gk ? '#90e0ef' : '#1d4ed8');
        ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = p.side === 'a' ? '#ffd166' : '#ffffff'; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(R * 0.9)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(initials(p.n), X(p.x), Y(p.y) + 0.5);
      });
      // bola
      ctx.beginPath(); ctx.arc(X(ball.x), Y(ball.y), R * 0.45, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.stroke();
      if (ball.holder) { ctx.fillStyle = 'rgba(0,0,0,.55)'; const tx = (ball.holder.n || '').slice(0, 18); ctx.font = `600 ${Math.round(R * 0.95)}px system-ui,sans-serif`; const w = ctx.measureText(tx).width + 8; ctx.fillRect(X(ball.holder.x) - w / 2, Y(ball.holder.y) - R * 2.6, w, R * 1.5); ctx.fillStyle = '#fff'; ctx.fillText(tx, X(ball.holder.x), Y(ball.holder.y) - R * 1.85); }
      if (flash && now < pauseUntil) {
        ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, H / 2 - 34, W, 68);
        ctx.fillStyle = '#ffd166'; ctx.font = `900 ${Math.round(W / 14)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.fillText('GOOOL!', W / 2, H / 2 - 8);
        ctx.fillStyle = '#fff'; ctx.font = `600 ${Math.round(W / 34)}px system-ui,sans-serif`; ctx.fillText(`${flash.name || (flash.side === 'a' ? A : B).name} · ${flash.m}'`, W / 2, H / 2 + 20);
      }
      box.querySelector('#v40FwClock').textContent = done ? (s.pen ? `Fim · pênaltis ${s.pen[0]}×${s.pen[1]}` : 'Fim de jogo') : `${Math.floor(gameMin)}'${gameMin > 45 && gameMin < 46 ? '' : ''}`;
    }
    kickoff(poss);
    function loop(now) {
      if (!document.body.contains(cv)) return;     // fechou
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!done) step(dt);
      draw();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    box.querySelectorAll('[data-fwsp]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.fwsp === 'skip') { finish(); return; }
      speed = +b.dataset.fwsp;
      box.querySelectorAll('[data-fwsp]').forEach(x => x.classList.toggle('on', x === b));
    }));
  };
  // 🎞 guarda os jogos simulados (só neste aparelho, os 600 mais recentes) pra rever qualquer um
  const SIMK = 'v40fut-sims-' + (window.V40_LIST || 'oficial');
  function simsGet() { try { return JSON.parse(localStorage.getItem(SIMK) || '{}') || {}; } catch (e) { return {}; } }
  V40.futStore = function (id, s, a, b) {
    try {
      const all = simsGet();
      all[id] = { s: { ga: s.ga, gb: s.gb, ev: s.ev, la: s.la, lb: s.lb, ra: s.ra, rb: s.rb, et: s.et, pen: s.pen, w: s.w }, a, b, at: Date.now() };
      const ks = Object.keys(all);
      if (ks.length > 600) ks.sort((x, y) => all[x].at - all[y].at).slice(0, ks.length - 600).forEach(k => delete all[k]);
      localStorage.setItem(SIMK, JSON.stringify(all));
    } catch (e) {}
  };
  V40.futForget = function (id) { try { const all = simsGet(); delete all[id]; localStorage.setItem(SIMK, JSON.stringify(all)); } catch (e) {} };
  // botão 📺 pra qualquer jogo: o simulado é revisto igualzinho; o decidido na mão (ou antigo)
  // vira um jogo com o placar que ficou (gols em minutos sorteados)
  V40.futReplayBtn = function (id, A, B, score, r) {
    if (!A || !B) return '';
    const st = simsGet()[id];
    let s = null;
    if (st && st.s) s = st.a === A.pid || st.b === B.pid ? st.s : V40.futFlip(st.s);
    else {
      const g = V40.futGoals(score, r);
      const ev = [];
      mins(g[0], 1, 90).forEach(m => ev.push([m, 'a', null]));
      mins(g[1], 1, 90).forEach(m => ev.push([m, 'b', null]));
      ev.sort((x, y) => x[0] - y[0]);
      s = { ga: g[0], gb: g[1], ev, ra: 7, rb: 7, w: g[0] > g[1] ? 'a' : g[0] < g[1] ? 'b' : 'd' };
      if (Array.isArray(score) && score.length > 2) s.pen = [score[2], score[3]];
    }
    return V40.futWatchBtn(s, A, B, true);
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
