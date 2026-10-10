/* =====================================================================
 * UCM Watchlist — v40 BETA — 🏠 início novo, 🎮 jogo (XP, troféus,
 * desafios, metas), 🎬 modo cinema + cronômetro, 🎲 sorteio, 🎨 temas
 * ===================================================================== */
(function () {
  'use strict';
  const V40 = window.V40;

  // =================== TROFÉUS NOVOS ===================
  const STREAKS = [3, 7, 10, 14, 21, 30, 50, 75, 100];
  const STREAK_ICONS = ['🔥', '🔥', '🔥', '🔥', '☄️', '☄️', '🌋', '🌋', '💥'];
  function maxEpsInADay() {
    const act = V40.activityByDay();
    return Math.max(0, ...Object.values(act).map(a => a.eps || 0));
  }
  function dayMetGoal(d, act) {
    const a = act[d];
    if (!a) return false;
    if (a.titles > 0) return true;
    return (a.eps || 0) >= v40RateAt(d, 'anim');
  }
  V40.perfectWeek = function () {
    const act = V40.activityByDay();
    const days = Object.keys(act).sort();
    let run = 0, prev = null, best = 0;
    days.forEach(d => {
      if (!dayMetGoal(d, act)) { run = 0; prev = d; return; }
      run = (prev && V40.addDays(prev, 1) === d && run > 0) ? run + 1 : 1;
      prev = d;
      best = Math.max(best, run);
    });
    return best >= 7;
  };
  V40.perfectMonth = function () {
    const log = V40.get('day-status', {});
    const days = Object.keys(log).sort();
    let run = 0, prev = null;
    for (const d of days) {
      if (log[d]) { run = 0; prev = d; continue; }
      run = (prev && V40.addDays(prev, 1) === d) ? run + 1 : 1;
      prev = d;
      if (run >= 30) return true;
    }
    return false;
  };
  V40.recovered = function () {
    if (V40.activity.some(e => e.type === 'recover')) return true;
    const log = V40.get('day-status', {});
    const days = Object.keys(log).sort();
    let wasLate = false;
    for (const d of days) {
      if (log[d]) wasLate = true;
      else if (wasLate) return true;
    }
    return false;
  };
  function addAchievements() {
    if (ACHIEVEMENTS.some(a => a.id === 'v40-streak3')) return;
    STREAKS.forEach((n, i) => ACHIEVEMENTS.push({
      cat: '🔥 Sequência (v40)', id: 'v40-streak' + n, icon: STREAK_ICONS[i], name: `${n} dias seguidos`,
      hint: 'dias seguidos marcando título OU episódio', test: () => V40.bestStreak() >= n
    }));
    [[5, '🍿'], [10, '🛋️'], [20, '🧟']].forEach(([n, ic]) => ACHIEVEMENTS.push({
      cat: '🏃 Maratona (v40)', id: 'v40-binge' + n, icon: ic, name: `${n} episódios num dia`, hint: `marcar ${n}+ episódios no mesmo dia`, test: () => maxEpsInADay() >= n
    }));
    ACHIEVEMENTS.push({ cat: '📆 Constância (v40)', id: 'v40-week', icon: '🗓️', name: 'Semana perfeita', hint: '7 dias seguidos batendo a meta do dia', test: () => V40.perfectWeek() });
    ACHIEVEMENTS.push({ cat: '📆 Constância (v40)', id: 'v40-month', icon: '📅', name: 'Mês perfeito', hint: '30 dias seguidos sem ficar atrasado', test: () => V40.perfectMonth() });
    ACHIEVEMENTS.push({ cat: '📆 Constância (v40)', id: 'v40-recover', icon: '🩹', name: 'Recuperação', hint: 'zerar o atraso depois de ter ficado atrasado', test: () => V40.recovered() });
    PHASE_ORDER.forEach((ph, i) => ACHIEVEMENTS.push({
      cat: '🗂 Fases (v40)', id: 'v40-phase-' + i, icon: '🏁', name: ph.split('(')[0].trim().slice(0, 34), hint: 'concluir a fase inteira',
      test: (d, t, list) => { const l = list.filter(x => x.phase === ph); return l.length > 0 && l.every(x => x.done); }
    }));
    ACHIEVEMENTS.push({ cat: '🥇 Liga (v40)', id: 'v40-ko', icon: '👑', name: 'O verdadeiro 10', hint: 'terminar o mata-mata dos títulos nota 10', test: () => { const k = V40.get('knockout', null); return !!(k && k.champion); } });
    ACHIEVEMENTS.push({ cat: '🥇 Liga (v40)', id: 'v40-rated50', icon: '📝', name: '50 títulos com nota', test: () => V40.participants().filter(p => p.rating > 0).length >= 50 });
    ACHIEVEMENTS.push({ cat: '🥇 Liga (v40)', id: 'v40-rated100', icon: '🗳️', name: '100 títulos com nota', test: () => V40.participants().filter(p => p.rating > 0).length >= 100 });
    [[3, '🎖️'], [5, '🏵️'], [8, '💎'], [10, '🌌']].forEach(([n, ic]) => ACHIEVEMENTS.push({
      cat: '⭐ Níveis (v40)', id: 'v40-level' + n, icon: ic, name: `Nível ${n}`, hint: V40.LEVELS[n - 1].name, test: () => V40.levelOf(V40.xp().xp).level >= n
    }));
    [[1, '🎯'], [5, '🏹'], [10, '🎪']].forEach(([n, ic]) => ACHIEVEMENTS.push({
      cat: '🎯 Desafios (v40)', id: 'v40-chal' + n, icon: ic, name: `${n} desafio${n > 1 ? 's' : ''} da semana`, test: () => (V40.get('challenges-done', []) || []).length >= n
    }));
  }

  // pop-up de troféu ganha confete e som
  const origPopup = window.showAchievementPopup;
  window.showAchievementPopup = function (a) {
    origPopup.apply(this, arguments);
    V40.confetti(false);
    V40.sound('trophy');
  };

  // =================== DESAFIO DA SEMANA ===================
  function weekStart(iso) {
    const d = new Date(iso + 'T12:00:00');
    const dow = (d.getDay() + 6) % 7;
    return V40.addDays(iso, -dow);
  }
  const CHALLENGES = [
    { id: 'eps15', icon: '📺', text: 'Marque 15 episódios nesta semana', goal: 15, calc: w => sumAct(w, 'ep') },
    { id: 'days6', icon: '📆', text: 'Assista em 6 dias diferentes', goal: 6, calc: w => daysActive(w) },
    { id: 'rate10', icon: '⭐', text: 'Avalie 10 episódios', goal: 10, calc: w => sumAct(w, 'eprate') },
    { id: 'titles2', icon: '🏁', text: 'Conclua 2 títulos', goal: 2, calc: w => countAct(w, 'title') },
    { id: 'goal5', icon: '🎯', text: 'Bata a meta do dia 5 vezes', goal: 5, calc: w => goalDays(w) },
    { id: 'eps21', icon: '🔥', text: 'Marque 21 episódios nesta semana', goal: 21, calc: w => sumAct(w, 'ep') }
  ];
  function inWeek(e, w) { return e.d >= w && e.d <= V40.addDays(w, 6); }
  function sumAct(w, type) { return V40.activity.filter(e => e.type === type && inWeek(e, w)).reduce((s, e) => s + (e.n || 1), 0); }
  function countAct(w, type) { return V40.activity.filter(e => e.type === type && inWeek(e, w)).length; }
  function daysActive(w) {
    const days = new Set(V40.activity.filter(e => (e.type === 'ep' || e.type === 'title') && inWeek(e, w)).map(e => e.d));
    V40.streakDays().forEach(d => { if (d >= w && d <= V40.addDays(w, 6)) days.add(d); });
    return days.size;
  }
  function goalDays(w) {
    const act = V40.activityByDay();
    let n = 0;
    for (let i = 0; i < 7; i++) if (dayMetGoal(V40.addDays(w, i), act)) n++;
    return n;
  }
  V40.weekChallenge = function () {
    const w = weekStart(V40.today());
    const idx = Math.floor(new Date(w + 'T12:00:00').getTime() / (7 * 86400000)) % CHALLENGES.length;
    const c = CHALLENGES[(idx + CHALLENGES.length) % CHALLENGES.length];
    const prog = Math.min(c.goal, Math.max(0, c.calc(w)));
    const key = w + ':' + c.id;
    const doneList = V40.get('challenges-done', []);
    return { c, w, prog, done: doneList.includes(key), key, ends: V40.addDays(w, 6) };
  };
  function checkChallenge() {
    const wc = V40.weekChallenge();
    if (!wc.done && wc.prog >= wc.c.goal) {
      const list = V40.get('challenges-done', []);
      list.push(wc.key);
      V40.set('challenges-done', list);
      V40.toast(`🎯 Desafio da semana concluído! +150 XP`);
      V40.confetti(false); V40.sound('level');
      V40.logEvent('challenge', { name: wc.c.text });
    }
  }

  // =================== META DO MÊS ===================
  V40.monthGoal = function () {
    const ym = V40.today().slice(0, 7);
    const goals = V40.get('month-goals', {});
    const g = goals[ym] || null;
    const titles = items.filter(i => i.done && i.completedAt && i.completedAt.startsWith(ym)).length;
    const eps = V40.activity.filter(e => e.d.startsWith(ym)).reduce((s, e) => s + (e.type === 'ep' ? (e.n || 1) : e.type === 'unep' ? -(e.n || 1) : 0), 0);
    return { ym, g, titles, eps: Math.max(0, eps) };
  };
  V40.openMonthGoal = function () {
    const mg = V40.monthGoal();
    const g = mg.g || {};
    V40.modal(`<h3>🎯 Meta do mês</h3>
      <p class="v40-muted">Você escolhe; o app acompanha. Deixe em branco o que não quiser.</p>
      <div class="v40-form">
        <label>Títulos concluídos no mês <input type="number" id="v40MgT" min="0" value="${g.titles || ''}" placeholder="ex.: 20"></label>
        <label>Episódios marcados no mês <input type="number" id="v40MgE" min="0" value="${g.eps || ''}" placeholder="ex.: 90"></label>
      </div>
      <p class="v40-muted">Até agora neste mês: ${mg.titles} título(s) · ${mg.eps} episódio(s)*.<br><small>* episódios contam desde que a v40 começou a registrar.</small></p>
      <button id="v40MgSave" class="v40-primary">Salvar meta</button>`);
    document.getElementById('v40MgSave').addEventListener('click', () => {
      const goals = V40.get('month-goals', {});
      const t = parseInt(document.getElementById('v40MgT').value, 10), e = parseInt(document.getElementById('v40MgE').value, 10);
      if (!(t > 0) && !(e > 0)) delete goals[mg.ym];
      else goals[mg.ym] = { titles: t > 0 ? t : 0, eps: e > 0 ? e : 0 };
      V40.set('month-goals', goals);
      closeModal(); render();
      V40.toast('🎯 Meta do mês salva');
    });
  };

  // =================== EVENTOS DE MUDANÇA ===================
  V40.onChange(ch => {
    // título concluído: confete pequeno + som
    if (ch.titlesDone.length) { V40.sound('done'); V40.confetti(false); }
    // fase concluída / maratona concluída
    ch.titlesDone.forEach(it => { if (it) checkPhaseDone(it.phase); });
    if (ch.titlesDone.length && items.length && items.every(i => i.done)) setTimeout(V40.finalScreen, 800);
    // meta do dia
    if (ch.epsAdded > 0) {
      const p = V40.todayPlan();
      const t = V40.today();
      const left = p.epsTotal - p.epsDone;
      if (p.epsTotal > 0 && left === 1) V40.toast('⚡ Falta só 1 episódio pra fechar a meta de hoje!');
      if (p.epsTotal > 0 && left === 0 && V40.get('goal-day', '') !== t) {
        V40.set('goal-day', t);
        V40.toast('🎯 Meta de hoje cumprida!');
        V40.confetti(false); V40.sound('level');
      } else V40.sound('tick');
    }
    // troféus podem depender de episódio/nota (antes só checava ao concluir título)
    if (ch.epsAdded || ch.ratings.length || ch.epRatings) { try { checkAchievements(); } catch (e) {} }
    checkChallenge();
    checkLevelUp();
  });
  function checkLevelUp() {
    const lv = V40.levelOf(V40.xp().xp);
    const last = V40.get('last-level', null);
    if (last === null) { V40.set('last-level', lv.level); return; }
    if (lv.level > last) {
      V40.set('last-level', lv.level);
      const popup = document.createElement('div');
      popup.className = 'achv-popup';
      popup.innerHTML = `<div class="achv-popup-icon">${lv.cur.icon}</div><div class="achv-popup-label">⭐ SUBIU DE NÍVEL — NÍVEL ${lv.level}</div><div class="achv-popup-name">${V40.esc(lv.cur.name)}</div>`;
      document.body.appendChild(popup);
      requestAnimationFrame(() => popup.classList.add('show'));
      setTimeout(() => { popup.classList.remove('show'); setTimeout(() => popup.remove(), 400); }, 3400);
      V40.confetti(true); V40.sound('level');
      V40.logEvent('level', { v: lv.level });
    } else if (lv.level < last) V40.set('last-level', lv.level);
  }
  function checkPhaseDone(phase) {
    const list = items.filter(i => i.phase === phase);
    if (!list.length || !list.every(i => i.done)) return;
    const done = V40.get('phases-celebrated', []);
    if (done.includes(phase)) return;
    done.push(phase);
    V40.set('phases-celebrated', done);
    const rated = list.filter(i => i.rating > 0 && simpleKind(i) !== 'jogo');
    const avg = rated.length ? rated.reduce((s, i) => s + i.rating, 0) / rated.length : null;
    const best = rated.slice().sort((a, b) => b.rating - a.rating)[0];
    setTimeout(() => {
      V40.modal(`<div class="v40-celebrate">
        <div class="big">🏁</div>
        <div class="lbl">FASE CONCLUÍDA</div>
        <h3>${V40.esc(phase)}</h3>
        <p>${list.length} títulos${avg != null ? ` · média <b>${V40.fmt1(avg)}</b>` : ''}</p>
        ${best ? `<p>🏆 Melhor da fase: <b>${V40.esc(V40.cleanName(best))}</b> (${V40.fmt1(best.rating)})</p>` : ''}
      </div>`);
      V40.confetti(true); V40.sound('trophy');
    }, 900);
  }
  V40.finalScreen = function () {
    V40.modal(`<div class="v40-celebrate final">
      <div class="big">♾️</div>
      <div class="lbl">MARATONA COMPLETA</div>
      <h3>Você viu TUDO.</h3>
      <p>${items.length} títulos. Do passado de Asgard até Guerras Secretas.</p>
      <p>"Eu sou… inevitável." — e você também foi.</p>
      <button class="v40-primary" id="v40FinalWrapped">🎁 Ver minha retrospectiva</button>
    </div>`);
    V40.confetti(true); V40.sound('trophy');
    setTimeout(() => V40.confetti(true), 1200);
    const b = document.getElementById('v40FinalWrapped');
    if (b) b.addEventListener('click', () => V40.openWrapped());
  };

  // =================== 🏠 INÍCIO NOVO ===================
  const HOME_BLOCKS = [
    ['today', '📅 Card de hoje (meta do dia)'],
    ['level', '⭐ Nível, XP e sequência'],
    ['goals', '🎯 Meta do mês e desafio da semana'],
    ['timeline', '🚉 Linha do tempo das fases'],
    ['legend', '🎨 Legenda de cores'],
    ['badges', '🏷 Início / término / Guerras Secretas'],
    ['counters', '⏰ Atraso, sequência e horas restantes'],
    ['countdowns', '🚀 Contagens regressivas'],
    ['actions', '🔘 Botões antigos (maratona, ritmo…)']
  ];
  V40.HOME_BLOCKS = HOME_BLOCKS;
  function applyHomeBlocks() {
    const h = V40.settings.home;
    const page = document.getElementById('tabInicio');
    if (!page) return;
    const vis = (sel, on) => page.querySelectorAll(sel).forEach(e => { e.classList.toggle('v40-hidden', !on); });
    vis('#phaseTimeline', h.timeline);
    vis('.legend', h.legend);
    vis('.badges', h.badges);
    vis('#delayCounter, #delayCounterDetail, #streakCounter, #hoursLeft', h.counters);
    vis('#countdownNext, #countdownFinal, #countdownDoomsday', h.countdowns);
    vis('.dash-actions:not(.v40-actions)', h.actions);
  }
  V40.renderHomeExtra = function () {
    const page = document.getElementById('tabInicio');
    if (!page) return;
    let box = document.getElementById('v40Home');
    if (!box) {
      box = document.createElement('div');
      box.id = 'v40Home';
      const pw = page.querySelector('.progress-wrap');
      page.insertBefore(box, pw ? pw.nextSibling : page.firstChild);
    }
    const h = V40.settings.home;
    const t = V40.today();
    const plan = V40.todayPlan();
    const late = V40.lateInfo();
    const cur = V40.currentItem();
    const pauseToday = V40.get('extra-pauses', []).some(([a, b]) => t >= a && t <= b) || isPauseDay(new Date(t + 'T12:00:00'));
    const pct = plan.epsTotal ? Math.round(100 * plan.epsDone / plan.epsTotal) : (plan.titles.length ? Math.round(100 * plan.titles.filter(x => x.done).length / plan.titles.length) : 0);
    let html = '';
    if (h.today) {
      const titleLines = plan.titles.map(x => `<div class="v40-today-t ${x.done ? 'ok' : ''}">${x.done ? '✅' : '▶️'} ${V40.esc(V40.cleanName(x.it))}</div>`).join('');
      html += `<div class="v40-today-card">
        <div class="v40-today-head"><span>HOJE · ${V40.fmtBR(t)}</span>${pauseToday ? '<span class="v40-pill">💤 folga</span>' : ''}</div>
        ${plan.epsTotal ? `<div class="v40-today-bar"><div class="fill" style="width:${pct}%"></div><span>${plan.epsDone} de ${plan.epsTotal} episódio${plan.epsTotal === 1 ? '' : 's'} de hoje${plan.epsDone >= plan.epsTotal ? ' ✓' : ''}</span></div>` : ''}
        ${titleLines}
        ${!plan.epsTotal && !plan.titles.length ? `<div class="v40-muted">${pauseToday ? 'Dia de folga — nada programado. 😴' : (cur ? 'Nada com data hoje. Próximo: <b>' + V40.esc(V40.cleanName(cur)) + '</b>' : 'Tudo visto! 🎉')}</div>` : ''}
        ${(late.lateEps || late.lateTitles.length) ? `<button class="v40-late" id="v40HomeLate">⏰ ${late.lateEps ? late.lateEps + ' ep.' : ''}${late.lateEps && late.lateTitles.length ? ' + ' : ''}${late.lateTitles.length ? late.lateTitles.length + ' título(s)' : ''} atrasado(s) — resolver ›</button>` : ''}
        <div class="v40-today-actions">
          <button id="v40HomeCinema">🎬 Modo cinema</button>
          <button id="v40HomeDraw">🎲 Sorteio</button>
          <button id="v40HomeSkip">${pauseToday && V40.get('extra-pauses', []).some(([a, b]) => a === t && b === t) ? '↺ Desfazer folga' : '🛌 Hoje não vou assistir'}</button>
        </div>
      </div>`;
    }
    if (h.level) {
      const xp = V40.xp();
      const lv = V40.levelOf(xp.xp);
      const streak = V40.currentStreak(), best = V40.bestStreak();
      html += `<button class="v40-level-card" id="v40HomeLevel">
        <span class="ic">${lv.cur.icon}</span>
        <span class="mid"><b>Nível ${lv.level} · ${V40.esc(lv.cur.name)}</b>
          <span class="v40-xpbar"><span style="width:${lv.pct}%"></span></span>
          <small>${xp.xp} XP${lv.next ? ` · faltam ${lv.next.xp - xp.xp} pro nível ${lv.level + 1}` : ' · nível máximo!'}</small></span>
        <span class="st">🔥 ${streak}<small>recorde ${best}</small></span>
      </button>`;
    }
    if (h.goals) {
      const mg = V40.monthGoal();
      const wc = V40.weekChallenge();
      const mgHtml = mg.g ? [mg.g.titles ? ['títulos', mg.titles, mg.g.titles] : null, mg.g.eps ? ['episódios', mg.eps, mg.g.eps] : null].filter(Boolean).map(([l, v, g]) => `<div class="v40-goal-line"><span>${l}</span><span class="bt"><span class="bf" style="width:${Math.min(100, 100 * v / g)}%"></span></span><b>${v}/${g}</b></div>`).join('') : '<div class="v40-muted">Sem meta pra este mês — toque pra definir.</div>';
      html += `<div class="v40-goals">
        <button class="v40-goal-card" id="v40HomeMonth"><div class="gh">🎯 META DE ${['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'][+mg.ym.slice(5) - 1]}</div>${mgHtml}</button>
        <div class="v40-goal-card ${wc.done ? 'done' : ''}"><div class="gh">${wc.c.icon} DESAFIO DA SEMANA ${wc.done ? '✓' : ''}</div><div class="v40-goal-txt">${wc.c.text}</div>
          <div class="v40-goal-line"><span class="bt"><span class="bf" style="width:${100 * wc.prog / wc.c.goal}%"></span></span><b>${wc.prog}/${wc.c.goal}</b></div>
          <div class="v40-muted" style="font-size:0.62rem;">+150 XP · até ${V40.fmtBR(wc.ends)}</div></div>
      </div>`;
    }
    html += `<div class="dash-actions v40-actions">
        <button id="v40HomeRate">⏱ Episódios por dia</button>
        <button id="v40HomeTravel">✈️ Modo viagem</button>
        <button id="v40HomeSim">🔮 Simulador</button>
        <button id="v40HomeCal">📅 Calendário do mês</button>
        <button id="v40HomeUni">📚 Universo</button>
        <button id="v40HomeRem">⏰ Lembretes</button>
      </div>`;
    box.innerHTML = html;
    const on = (id, fn) => { const e = document.getElementById(id); if (e) e.addEventListener('click', fn); };
    on('v40HomeLate', V40.openLateHelper);
    on('v40HomeCinema', V40.openCinema);
    on('v40HomeDraw', V40.openDraw);
    on('v40HomeSkip', V40.skipToday);
    on('v40HomeLevel', V40.openLevelInfo);
    on('v40HomeMonth', V40.openMonthGoal);
    on('v40HomeRate', V40.openRateSettings);
    on('v40HomeTravel', V40.openTravel);
    on('v40HomeSim', V40.openSimulator);
    on('v40HomeCal', () => V40.openMonthCalendar());
    on('v40HomeUni', () => V40.openUniverse());
    on('v40HomeRem', () => V40.openReminders && V40.openReminders());
    applyHomeBlocks();
    V40.applyHeroBg();
  };

  V40.openLevelInfo = function () {
    const xp = V40.xp();
    const lv = V40.levelOf(xp.xp);
    V40.modal(`<h3>${lv.cur.icon} Nível ${lv.level} — ${V40.esc(lv.cur.name)}</h3>
      <div class="v40-xpbar big"><span style="width:${lv.pct}%"></span></div>
      <p>${xp.xp} XP${lv.next ? ` · próximo: <b>${V40.esc(lv.next.name)}</b> em ${lv.next.xp} XP` : ''}</p>
      <div class="stat-card"><h4>De onde vem seu XP</h4>
        <div class="v40-row"><span style="flex:1">🎬 Títulos concluídos (100 · série 120 · jogo 300)</span><b>${xp.parts.titulos}</b></div>
        <div class="v40-row"><span style="flex:1">📺 Episódios marcados (15 cada)</span><b>${xp.parts.episodios}</b></div>
        <div class="v40-row"><span style="flex:1">⭐ Notas dadas (10 por título, 5 por episódio)</span><b>${xp.parts.notas}</b></div>
        <div class="v40-row"><span style="flex:1">🏆 Troféus (50 cada)</span><b>${xp.parts.trofeus}</b></div>
        <div class="v40-row"><span style="flex:1">🎯 Desafios da semana (150 cada)</span><b>${xp.parts.desafios}</b></div>
      </div>
      <div class="stat-card"><h4>Todos os níveis</h4>${V40.LEVELS.map((l, i) => `<div class="v40-row ${i === lv.idx ? 'on' : ''}"><span>${l.icon}</span><span style="flex:1">${i + 1}. ${V40.esc(l.name)}</span><small>${l.xp} XP</small></div>`).join('')}</div>`);
  };

  // =================== 🎬 MODO CINEMA + ⏱ CRONÔMETRO ===================
  let timerInt = null;
  V40.watchTime = function () { return V40.get('watch-time', {}); };
  function timerState() { return V40.get('timer', { running: false, startedAt: null, acc: 0 }); }
  function timerSecs(st) { return st.acc + (st.running && st.startedAt ? Math.floor((Date.now() - st.startedAt) / 1000) : 0); }
  function fmtSecs(s) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0'); }
  function addWatchSeconds(s) {
    if (s <= 0) return;
    const wt = V40.watchTime();
    const t = V40.today();
    wt[t] = (wt[t] || 0) + s;
    V40.set('watch-time', wt);
  }
  V40.timerToggle = function () {
    const st = timerState();
    if (st.running) { st.acc = timerSecs(st); st.running = false; st.startedAt = null; }
    else { st.running = true; st.startedAt = Date.now(); }
    V40.set('timer', st);
    updateCinema();
  };
  V40.timerStop = function () {
    const st = timerState();
    const s = timerSecs(st);
    addWatchSeconds(s);
    V40.set('timer', { running: false, startedAt: null, acc: 0 });
    if (s > 30) V40.toast(`⏱ ${fmtSecs(s)} somados ao tempo de hoje`);
    updateCinema();
  };
  function nextEpisodeOf(it) {
    const eps = extractEpsCount(it.text) || 1;
    const epDone = it.epDone || [];
    for (let e = 0; e < eps; e++) if (!epDone[e]) return e;
    return -1;
  }
  function updateCinema() {
    const el = document.getElementById('v40Cinema');
    if (!el) return;
    const cur = V40.currentItem();
    const plan = V40.todayPlan();
    const st = timerState();
    const wt = V40.watchTime()[V40.today()] || 0;
    let action = '';
    if (cur) {
      if (simpleKind(cur) === 'serie') {
        const ne = nextEpisodeOf(cur);
        action = cur.epDates ? `<button class="c-main" data-c="eps">📋 Abrir episódios</button>`
          : (ne >= 0 ? `<button class="c-main" data-c="next">✓ Vi o episódio ${ne + 1}</button>` : '');
      } else action = `<button class="c-main" data-c="done">✓ Terminei</button>`;
    }
    el.innerHTML = `
      <button class="c-close" data-c="close">✕</button>
      <div class="c-label">AGORA</div>
      <div class="c-title">${cur ? V40.esc(V40.cleanName(cur)) : 'Tudo visto! 🎉'}</div>
      ${plan.epsTotal ? `<div class="c-sub">${plan.epsDone} de ${plan.epsTotal} episódios de hoje</div>` : ''}
      ${action}
      <div class="c-timer ${st.running ? 'on' : ''}">${fmtSecs(timerSecs(st))}</div>
      <div class="c-row"><button data-c="timer">${st.running ? '⏸ Pausar' : '▶️ Cronômetro'}</button><button data-c="stop">⏹ Salvar tempo</button></div>
      <div class="c-sub">Hoje: ${fmtSecs(wt + (st.running ? 0 : 0))} assistidos</div>`;
    el.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => {
      const c = b.dataset.c;
      if (c === 'close') { el.remove(); clearInterval(timerInt); timerInt = null; document.body.classList.remove('v40-cinema-on'); return; }
      if (c === 'timer') V40.timerToggle();
      if (c === 'stop') V40.timerStop();
      if (c === 'eps' && cur) { el.remove(); document.body.classList.remove('v40-cinema-on'); showInterleavedModal(cur); }
      if (c === 'next' && cur) {
        if (!V40.guard()) return;
        const ne = nextEpisodeOf(cur);
        if (ne < 0) return;
        const eps = extractEpsCount(cur.text) || 1;
        if (!Array.isArray(cur.epDone)) cur.epDone = new Array(eps).fill(false);
        cur.epDone[ne] = true;
        save(); if (syncSeriesRatings()) save(); render();
        V40.toast(`✓ Episódio ${ne + 1} marcado`);
        updateCinema();
      }
      if (c === 'done' && cur) {
        const row = document.querySelector(`.item[data-id="${cur.id}"] .check`);
        if (row) toggleDone(cur.id, row);
        else { if (!V40.guard()) return; cur.done = true; cur.completedAt = V40.today(); markDoneToday(); save(); render(); }
        updateCinema();
      }
    }));
  }
  V40.openCinema = function () {
    let el = document.getElementById('v40Cinema');
    if (!el) {
      el = document.createElement('div');
      el.id = 'v40Cinema';
      el.className = 'v40-cinema';
      document.body.appendChild(el);
    }
    document.body.classList.add('v40-cinema-on');
    updateCinema();
    clearInterval(timerInt);
    timerInt = setInterval(() => {
      const t = document.querySelector('#v40Cinema .c-timer');
      if (t) t.textContent = fmtSecs(timerSecs(timerState()));
      else { clearInterval(timerInt); timerInt = null; }
    }, 1000);
  };

  // =================== 🎲 SORTEIO ===================
  V40.openDraw = function () {
    const pending = sortItems(items.filter(i => !i.done));
    const focus = pending.filter(V40.isFocusItem);
    const pool = Array.from(new Set(focus.concat(pending.slice(0, 6))));
    if (!pool.length) { V40.toast('🎉 Nada pendente!'); return; }
    V40.modal(`<div class="v40-draw"><div class="lbl">🎲 SORTEANDO…</div><div class="name" id="v40DrawName">…</div><div class="v40-muted" id="v40DrawInfo">Entre o que é de hoje, os atrasados e os próximos ${Math.min(6, pending.length)} da fila.</div><div id="v40DrawBtns"></div></div>`);
    let n = 0;
    const total = V40.settings.battery ? 1 : 18;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const spin = () => {
      const el = document.getElementById('v40DrawName');
      if (!el) return;
      n++;
      const show = n >= total ? pick : pool[Math.floor(Math.random() * pool.length)];
      el.textContent = V40.cleanName(show);
      if (n < total) { setTimeout(spin, 40 + n * 9); return; }
      V40.sound('done');
      document.querySelector('.v40-draw .lbl').textContent = '🎲 O SORTEADO É';
      document.getElementById('v40DrawBtns').innerHTML = '<button class="v40-primary" id="v40DrawGo">Ir até ele</button> <button id="v40DrawAgain">Sortear de novo</button>';
      document.getElementById('v40DrawGo').addEventListener('click', () => {
        closeModal(); switchTabSilent('tabLista');
        V40.view.focus = false; V40.view.sort = null; V40.afterViewChange();
        setTimeout(() => {
          const row = document.querySelector(`.item[data-id="${pick.id}"]`);
          if (row) { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); row.style.outline = '2px solid var(--gold)'; setTimeout(() => { row.style.outline = ''; }, 1600); }
        }, 150);
      });
      document.getElementById('v40DrawAgain').addEventListener('click', V40.openDraw);
    };
    spin();
  };

  // =================== 🎨 TEMAS POR HERÓI ===================
  V40.HERO_THEMES = [
    { id: 'classic', name: '📰 Gibi clássico (padrão)', gold: '#d9a441', crimson: '#b6332c', cobalt: '#2b4c8c' },
    { id: 'ironman', name: '⚙️ Homem de Ferro', gold: '#f2c14e', crimson: '#a4161a', cobalt: '#7a1e1e', hero: 'homem-de-ferro' },
    { id: 'cap', name: '🛡️ Capitão América', gold: '#e8e8e8', crimson: '#c1121f', cobalt: '#1d3c8f', hero: 'vingadores' },
    { id: 'hulk', name: '💚 Hulk', gold: '#9bd35a', crimson: '#6a2c91', cobalt: '#2f6b2f', hero: 'hulk' },
    { id: 'thor', name: '🌩️ Thor', gold: '#9ec9ff', crimson: '#b3202a', cobalt: '#3a4f7a', hero: 'thor' },
    { id: 'spidey', name: '🕷️ Homem-Aranha', gold: '#e63946', crimson: '#c1121f', cobalt: '#1d4ed8', hero: 'homem-aranha' },
    { id: 'panther', name: '🐆 Pantera Negra', gold: '#b388ff', crimson: '#6c3fb5', cobalt: '#2a2a3a', hero: 'pantera-negra' },
    { id: 'strange', name: '🔮 Doutor Estranho', gold: '#ffb347', crimson: '#8b1e3f', cobalt: '#1f4e79', hero: 'doutor-estranho' },
    { id: 'deadpool', name: '🗡️ Deadpool', gold: '#ff4d4d', crimson: '#8b0000', cobalt: '#222222', hero: 'deadpool' },
    { id: 'wolverine', name: '🔪 Wolverine', gold: '#ffd60a', crimson: '#1d3557', cobalt: '#3a5a8c', hero: 'wolverine' },
    { id: 'loki', name: '🐍 Loki', gold: '#c9a227', crimson: '#1b5e20', cobalt: '#2e7d32', hero: 'loki' },
    { id: 'gotg', name: '🌌 Guardiões da Galáxia', gold: '#ff9e00', crimson: '#d62828', cobalt: '#5a189a', hero: 'guardioes' },
    { id: 'widow', name: '🕴️ Viúva Negra', gold: '#e5383b', crimson: '#a4161a', cobalt: '#161a1d', hero: 'viuva-negra' },
    { id: 'xmen', name: '🧬 X-Men', gold: '#ffc300', crimson: '#003566', cobalt: '#001d3d', hero: 'x-men' },
    { id: 'moon', name: '🌙 Cavaleiro da Lua', gold: '#e0e1dd', crimson: '#778da9', cobalt: '#1b263b', hero: 'cavaleiro-da-lua' }
  ];
  V40.applyHeroTheme = function (id) {
    const th = V40.HERO_THEMES.find(x => x.id === id);
    if (!th) return;
    const root = document.documentElement.style;
    root.setProperty('--gold', th.gold);
    root.setProperty('--crimson', th.crimson);
    root.setProperty('--cobalt', th.cobalt);
    root.setProperty('--crimson-dark', th.crimson);
    try { localStorage.setItem('ucm-palette', JSON.stringify({ name: th.name, gold: th.gold, crimson: th.crimson, cobalt: th.cobalt })); } catch (e) {}
    V40.settings.heroTheme = id; V40.saveSettings();
  };
  V40.openThemePicker = function () {
    V40.modal(`<h3>🎨 Tema por herói</h3>
      <div class="v40-theme-grid">${V40.HERO_THEMES.map(th => `<button data-theme="${th.id}" class="${V40.settings.heroTheme === th.id ? 'on' : ''}">
        <span class="sw"><i style="background:${th.gold}"></i><i style="background:${th.crimson}"></i><i style="background:${th.cobalt}"></i></span>${V40.esc(th.name)}</button>`).join('')}</div>`, true);
    document.querySelectorAll('[data-theme]').forEach(b => b.addEventListener('click', () => {
      V40.applyHeroTheme(b.dataset.theme);
      V40.openThemePicker();
      V40.toast('🎨 Tema aplicado');
    }));
  };
  // fundo muda conforme o herói do título do dia
  const HERO_TINT = {};
  V40.HERO_THEMES.forEach(th => { if (th.hero) HERO_TINT[th.hero] = th.crimson; });
  V40.applyHeroBg = function () {
    if (!V40.settings.heroBg) { document.body.style.removeProperty('--v40-tint'); document.body.classList.remove('v40-herobg'); return; }
    const cur = V40.currentItem();
    let color = null;
    if (cur) { try { const g = heroGroupsOf(cur)[0]; if (g) color = HERO_TINT[g.id] || null; } catch (e) {} }
    document.body.classList.toggle('v40-herobg', !!color);
    if (color) document.body.style.setProperty('--v40-tint', color);
  };

  // =================== TOUR DE BOAS-VINDAS ===================
  const TOUR = [
    (window.V40_MODE === 'beta'
      ? ['🧪', 'Bem-vindo à beta', 'Esta é uma cópia separada do app pra testar novidades. Ela tem a gaveta dela: o que você marcar aqui <b>não muda</b> o seu app de verdade.']
      : window.V40_MODE === 'amigo'
        ? ['🍿', 'Bem-vindo à sua lista UCM', 'Todos os filmes e séries da Marvel em ordem cronológica, com cronograma que começou hoje. Tudo fica salvo no seu aparelho.']
        : ['🎉', 'Bem-vindo à v40', 'A maior atualização do app: Liga, novo Início, capas, planejamento, troféus, aba de Pedidos e muito mais. Seu progresso continua o mesmo.']),
    ['🥇', 'Liga UCM', 'Aba nova: campeonato de pontos corridos (nota arredondada = pontos), campeonato de heróis (filmes, séries e geral), mata-mata dos títulos nota 10, duelo e histórico.'],
    ['🏠', 'Início novo', 'Card de hoje com a meta de episódios, nível/XP, sequência, meta do mês, desafio da semana, modo cinema, sorteio, "hoje não vou assistir", modo viagem e simulador.'],
    ['🎬', 'Lista turbinada', 'Toque no nome de um título pra ver os extras (quero rever, coleções, notas detalhadas, cartão do herói, duelo). Deslize pra direita pra marcar como visto. Filtrar ▸ modo foco, ordenar, filtro avançado.'],
    ['⚙️', 'Config', 'Temas por herói, claro/escuro/automático, tamanho da letra, sons, modo bateria, só leitura, layout do início, apelidos dos heróis, lixeira de 30 dias, histórico de versões, verificação de erros e mais. "Adicionar/mover títulos" agora fica aqui.'],
    ['💬', 'Pedidos', 'Aba nova: um assistente que responde dúvidas do app e monta o pedido de bug ou ideia, com as informações do aparelho, pra mandar pro Claude (ou pelo WhatsApp).']
  ];
  V40.openTour = function (i) {
    i = i || 0;
    const s = TOUR[i];
    V40.modal(`<div class="v40-tour"><div class="big">${s[0]}</div><h3>${s[1]}</h3><p>${s[2]}</p>
      <div class="dots">${TOUR.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
      <div style="display:flex;gap:8px;justify-content:center;">${i > 0 ? '<button id="v40TourPrev">‹ Voltar</button>' : ''}<button class="v40-primary" id="v40TourNext">${i < TOUR.length - 1 ? 'Próximo ›' : 'Bora!'}</button></div></div>`);
    const p = document.getElementById('v40TourPrev'); if (p) p.addEventListener('click', () => V40.openTour(i - 1));
    document.getElementById('v40TourNext').addEventListener('click', () => {
      if (i < TOUR.length - 1) V40.openTour(i + 1);
      else { V40.set('tour-done', true); closeModal(); }
    });
  };

  V40.initFun = function () {
    addAchievements();
    // registra o nível atual sem festa na primeira vez
    if (V40.get('last-level', null) === null) V40.set('last-level', V40.levelOf(V40.xp().xp).level);
    // marca os troféus que já valem sem pop-up em cascata na primeira abertura da beta
    if (!V40.get('achv-seeded', false)) {
      try {
        const doneTotal = items.filter(i => i.done).length;
        const cur = ACHIEVEMENTS.filter(a => { try { return a.test(doneTotal, items.length, items); } catch (e) { return false; } }).map(a => a.id);
        localStorage.setItem('ucm-unlocked-achv', JSON.stringify(cur));
      } catch (e) {}
      V40.set('achv-seeded', true);
      // fases que já estavam completas não ganham festa atrasada
      V40.set('phases-celebrated', PHASE_ORDER.filter(ph => { const l = items.filter(i => i.phase === ph); return l.length && l.every(i => i.done); }));
    }
    if (V40.settings.heroTheme) V40.applyHeroTheme(V40.settings.heroTheme);
  };
})();
