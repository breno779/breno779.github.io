/* =====================================================================
 * UCM Watchlist — v40 BETA — 📊 estatísticas novas + 🗓 planejamento
 * ===================================================================== */
(function () {
  'use strict';
  const V40 = window.V40;

  // =================== PLANEJAMENTO ===================

  // recálculo "oficial": o mesmo caminho do app (a partir da âncora da dupla, se ela ainda não
  // terminou); senão, a partir do primeiro pendente.
  V40.recalcAll = function () {
    const usm = items.find(i => i.text.includes('Ultimate Homem-Aranha'));
    if (usm && !usm.done) { recomputeSchedule(usm.id, '2026-09-21'); return; }
    const first = sortItems(items.filter(i => !i.done))[0];
    if (!first) return;
    const t = V40.today();
    const start = first.watchStart && first.watchStart <= t ? first.watchStart : V40.addDays(t, 1);
    recomputeSchedule(first.id, start);
  };
  V40.endDate = function () {
    const pending = items.filter(i => !i.done && i.watchEnd && i.key !== 'k166');
    if (!pending.length) return null;
    return pending.reduce((m, i) => (i.watchEnd > m ? i.watchEnd : m), pending[0].watchEnd);
  };
  // simula o cronograma sem gravar nada: muda o ritmo/pausas só em memória, recalcula, lê a data
  // final e devolve tudo como estava.
  V40.simulate = function (opts) {
    const backup = JSON.stringify(items);
    const realSave = window.save;
    const realPauses = localStorage.getItem('v40-extra-pauses');
    let end = null;
    try {
      window.save = function () {};
      if (opts.rate) window.__v40RateOverride = { from: opts.from || V40.addDays(V40.today(), 1), anim: opts.rate.anim, live: opts.rate.live };
      if (opts.extraPauses) {
        const list = V40.get('extra-pauses', []).concat(opts.extraPauses);
        localStorage.setItem('v40-extra-pauses', JSON.stringify(list));
      }
      V40.recalcAll();
      end = V40.endDate();
    } catch (e) { console.error(e); }
    finally {
      window.__v40RateOverride = null;
      if (opts.extraPauses) {
        if (realPauses === null) localStorage.removeItem('v40-extra-pauses');
        else localStorage.setItem('v40-extra-pauses', realPauses);
      }
      items = JSON.parse(backup);
      window.save = realSave;
    }
    return end;
  };
  V40.currentRate = function () {
    return { anim: v40RateAt(V40.addDays(V40.today(), 1), 'anim'), live: v40RateAt(V40.addDays(V40.today(), 1), 'live') };
  };
  V40.applyAndRecalc = function (msg) {
    const before = V40.endDate();
    V40.recalcAll();
    save(); render();
    const after = V40.endDate();
    V40.toast(`${msg} · término: ${after ? V40.fmtBR(after, true) : '—'}${before && after && before !== after ? ` (antes ${V40.fmtBR(before, true)})` : ''}`);
    V40.logEvent('plan', { name: msg });
  };

  // ---- ⏱ episódios por dia ----
  V40.openRateSettings = function () {
    const cur = V40.currentRate();
    const end = V40.endDate();
    const opt = (n, sel) => `<option value="${n}" ${n === sel ? 'selected' : ''}>${n} por dia</option>`;
    V40.modal(`<h3>⏱ Episódios por dia</h3>
      <p class="v40-muted">Muda o ritmo a partir de <b>amanhã</b> — o que já passou continua igual.</p>
      <div class="v40-form">
        <label>🎨 Animação (inclui a dupla Ultimate + Vingadores) <select id="v40RateAnim">${[1, 2, 3, 4, 5, 6].map(n => opt(n, cur.anim)).join('')}</select></label>
        <label>📺 Live action <select id="v40RateLive">${[1, 2, 3, 4].map(n => opt(n, cur.live)).join('')}</select></label>
      </div>
      <div class="v40-sim" id="v40RatePreview">Término hoje: <b>${end ? V40.fmtBR(end, true) : '—'}</b></div>
      <div style="display:flex;gap:8px;margin-top:10px;"><button id="v40RateApply" class="v40-primary">Aplicar</button></div>
      <p class="v40-muted">Os períodos lentos (prova/GTA, viagem) continuam com o ritmo reduzido deles.</p>`);
    const prev = () => {
      const a = +document.getElementById('v40RateAnim').value, l = +document.getElementById('v40RateLive').value;
      const e = V40.simulate({ rate: { anim: a, live: l } });
      document.getElementById('v40RatePreview').innerHTML = `Término hoje: <b>${end ? V40.fmtBR(end, true) : '—'}</b> → com ${a}/${l} por dia: <b>${e ? V40.fmtBR(e, true) : '—'}</b>`;
    };
    document.getElementById('v40RateAnim').addEventListener('change', prev);
    document.getElementById('v40RateLive').addEventListener('change', prev);
    document.getElementById('v40RateApply').addEventListener('click', () => {
      if (!V40.guard()) return;
      const a = +document.getElementById('v40RateAnim').value, l = +document.getElementById('v40RateLive').value;
      const from = V40.addDays(V40.today(), 1);
      const hist = v40RateHistory().filter(h => h.from < from);
      hist.push({ from, anim: a, live: l });
      V40.set('rate-history', hist);
      closeModal();
      V40.applyAndRecalc(`⏱ Ritmo: ${a} anim / ${l} live por dia`);
    });
  };

  // ---- 🛌 hoje não vou assistir ----
  V40.skipToday = function () {
    if (!V40.guard()) return;
    const t = V40.today();
    const pauses = V40.get('extra-pauses', []);
    if (pauses.some(([a, b]) => t >= a && t <= b)) {
      if (!confirm('Hoje já está como dia de folga. Quer DESFAZER a folga de hoje?')) return;
      V40.set('extra-pauses', pauses.filter(([a, b]) => !(a === t && b === t)));
      V40.applyAndRecalc('↺ Folga de hoje desfeita');
      return;
    }
    const sim = V40.simulate({ extraPauses: [[t, t]] });
    if (!confirm(`Marcar hoje como folga? Tudo de hoje vai pra frente.\nTérmino passa a ser ${sim ? V40.fmtBR(sim, true) : '—'}.`)) return;
    pauses.push([t, t]);
    V40.set('extra-pauses', pauses);
    V40.applyAndRecalc('🛌 Hoje é folga — o cronograma andou 1 dia');
  };

  // ---- ✈️ modo viagem / pausas ----
  V40.openTravel = function () {
    const pauses = V40.get('extra-pauses', []);
    const t = V40.today();
    V40.modal(`<h3>✈️ Modo viagem (pausas)</h3>
      <p class="v40-muted">Escolha o período em que você NÃO vai assistir. O cronograma congela e volta depois.</p>
      <div class="v40-form">
        <label>De <input type="date" id="v40TrStart" value="${V40.addDays(t, 1)}"></label>
        <label>Até <input type="date" id="v40TrEnd" value="${V40.addDays(t, 3)}"></label>
      </div>
      <div class="v40-sim" id="v40TrPrev"></div>
      <button id="v40TrApply" class="v40-primary" style="margin-top:8px;">Pausar esse período</button>
      <h4 style="margin:16px 0 6px;">Pausas suas</h4>
      ${pauses.length ? pauses.map(([a, b], i) => `<div class="v40-row"><span style="flex:1">${V40.fmtBR(a, true)}${a !== b ? ' até ' + V40.fmtBR(b, true) : ''}</span><button data-rmpause="${i}" class="v40-danger">✕</button></div>`).join('') : '<p class="v40-muted">Nenhuma.</p>'}
      <p class="v40-muted">Pausas fixas da lista (férias de outubro e janeiro) continuam valendo.</p>`);
    const prev = () => {
      const a = document.getElementById('v40TrStart').value, b = document.getElementById('v40TrEnd').value;
      if (!a || !b || b < a) { document.getElementById('v40TrPrev').textContent = 'Escolha as duas datas.'; return; }
      const e = V40.simulate({ extraPauses: [[a, b]] });
      document.getElementById('v40TrPrev').innerHTML = `${V40.daysBetween(a, b) + 1} dia(s) de pausa → término <b>${e ? V40.fmtBR(e, true) : '—'}</b> (hoje: ${V40.fmtBR(V40.endDate(), true)})`;
    };
    document.getElementById('v40TrStart').addEventListener('change', prev);
    document.getElementById('v40TrEnd').addEventListener('change', prev);
    prev();
    document.getElementById('v40TrApply').addEventListener('click', () => {
      if (!V40.guard()) return;
      const a = document.getElementById('v40TrStart').value, b = document.getElementById('v40TrEnd').value;
      if (!a || !b || b < a) return;
      if (a < t) { alert('A pausa precisa começar hoje ou depois.'); return; }
      const list = V40.get('extra-pauses', []);
      list.push([a, b]);
      V40.set('extra-pauses', list);
      closeModal();
      V40.applyAndRecalc(`✈️ Pausa de ${V40.fmtBR(a)} a ${V40.fmtBR(b)}`);
    });
    document.querySelectorAll('[data-rmpause]').forEach(btn => btn.addEventListener('click', () => {
      if (!V40.guard()) return;
      const list = V40.get('extra-pauses', []);
      list.splice(+btn.dataset.rmpause, 1);
      V40.set('extra-pauses', list);
      closeModal();
      V40.applyAndRecalc('✈️ Pausa removida');
    }));
  };

  // ---- 🧯 atrasado? ----
  V40.lateInfo = function () {
    const t = V40.today();
    let lateEps = 0, firstLate = null;
    const lateTitles = [];
    items.forEach(it => {
      if (it.done) return;
      if (simpleKind(it) === 'serie') {
        if (!it.watchStart && !it.epDates) return;
        const st = V40.seriesStatus(it, t);
        if (st.late > 0) {
          lateEps += st.late;
          if (st.nextDate && (!firstLate || st.nextDate < firstLate)) firstLate = st.nextDate;
        }
      } else if (it.watchEnd && it.watchEnd < t) {
        lateTitles.push(it);
        if (!firstLate || it.watchStart < firstLate) firstLate = it.watchStart;
      }
    });
    return { lateEps, lateTitles, firstLate };
  };
  V40.openLateHelper = function () {
    const li = V40.lateInfo();
    const t = V40.today();
    if (!li.firstLate) {
      V40.modal('<h3>🧯 Atraso</h3><p>Você está em dia! Nada pra redistribuir. ✅</p>');
      return;
    }
    const days = V40.daysBetween(li.firstLate, t);
    const cur = V40.currentRate();
    const k = Math.max(1, Math.ceil(li.lateEps / 1));
    const pauseRange = [li.firstLate, V40.addDays(t, -1)];
    const endA = V40.simulate({ extraPauses: [pauseRange] });
    V40.modal(`<h3>🧯 Atrasado — como resolver?</h3>
      <p>${li.lateEps ? `<b>${li.lateEps}</b> episódio(s)` : ''}${li.lateEps && li.lateTitles.length ? ' e ' : ''}${li.lateTitles.length ? `<b>${li.lateTitles.length}</b> título(s)` : ''} atrasado(s), desde ${V40.fmtBR(li.firstLate, true)} (${days} dia${days === 1 ? '' : 's'}).</p>
      <button class="v40-pick" id="v40LateA"><b>🔄 Recomeçar de hoje</b><br><small>Os dias perdidos viram folga e tudo anda pra frente. Você fica em dia hoje. Término: ${endA ? V40.fmtBR(endA, true) : '—'}</small></button>
      ${li.lateEps ? `<button class="v40-pick" id="v40LateB"><b>💪 Diluir</b><br><small>+1 episódio de animação por dia nos próximos ${k} dia(s) (${cur.anim + 1}/dia), até zerar o atraso. Término não muda.</small></button>` : ''}
      <button class="v40-pick" id="v40LateC"><b>🙂 Deixar como está</b><br><small>Você recupera no seu tempo.</small></button>`);
    document.getElementById('v40LateA').addEventListener('click', () => {
      if (!V40.guard()) return;
      const list = V40.get('extra-pauses', []);
      list.push(pauseRange);
      V40.set('extra-pauses', list);
      closeModal();
      V40.applyAndRecalc('🔄 Recomeçou de hoje (dias perdidos viraram folga)');
      V40.logEvent('recover', {});
    });
    const b = document.getElementById('v40LateB');
    if (b) b.addEventListener('click', () => {
      if (!V40.guard()) return;
      const from = V40.addDays(t, 1), until = V40.addDays(t, 1 + k);
      const hist = v40RateHistory().filter(h => h.from < from);
      hist.push({ from, anim: cur.anim + 1, live: cur.live });
      hist.push({ from: until, anim: cur.anim, live: cur.live });
      V40.set('rate-history', hist);
      closeModal();
      V40.applyAndRecalc(`💪 +1 ep/dia até ${V40.fmtBR(V40.addDays(until, -1))}`);
    });
    document.getElementById('v40LateC').addEventListener('click', closeModal);
  };

  // ---- 🔮 simulador ----
  V40.openSimulator = function () {
    const cur = V40.currentRate();
    const real = V40.realPace();
    V40.modal(`<h3>🔮 Simulador de data final</h3>
      <p class="v40-muted">Só simula — não muda nada no seu cronograma.</p>
      <div class="v40-form">
        <label>🎨 Animação por dia <input type="range" id="v40SimA" min="1" max="8" value="${cur.anim}"><b id="v40SimAv">${cur.anim}</b></label>
        <label>📺 Live action por dia <input type="range" id="v40SimL" min="1" max="5" value="${cur.live}"><b id="v40SimLv">${cur.live}</b></label>
      </div>
      <div class="v40-sim" id="v40SimOut"></div>
      <div class="stat-card" style="margin-top:10px;">
        <h4>📏 Seu ritmo real (últimos 14 dias)</h4>
        <p style="margin:0;">${real.epsPerDay.toFixed(1)} episódio(s)/dia · ${real.titles} título(s) concluído(s)</p>
        <p class="v40-muted" style="margin:4px 0 0;">${real.end ? `Nesse ritmo, você termina em <b>${V40.fmtBR(real.end, true)}</b>.` : 'Ainda sem dados suficientes (o registro de episódios começou com a v40).'}</p>
      </div>`);
    const upd = () => {
      const a = +document.getElementById('v40SimA').value, l = +document.getElementById('v40SimL').value;
      document.getElementById('v40SimAv').textContent = a;
      document.getElementById('v40SimLv').textContent = l;
      const e = V40.simulate({ rate: { anim: a, live: l } });
      const now = V40.endDate();
      const diff = e && now ? V40.daysBetween(now, e) : 0;
      document.getElementById('v40SimOut').innerHTML = `Com <b>${a}</b> de animação e <b>${l}</b> de live action por dia:<br>término <b>${e ? V40.fmtBR(e, true) : '—'}</b> ${diff ? `(${diff > 0 ? '+' : ''}${diff} dias vs. hoje)` : '(igual ao de hoje)'}`;
    };
    document.getElementById('v40SimA').addEventListener('input', upd);
    document.getElementById('v40SimL').addEventListener('input', upd);
    upd();
  };
  // ritmo real: episódios marcados nos últimos 14 dias (registro da v40)
  V40.realPace = function () {
    const t = V40.today(), from = V40.addDays(t, -13);
    const firstLog = V40.activity.length ? V40.activity[0].d : t;
    const span = Math.max(1, Math.min(14, V40.daysBetween(firstLog > from ? firstLog : from, t) + 1));
    let eps = 0;
    V40.activity.forEach(e => {
      if (e.d < from) return;
      if (e.type === 'ep') eps += e.n || 1;
      if (e.type === 'unep') eps -= e.n || 1;
    });
    const titles = items.filter(i => i.done && i.completedAt && i.completedAt >= from).length;
    const epsPerDay = Math.max(0, eps / span);
    let end = null;
    if (eps >= 3) {
      const r = Math.max(1, Math.round(epsPerDay));
      end = V40.simulate({ rate: { anim: r, live: Math.max(1, Math.min(r, 3)) } });
    }
    return { epsPerDay, titles, end, span };
  };

  // ---- 📅 calendário mensal ----
  V40.calMonth = null;
  V40.dayPlanMap = function () {
    const map = {};
    const add = (d, entry) => { (map[d] = map[d] || []).push(entry); };
    items.forEach(it => {
      if (it.done) return;
      const kind = simpleKind(it);
      if (kind === 'serie' && (it.watchStart || it.epDates)) {
        const eps = extractEpsCount(it.text) || 1;
        const doneCount = Array.isArray(it.epDone) ? it.epDone.filter(Boolean).length : 0;
        for (let e = 0; e < eps; e++) {
          const d = episodeDateFor(it, e, eps);
          if (d) add(d, { it, ep: e + 1, done: e < doneCount });
        }
      } else if (it.watchStart && it.watchEnd) {
        let d = it.watchStart, guard = 0;
        while (d <= it.watchEnd && guard++ < 60) { add(d, { it }); d = V40.addDays(d, 1); }
      }
    });
    items.forEach(it => { if (it.done && it.completedAt) add(it.completedAt, { it, completed: true }); });
    return map;
  };
  V40.openMonthCalendar = function (ym) {
    const t = V40.today();
    V40.calMonth = ym || V40.calMonth || t.slice(0, 7);
    const [y, m] = V40.calMonth.split('-').map(Number);
    const map = V40.dayPlanMap();
    const first = new Date(y, m - 1, 1);
    const days = new Date(y, m, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // segunda = 0
    const names = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<div class="v40-cal-cell empty"></div>';
    for (let d = 1; d <= days; d++) {
      const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const list = map[iso] || [];
      const eps = list.filter(e => e.ep).length;
      const titles = list.filter(e => !e.ep && !e.completed).length;
      const comp = list.filter(e => e.completed).length;
      const pause = (typeof isPauseDay === 'function') && isPauseDay(new Date(iso + 'T12:00:00'));
      const cls = [iso === t ? 'today' : '', iso < t ? 'past' : '', pause ? 'pause' : '', list.length ? 'has' : ''].join(' ');
      cells += `<button class="v40-cal-cell ${cls}" data-day="${iso}"><span class="dn">${d}</span>
        ${titles ? `<span class="dt">🎬${titles > 1 ? titles : ''}</span>` : ''}${eps ? `<span class="de">${eps}ep</span>` : ''}${comp ? '<span class="dc">✓</span>' : ''}${pause && !list.length ? '<span class="dp">💤</span>' : ''}</button>`;
    }
    const prevM = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    const nextM = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    V40.modal(`<h3>📅 ${names[m - 1]} ${y}</h3>
      <div class="v40-cal-nav"><button data-cal="${prevM}">‹ ${names[(m + 10) % 12].slice(0, 3)}</button><button data-cal="${t.slice(0, 7)}">Hoje</button><button data-cal="${nextM}">${names[m % 12].slice(0, 3)} ›</button></div>
      <div class="v40-cal-grid">${['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map(x => `<div class="v40-cal-h">${x}</div>`).join('')}${cells}</div>
      <p class="v40-muted">🎬 filme/título · Nep = episódios · ✓ concluído nesse dia · 💤 pausa. Toque num dia pra ver.</p>
      <div id="v40CalDay"></div>`, true);
    document.querySelectorAll('[data-cal]').forEach(b => b.addEventListener('click', () => V40.openMonthCalendar(b.dataset.cal)));
    document.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => {
      const list = map[b.dataset.day] || [];
      const out = document.getElementById('v40CalDay');
      const grouped = {};
      list.forEach(e => {
        const key = e.it.id + (e.completed ? 'c' : '');
        grouped[key] = grouped[key] || { it: e.it, eps: [], completed: e.completed, done: 0 };
        if (e.ep) { grouped[key].eps.push(e.ep); if (e.done) grouped[key].done++; }
      });
      out.innerHTML = `<h4 style="margin:10px 0 4px;">${V40.fmtBR(b.dataset.day, true)}</h4>` + (Object.values(grouped).map(g => `<div class="v40-row"><span style="flex:1">${g.completed ? '✅ ' : ''}${V40.esc(V40.cleanName(g.it))}${g.eps.length ? ` <small class="v40-muted">ep. ${g.eps.length > 3 ? g.eps[0] + '–' + g.eps[g.eps.length - 1] : g.eps.join(', ')}${g.done ? ` (${g.done} visto${g.done > 1 ? 's' : ''})` : ''}</small>` : ''}</span></div>`).join('') || '<p class="v40-muted">Nada nesse dia.</p>');
      out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }));
  };

  // =================== ESTATÍSTICAS ===================

  function barList(rows, max, fmt) {
    const mx = max || Math.max(1, ...rows.map(r => r.v));
    return rows.map(r => `<div class="v40-bar"><span class="bl">${r.label}</span><span class="bt"><span class="bf" style="width:${Math.max(2, 100 * r.v / mx)}%;${r.color ? 'background:' + r.color : ''}"></span></span><span class="bv">${fmt ? fmt(r.v, r) : r.v}</span></div>`).join('');
  }
  function lineChart(points, opts) {
    // points: [{x:label, y:value}]
    opts = opts || {};
    if (points.length < 2) return '<p class="v40-muted">Precisa de pelo menos 2 meses com nota.</p>';
    const W = 320, H = 140, pl = 26, pr = 8, pt = 10, pb = 22;
    const ys = points.map(p => p.y);
    const minY = opts.minY != null ? opts.minY : Math.floor(Math.min(...ys));
    const maxY = opts.maxY != null ? opts.maxY : Math.ceil(Math.max(...ys));
    const x = i => pl + i * (W - pl - pr) / (points.length - 1);
    const y = v => pt + (1 - (v - minY) / Math.max(0.0001, maxY - minY)) * (H - pt - pb);
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
    const step = Math.ceil(points.length / 6);
    return `<svg class="v40-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${opts.label || 'gráfico'}">
      <line x1="${pl}" x2="${W - pr}" y1="${y(maxY)}" y2="${y(maxY)}" class="grid"/><line x1="${pl}" x2="${W - pr}" y1="${y(minY)}" y2="${y(minY)}" class="grid"/>
      <text x="2" y="${y(maxY) + 4}" class="ax">${maxY}</text><text x="2" y="${y(minY) + 4}" class="ax">${minY}</text>
      <path d="${d}" class="line"/>
      ${points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="3"><title>${p.x}: ${p.y.toFixed(1)}${p.n ? ' (' + p.n + ')' : ''}</title></circle>`).join('')}
      ${points.map((p, i) => i % step === 0 || i === points.length - 1 ? `<text x="${x(i).toFixed(1)}" y="${H - 6}" class="ax" text-anchor="${i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}">${p.x}</text>` : '').join('')}
    </svg>`;
  }
  function epBarsSvg(vals) {
    const W = 320, H = 110, pb = 16;
    const n = vals.length;
    const bw = (W - 10) / n;
    const bars = vals.map((v, i) => {
      if (typeof v !== 'number') return `<rect x="${5 + i * bw}" y="${H - pb - 2}" width="${Math.max(1, bw - 1)}" height="2" class="nob"/>`;
      const h = (v / 10) * (H - pb - 8);
      return `<rect x="${(5 + i * bw).toFixed(1)}" y="${(H - pb - h).toFixed(1)}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${h.toFixed(1)}" class="${v >= 9 ? 'hi' : v < 6 ? 'lo' : ''}"><title>Ep. ${i + 1}: ${v}</title></rect>`;
    }).join('');
    return `<svg class="v40-chart bars" viewBox="0 0 ${W} ${H}" role="img" aria-label="nota por episódio">${bars}<text x="5" y="${H - 3}" class="ax">ep. 1</text><text x="${W - 5}" y="${H - 3}" class="ax" text-anchor="end">ep. ${n}</text></svg>`;
  }

  V40.statsSeries = V40.get('stats-series', null);
  V40.renderStatsExtra = function () {
    const page = document.getElementById('tabEstatisticas');
    if (!page) return;
    let box = document.getElementById('v40StatsExtra');
    if (box) box.remove();
    box = document.createElement('div');
    box.id = 'v40StatsExtra';
    page.appendChild(box);

    const t = V40.today();
    const done = items.filter(i => i.done);
    const totalEps = items.reduce((s, it) => s + (Array.isArray(it.epDone) ? it.epDone.filter(Boolean).length : 0), 0);
    let hoursLeft = 0;
    items.filter(i => !i.done).forEach(it => {
      const k = it.watchKind || scheduleKind(it);
      if (k === 'jogo') { hoursLeft += HOURS_PER.jogo; return; }
      if (isShortItem(it.text)) { hoursLeft += 0.33; return; }
      const eps = extractEpsCount(it.text) || 1;
      const doneEps = Array.isArray(it.epDone) ? it.epDone.filter(Boolean).length : 0;
      hoursLeft += Math.max(0, eps - doneEps) * (HOURS_PER[k] || 1);
    });
    const end = V40.endDate();
    const daysLeft = end ? V40.daysBetween(t, end) : null;
    const nonstop = hoursLeft / 24;
    const pace = V40.realPace();

    // ranking de títulos
    const table = V40.leagueTable();
    const top = table.slice(0, 10);
    const bottom = table.slice(-5).reverse();

    // evolução das notas por mês (pela data de conclusão)
    const byMonth = {};
    done.forEach(it => {
      if (!it.completedAt || !(it.rating > 0) || simpleKind(it) === 'jogo') return;
      const k = it.completedAt.slice(0, 7);
      byMonth[k] = byMonth[k] || { s: 0, n: 0 };
      byMonth[k].s += it.rating; byMonth[k].n++;
    });
    const monthPts = Object.keys(byMonth).sort().map(k => ({ x: k.slice(5) + '/' + k.slice(2, 4), y: byMonth[k].s / byMonth[k].n, n: byMonth[k].n }));

    // notas por episódio
    const seriesWithEp = items.filter(it => seriesHasEpRatings(it));
    if (!V40.statsSeries || !seriesWithEp.some(s => s.id === V40.statsSeries)) V40.statsSeries = seriesWithEp[0] ? seriesWithEp[0].id : null;
    const selSeries = seriesWithEp.find(s => s.id === V40.statsSeries);

    // notas detalhadas
    const subs = items.filter(i => i.subRatings);
    const subAvg = V40.SUB_KEYS.map(([k, label]) => {
      const vals = subs.map(i => i.subRatings[k]).filter(v => typeof v === 'number');
      return { label, v: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0, n: vals.length };
    });

    // atividade (mapa de calor + dia da semana)
    const act = V40.activityByDay();
    const weekday = [0, 0, 0, 0, 0, 0, 0];
    Object.keys(act).forEach(d => {
      const w = (new Date(d + 'T12:00:00').getDay() + 6) % 7;
      weekday[w] += (act[d].titles || 0) + (act[d].eps || 0) + (act[d].marked ? 1 : 0);
    });
    const wdNames = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
    const bestWd = weekday.indexOf(Math.max(...weekday));

    // heróis
    const heroRanked = V40.heroTable(V40.heroLeague(), 'geral');
    const loved = heroRanked.slice(0, 3);
    const hated = heroRanked.slice(-3).reverse().filter(x => !loved.includes(x));

    // animação x live action
    const rated = V40.participants().filter(p => p.rating > 0);
    const anim = rated.filter(p => p.anim), live = rated.filter(p => !p.anim);
    const avg = l => l.length ? l.reduce((s, p) => s + p.rating, 0) / l.length : 0;

    // fases
    const phaseRows = PHASE_ORDER.map(ph => {
      const list = items.filter(i => i.phase === ph);
      const r = list.filter(i => i.done && i.rating > 0 && simpleKind(i) !== 'jogo');
      return {
        ph,
        pct: list.length ? Math.round(100 * list.filter(i => i.done).length / list.length) : 0,
        avg: r.length ? r.reduce((s, i) => s + i.rating, 0) / r.length : null
      };
    });

    box.innerHTML = `
      <h2 class="v40-page-title" style="margin-top:22px;">✨ Novidades da v40</h2>
      <div class="stat-card">
        <h4>⏳ Quanto falta</h4>
        <div class="stat-grid">
          <div class="stat-box"><div class="num">${Math.round(hoursLeft)}h</div><div class="lbl">DE CONTEÚDO</div></div>
          <div class="stat-box"><div class="num">${daysLeft != null ? daysLeft : '—'}</div><div class="lbl">DIAS NO CRONOGRAMA</div></div>
          <div class="stat-box"><div class="num">${totalEps}</div><div class="lbl">EPISÓDIOS JÁ VISTOS</div></div>
          <div class="stat-box"><div class="num">${pace.epsPerDay.toFixed(1)}</div><div class="lbl">EPS/DIA (ÚLT. ${pace.span} DIA${pace.span === 1 ? '' : 'S'})</div></div>
        </div>
        <p class="v40-muted" style="margin:10px 0 0;">Tudo que falta, sem parar nem pra dormir: <b>${Math.floor(nonstop)} dias e ${Math.round((nonstop % 1) * 24)} horas</b> seguidos.${end ? ` Término planejado: <b>${V40.fmtBR(end, true)}</b>.` : ''}${pace.end ? ` No seu ritmo real: <b>${V40.fmtBR(pace.end, true)}</b>.` : ''}</p>
        <div class="dash-actions" style="margin:10px 0 0;"><button id="v40StSim">🔮 Simulador</button><button id="v40StWrapped">🎁 Retrospectiva ${t.slice(0, 4)}</button></div>
      </div>

      <div class="stat-card">
        <h4>🏅 Ranking de todos os títulos</h4>
        ${top.length ? `<p class="v40-muted" style="margin-top:-4px;">Top 10</p>${top.map(p => `<div class="v40-row"><span class="v40-pos">${p.pos}º</span><span style="flex:1">${p.icon} ${V40.esc(p.name)}</span><b>${V40.fmt1(p.rating)}</b></div>`).join('')}
        ${table.length > 10 ? `<p class="v40-muted">Lanterna</p>${bottom.map(p => `<div class="v40-row"><span class="v40-pos">${p.pos}º</span><span style="flex:1">${p.icon} ${V40.esc(p.name)}</span><b>${V40.fmt1(p.rating)}</b></div>`).join('')}` : ''}
        <button class="v40-link" id="v40StLiga">Ver a tabela completa na 🥇 Liga ›</button>` : '<p class="v40-muted">Sem notas ainda.</p>'}
      </div>

      <div class="stat-card">
        <h4>📈 Suas notas ao longo do tempo</h4>
        <p class="v40-muted" style="margin-top:-4px;">Média das notas por mês em que você concluiu o título.</p>
        ${lineChart(monthPts, { minY: 0, maxY: 10, label: 'média por mês' })}
      </div>

      <div class="stat-card">
        <h4>🎞 Nota de cada episódio</h4>
        ${seriesWithEp.length ? `<select id="v40StSeries" class="v40-select">${seriesWithEp.map(s => `<option value="${s.id}" ${s.id === V40.statsSeries ? 'selected' : ''}>${V40.esc(V40.cleanName(s))}</option>`).join('')}</select>
          ${selSeries ? epBarsSvg((selSeries.epRatings || []).concat(new Array(Math.max(0, (extractEpsCount(selSeries.text) || 0) - (selSeries.epRatings || []).length)).fill(null))) + `<p class="v40-muted" style="margin:4px 0 0;">Média: <b>${V40.fmt1(epRatingAvg(selSeries))}</b> · verde ≥ 9 · vermelho &lt; 6 · traço = sem nota</p>` : ''}` : '<p class="v40-muted">Nenhuma série com nota por episódio ainda.</p>'}
      </div>

      <div class="stat-card">
        <h4>🎯 Notas detalhadas (média)</h4>
        ${subs.length ? barList(subAvg.map(s => ({ label: s.label, v: s.v, n: s.n })), 10, (v, r) => r.n ? v.toFixed(1) : '—') + `<p class="v40-muted" style="margin:6px 0 0;">${subs.length} título(s) com notas detalhadas. Pra dar: toque no nome do título na Lista ▸ 🎯.</p>` : '<p class="v40-muted">Ainda nenhuma. Toque no nome de um título na Lista ▸ 🎯 Notas detalhadas (roteiro, ação, emoção).</p>'}
      </div>

      <div class="stat-card">
        <h4>🔥 Mapa de calor (últimas 26 semanas)</h4>
        ${heatmapHtml(act)}
        <p class="v40-muted" style="margin:6px 0 0;">Dia mais ativo: <b>${weekday.some(v => v) ? wdNames[bestWd] : '—'}</b>. Episódios contam a partir da v40; títulos contam desde sempre.</p>
        ${barList(wdNames.map((n, i) => ({ label: n.slice(0, 3), v: weekday[i] })))}
      </div>

      <div class="stat-card">
        <h4>💘 Heróis que você mais ama</h4>
        ${loved.map(x => `<div class="v40-row v40-tap" data-herocard="${x.r.g.id}"><span class="v40-pos">${x.pos}º</span><span style="flex:1">${x.r.g.emoji} ${V40.esc(x.r.g.label)}</span><b>${V40.fmt1(x.val)}</b></div>`).join('') || '<p class="v40-muted">—</p>'}
        <h4 style="margin-top:12px;">💔 …e os que menos curte</h4>
        ${hated.map(x => `<div class="v40-row v40-tap" data-herocard="${x.r.g.id}"><span class="v40-pos">${x.pos}º</span><span style="flex:1">${x.r.g.emoji} ${V40.esc(x.r.g.label)}</span><b>${V40.fmt1(x.val)}</b></div>`).join('') || '<p class="v40-muted">—</p>'}
      </div>

      <div class="stat-card">
        <h4>🎨 Animação x 🎬 Live action</h4>
        ${barList([{ label: '🎨 Animação', v: avg(anim), n: anim.length, color: 'var(--cobalt)' }, { label: '🎬 Live action', v: avg(live), n: live.length, color: 'var(--crimson)' }], 10, (v, r) => r.n ? `${v.toFixed(1)} <small>(${r.n})</small>` : '—')}
        <p class="v40-muted" style="margin:6px 0 0;">${anim.length && live.length ? (Math.abs(avg(anim) - avg(live)) < 0.15 ? 'Empate técnico entre os dois.' : `Você dá nota maior pra <b>${avg(anim) > avg(live) ? 'animação' : 'live action'}</b> (+${Math.abs(avg(anim) - avg(live)).toFixed(1)}).`) : ''}</p>
      </div>

      <div class="stat-card">
        <h4>🗂 Comparar fases</h4>
        ${phaseRows.map(r => `<div class="v40-phase-cmp"><span class="pn">${V40.esc(r.ph.length > 30 ? r.ph.slice(0, 28) + '…' : r.ph)}</span><span class="bt"><span class="bf" style="width:${r.pct}%"></span></span><span class="pp">${r.pct}%</span><b>${r.avg != null ? V40.fmt1(r.avg) : '—'}</b></div>`).join('')}
        <p class="v40-muted" style="margin:6px 0 0;">Barra = quanto da fase você já viu · número = média das suas notas nela.</p>
      </div>`;

    const go = document.getElementById('v40StLiga');
    if (go) go.addEventListener('click', () => { V40.ligaTab = 'titulos'; V40.set('liga-tab', 'titulos'); switchTab('tabLiga'); });
    document.getElementById('v40StSim').addEventListener('click', V40.openSimulator);
    document.getElementById('v40StWrapped').addEventListener('click', () => V40.openWrapped());
    const ss = document.getElementById('v40StSeries');
    if (ss) ss.addEventListener('change', () => { V40.statsSeries = +ss.value; V40.set('stats-series', V40.statsSeries); V40.renderStatsExtra(); });
    box.querySelectorAll('[data-herocard]').forEach(r => r.addEventListener('click', () => V40.openHeroCard(r.dataset.herocard)));
  };

  function heatmapHtml(act) {
    const t = V40.today();
    const weeks = 26;
    // começa numa segunda-feira, 26 semanas atrás
    const todayD = new Date(t + 'T12:00:00');
    const dow = (todayD.getDay() + 6) % 7;
    const start = V40.addDays(t, -dow - (weeks - 1) * 7);
    let cols = '';
    for (let w = 0; w < weeks; w++) {
      let cells = '';
      for (let d = 0; d < 7; d++) {
        const iso = V40.addDays(start, w * 7 + d);
        if (iso > t) { cells += '<i class="fut"></i>'; continue; }
        const a = act[iso];
        const v = a ? (a.titles || 0) * 3 + (a.eps || 0) + (a.marked && !a.titles && !a.eps ? 1 : 0) : 0;
        const lvl = v === 0 ? 0 : v <= 1 ? 1 : v <= 3 ? 2 : v <= 6 ? 3 : 4;
        cells += `<i class="l${lvl}" title="${V40.fmtBR(iso, true)}: ${a ? `${a.titles || 0} título(s), ${a.eps || 0} ep.` : 'nada'}"></i>`;
      }
      cols += `<span class="hm-col">${cells}</span>`;
    }
    return `<div class="v40-heatmap">${cols}</div><div class="v40-hm-legend">menos <i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i> mais</div>`;
  }

  // ---- 🎁 retrospectiva do ano ----
  V40.openWrapped = function (year) {
    year = year || V40.today().slice(0, 4);
    const doneY = items.filter(i => i.done && i.completedAt && i.completedAt.startsWith(year));
    const ratedY = doneY.filter(i => i.rating > 0 && simpleKind(i) !== 'jogo').sort((a, b) => b.rating - a.rating);
    const epsY = V40.activity.filter(e => e.d.startsWith(year)).reduce((s, e) => s + (e.type === 'ep' ? (e.n || 1) : e.type === 'unep' ? -(e.n || 1) : 0), 0);
    let hours = 0;
    doneY.forEach(it => {
      const k = it.watchKind || scheduleKind(it);
      if (k === 'jogo') { hours += HOURS_PER.jogo; return; }
      if (isShortItem(it.text)) { hours += 0.33; return; }
      const eps = extractEpsCount(it.text) || 1;
      hours += eps * (HOURS_PER[k] || HOURS_PER.anim || 1);
    });
    const heroCount = {};
    doneY.forEach(it => { try { heroGroupsOf(it).forEach(g => { heroCount[g.id] = (heroCount[g.id] || 0) + 1; }); } catch (e) {} });
    const favHeroId = Object.keys(heroCount).sort((a, b) => heroCount[b] - heroCount[a])[0];
    const favHero = HERO_GROUPS.find(g => g.id === favHeroId);
    const months = {};
    doneY.forEach(i => { const m = i.completedAt.slice(5, 7); months[m] = (months[m] || 0) + 1; });
    const bestMonth = Object.keys(months).sort((a, b) => months[b] - months[a])[0];
    const mn = ['', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const ko = V40.get('knockout', null);
    let koChamp = null;
    if (ko && ko.champion) { const p = V40.participants().find(x => x.pid === ko.champion); koChamp = p ? p.name : null; }
    V40.modal(`<div class="v40-wrapped">
      <div class="w-head">🎁 SUA RETROSPECTIVA<br><span>${year}</span></div>
      <div class="w-grid">
        <div><b>${doneY.length}</b><small>títulos concluídos</small></div>
        <div><b>${Math.round(hours)}h</b><small>de Marvel</small></div>
        <div><b>${Math.max(0, epsY)}</b><small>episódios marcados*</small></div>
        <div><b>${V40.bestStreak()}</b><small>dias seguidos (recorde)</small></div>
      </div>
      ${favHero ? `<div class="w-line">🦸 Herói que você mais viu: <b>${favHero.emoji} ${V40.esc(favHero.label)}</b> (${heroCount[favHeroId]})</div>` : ''}
      ${bestMonth ? `<div class="w-line">📆 Mês mais forte: <b>${mn[+bestMonth]}</b> (${months[bestMonth]} títulos)</div>` : ''}
      ${koChamp ? `<div class="w-line">👑 Seu verdadeiro 10: <b>${V40.esc(koChamp)}</b></div>` : ''}
      ${ratedY.length ? `<div class="w-line">🏆 Top 5 do ano:</div>${ratedY.slice(0, 5).map((i, n) => `<div class="w-top"><span>${n + 1}.</span> ${V40.esc(V40.cleanName(i))} <b>${V40.fmt1(i.rating)}</b></div>`).join('')}` : ''}
      <p class="v40-muted" style="margin-top:10px;">* episódios contam desde que a v40 começou a registrar.</p>
    </div>`);
    V40.confetti(false);
  };
})();
