/* =====================================================================
 * UCM Watchlist — v40.6 — extras
 *  - 🗺 linha do tempo interativa
 *  - 🎤 marcar / buscar por voz
 *  - 📲 atalhos na tela inicial (iPhone/iPad) + ações por link
 *  - 👥 você × público (suas notas contra a nota do TMDB)
 *  - ⚽ seleção do campeonato (o time ideal da Liga)
 *  - 🔔 notificações do app Android
 *  - 🧹 faxina do Início e lista compacta
 * ===================================================================== */
(function () {
  'use strict';
  const V40 = window.V40;

  // =================== 🗺 LINHA DO TEMPO ===================
  V40.openTimeline = function () {
    const cur = V40.currentItem && V40.currentItem();
    const phases = PHASE_ORDER.filter(ph => items.some(i => i.phase === ph));
    const cols = phases.map(ph => {
      const list = sortItems(items.filter(i => i.phase === ph));
      const done = list.filter(i => i.done).length;
      return `<div class="v40-tl-col">
        <div class="v40-tl-ph"><b>${V40.esc(ph.split('(')[0].trim())}</b><small>${done}/${list.length}</small></div>
        <div class="v40-tl-items">${list.map(it => {
          const p = V40.posterUrl ? V40.posterUrl(it, 'w92') : null;
          const here = cur && cur.id === it.id;
          return `<button class="v40-tl-it ${it.done ? 'done' : ''} ${here ? 'here' : ''}" data-tl="${it.id}" title="${V40.esc(V40.cleanName(it))}">
            ${p ? `<img src="${p}" alt="" loading="lazy" onerror="this.remove()">` : `<span class="ph">${V40.kindIcon(it)}</span>`}
            <span class="nm">${V40.esc(V40.shortName(it))}</span>${here ? '<span class="v40-tl-here">📍 você está aqui</span>' : ''}
          </button>`;
        }).join('')}</div></div>`;
    }).join('');
    V40.modal(`<h3>🗺 Linha do tempo do UCM</h3>
      <p class="v40-muted" style="margin-top:-6px;">Da história mais antiga até a mais recente. Colorido = já visto · 📍 = onde você está. Deslize pro lado e toque num título pra ver a ficha.</p>
      <div class="v40-tl" id="v40Tl">${cols}</div>`, true);
    const box = document.getElementById('v40Tl');
    const here = box && box.querySelector('.v40-tl-it.here');
    if (here) setTimeout(() => { const col = here.closest('.v40-tl-col'); box.scrollLeft = Math.max(0, col.offsetLeft - 20); here.scrollIntoView({ block: 'center', inline: 'nearest' }); }, 60);
    box && box.querySelectorAll('[data-tl]').forEach(b => b.addEventListener('click', () => {
      const it = items.find(i => i.id === +b.dataset.tl);
      if (it && V40.openInfo) V40.openInfo(it);
    }));
  };

  // =================== 🎤 VOZ ===================
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  V40.voiceSupported = !!SR;
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  function findItem(q) {
    const nq = norm(q);
    if (!nq) return null;
    let best = null, bestScore = 0;
    const words = nq.split(' ').filter(w => w.length > 1);
    items.forEach(it => {
      const names = [V40.cleanName(it), V40.shortName(it), (V40.catOf && V40.catOf(it) || {}).en].filter(Boolean).map(norm);
      names.forEach(n => {
        let sc = 0;
        if (n === nq) sc = 100;
        else if (n.includes(nq)) sc = 60 + nq.length;
        else sc = words.filter(w => n.includes(w)).length * 10;
        if (!it.done) sc += 1;
        if (sc > bestScore) { bestScore = sc; best = it; }
      });
    });
    return bestScore >= 10 ? best : null;
  }
  V40.voiceCommand = function (text) {
    const t = norm(text);
    const m = /^(marcar|marca|marque|vi|assisti|terminei)( o| a| os| as)? (.+)$/.exec(t);
    if (m) {
      let q = m[3], ep = null;
      const em = /(.*?) (episodio|ep) (\d+)$/.exec(q);
      if (em) { q = em[1]; ep = +em[3]; }
      const it = findItem(q);
      if (!it) { V40.toast('🎤 Não achei "' + q + '"'); return; }
      const nm = V40.cleanName(it);
      if (ep && simpleKind(it) === 'serie') {
        const eps = extractEpsCount(it.text) || 1;
        if (ep < 1 || ep > eps) { V40.toast(`🎤 ${nm} tem ${eps} episódios`); return; }
        if (!confirm(`🎤 Marcar o episódio ${ep} de "${nm}"?`)) return;
        if (!V40.guard()) return;
        if (!Array.isArray(it.epDone)) it.epDone = new Array(eps).fill(false);
        it.epDone[ep - 1] = true;
        save(); render();
        V40.toast(`✓ ${nm} — episódio ${ep}`);
        return;
      }
      if (it.done) { V40.toast(`🎤 "${nm}" já está marcado`); return; }
      if (!confirm(`🎤 Marcar "${nm}" como visto?`)) return;
      const row = document.querySelector(`.item[data-id="${it.id}"] .check`);
      toggleDone(it.id, row);
      return;
    }
    // senão: vira busca na lista
    const inp = document.getElementById('searchInput');
    if (inp) { switchTab('tabLista'); inp.value = text; inp.dispatchEvent(new Event('input')); document.getElementById('searchWrap') && document.getElementById('searchWrap').classList.add('open'); }
  };
  V40.listenVoice = function () {
    if (!SR) { alert('Este navegador não tem reconhecimento de voz. No iPhone/iPad, use o Safari; no Android, o Chrome ou o app.'); return; }
    const rec = new SR();
    rec.lang = 'pt-BR'; rec.interimResults = false; rec.maxAlternatives = 1;
    V40.toast('🎤 Fale: "marcar Loki T1" ou "marcar Demolidor episódio 3" (ou o nome pra buscar)');
    rec.onresult = e => { const txt = e.results[0][0].transcript; V40.toast('🎤 "' + txt + '"'); V40.voiceCommand(txt); };
    rec.onerror = e => { if (e.error !== 'aborted' && e.error !== 'no-speech') V40.toast('🎤 Não deu pra ouvir (' + e.error + ')'); };
    try { rec.start(); } catch (e) {}
  };
  function addVoiceButton() {
    const wrap = document.getElementById('searchWrap');
    if (!wrap || document.getElementById('v40VoiceBtn')) return;
    const b = document.createElement('button');
    b.id = 'v40VoiceBtn';
    b.className = 'search-icon-btn';
    b.title = 'Marcar ou buscar por voz';
    b.style.cssText = 'display:flex;align-items:center;justify-content:center;';
    b.textContent = '🎤';
    b.addEventListener('click', V40.listenVoice);
    const inp = document.getElementById('searchToggleBtn');
    wrap.insertBefore(b, inp);
  }

  // =================== 📲 ATALHOS ===================
  const SITE = 'https://breno779.github.io/';
  const SHORTCUTS = [
    ['📅', 'Hoje (o que ver agora)', '?a=hoje'],
    ['🎬', 'Assistindo agora', '?a=cinema'],
    ['⚽', 'Jogar a rodada da Liga', '?a=jogos'],
    ['🗺', 'Linha do tempo', '?a=linha'],
    ['🎲', 'Sorteio', '?a=sorteio']
  ];
  V40.openShortcuts = function () {
    V40.modal(`<h3>📲 Atalhos na tela inicial</h3>
      <p class="v40-muted">No iPhone/iPad não existe widget pra app feito como site, mas dá pra ter <b>ícones que já abrem direto</b> numa tela do app:</p>
      ${SHORTCUTS.map(([ic, nm, q]) => `<div class="v40-row"><span style="flex:1">${ic} <b>${nm}</b><br><small class="v40-muted">${SITE}${q}</small></span><button data-sccopy="${SITE}${q}">📋 Copiar</button><a class="v40-link" href="${SITE}${q}" target="_blank" rel="noopener">Abrir</a></div>`).join('')}
      <h4 style="margin:10px 0 4px;">Como pôr na tela inicial</h4>
      <ol class="v40-steps">
        <li>Toque em <b>Abrir</b> no atalho que você quer (abre no Safari).</li>
        <li>Toque em <b>Compartilhar</b> (quadrado com seta) ▸ <b>Adicionar à Tela de Início</b>.</li>
        <li>Dê um nome (ex.: "Liga") e pronto: o ícone já abre direto naquela tela.</li>
      </ol>
      <p class="v40-muted">Alternativa: no app <b>Atalhos</b> do iPhone, crie um atalho "Abrir URL" com o link copiado — dá pra até chamar pela Siri ("E aí Siri, jogar a Liga").</p>
      <p class="v40-muted">No app Android, segure o ícone do app pra ver os atalhos.</p>`);
    document.querySelectorAll('[data-sccopy]').forEach(b => b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(b.dataset.sccopy); V40.toast('📋 Link copiado'); } catch (e) { prompt('Copie o link:', b.dataset.sccopy); }
    }));
  };
  // ações por link (?a=...) que a v40.6 adicionou
  const origUrl = V40.handleUrlActions;
  V40.handleUrlActions = function () {
    if (origUrl) origUrl();
    let act = null;
    try { act = new URLSearchParams(location.search).get('a'); } catch (e) {}
    if (act === 'jogos') { V40.ligaTab = 'jogos'; V40.set('liga-tab', 'jogos'); switchTab('tabLiga'); }
    if (act === 'linha') setTimeout(V40.openTimeline, 400);
  };

  // =================== 👥 VOCÊ × PÚBLICO ===================
  V40.publicCompare = function () {
    const rows = [];
    items.forEach(it => {
      const my = V40.effRating ? V40.effRating(it) : (it.rating || 0);
      const info = V40.extInfo ? V40.extInfo(it) : null;
      const pub = info && (info.vote || info.ratingTv);
      if (!(my > 0) || !pub) return;
      rows.push({ it, my, pub, d: my - pub });
    });
    return rows;
  };
  function publicCard() {
    const rows = V40.publicCompare();
    if (rows.length < 3) return `<div class="stat-card" id="v40PubCard"><h4>👥 Você × público</h4><p class="v40-muted">Aparece quando tiver pelo menos 3 títulos com nota sua e nota do público (TMDB) — precisa dos dados de fora.</p></div>`;
    const avgD = rows.reduce((s, r) => s + r.d, 0) / rows.length;
    const above = rows.slice().sort((a, b) => b.d - a.d).slice(0, 5);
    const below = rows.slice().sort((a, b) => a.d - b.d).slice(0, 5).filter(r => r.d < 0);
    const close = rows.filter(r => Math.abs(r.d) <= 0.5).length;
    const line = r => `<div class="v40-row"><span style="flex:1">${V40.kindIcon(r.it)} ${V40.esc(V40.shortName(r.it))}</span><span class="v40-muted">você <b>${V40.fmt1(r.my)}</b> · público ${V40.fmt1(r.pub)}</span><b class="${r.d >= 0 ? 'v40-up-d' : 'v40-down-d'}">${r.d >= 0 ? '+' : ''}${V40.fmt1(r.d)}</b></div>`;
    return `<div class="stat-card" id="v40PubCard"><h4>👥 Você × público</h4>
      <p>Em média você dá <b>${avgD >= 0 ? '+' : ''}${V40.fmt1(avgD)}</b> ${avgD >= 0 ? 'a mais' : 'a menos'} que o público, em ${rows.length} títulos. Em ${close} você concorda (diferença de até 0,5).</p>
      <h4 style="margin:8px 0 2px;">❤️ Você gostou mais que todo mundo</h4>${above.map(line).join('')}
      ${below.length ? `<h4 style="margin:8px 0 2px;">🧊 Você gostou menos</h4>${below.map(line).join('')}` : ''}
      <p class="v40-muted" style="margin:6px 0 0;">Nota do público: TMDB (ou TVmaze pras séries sem TMDB).</p></div>`;
  }
  const origSwitch = window.switchTab;
  window.switchTab = function (name) {
    const r = origSwitch.apply(this, arguments);
    if (name === 'tabEstatisticas') setTimeout(() => {
      const page = document.getElementById('tabEstatisticas');
      if (!page) return;
      const old = document.getElementById('v40PubCard');
      if (old) old.remove();
      page.insertAdjacentHTML('beforeend', publicCard());
    }, 0);
    if (name === 'tabLista') addVoiceButton();
    return r;
  };

  // =================== ⚽ SELEÇÃO DO CAMPEONATO ===================
  // o time ideal: os 11 mais bem colocados da Liga, no máximo 1 por franquia/série, num 4-3-3
  V40.selecaoHtml = function (table) {
    if (!table || table.length < 11 || !table.some(t => t.J > 0)) return '<div class="stat-card"><h4>⚽ Seleção do campeonato</h4><p class="v40-muted">Aparece quando a Liga tiver pelo menos 11 times e jogos disputados: os 11 melhores colocados, no máximo 1 por franquia.</p></div>';
    const used = new Set();
    const xi = [];
    for (const t of table) {
      const f = t.franchise ? t.franchise.id : t.pid;
      if (used.has(f)) continue;
      used.add(f); xi.push(t);
      if (xi.length === 11) break;
    }
    if (xi.length < 11) return '';
    const card = (t, role) => `<div class="v40-sel-p">${t.poster ? `<img src="${t.poster}" alt="" onerror="this.remove()">` : `<span class="ph">${t.icon}</span>`}<b>${V40.esc(t.name)}</b><small>${role} · ${t.pos}º</small></div>`;
    // 1º = artilheiro (ataque), 2º-3º ataque, 4º-6º meio, 7º-10º defesa, 11º goleiro
    const atk = xi.slice(0, 3), mid = xi.slice(3, 6), def = xi.slice(6, 10), gk = xi[10];
    return `<div class="stat-card"><h4>⚽ Seleção do campeonato</h4>
      <p class="v40-muted" style="margin-top:-4px;">Os 11 mais bem colocados, no máximo 1 por franquia/série, no 4-3-3.</p>
      <div class="v40-sel">
        <div class="v40-sel-line">${atk.map(t => card(t, 'ATA')).join('')}</div>
        <div class="v40-sel-line">${mid.map(t => card(t, 'MEI')).join('')}</div>
        <div class="v40-sel-line">${def.map(t => card(t, 'ZAG')).join('')}</div>
        <div class="v40-sel-line">${card(gk, 'GOL')}</div>
      </div></div>`;
  };

  // =================== 🔔 NOTIFICAÇÕES (APP ANDROID) ===================
  const app = () => { try { return window.UCMApp || (window.parent && window.parent.UCMApp) || null; } catch (e) { return null; } };
  V40.notifSupported = () => { const a = app(); return !!(a && typeof a.setNotifications === 'function'); };
  function dayText(d) {
    const p = V40.todayPlan(d);
    const parts = [];
    if (p.epsTotal) parts.push(`${p.epsTotal} episódio${p.epsTotal > 1 ? 's' : ''}`);
    p.titles.filter(x => !x.done).forEach(x => parts.push(V40.shortName(x.it)));
    let txt = parts.length ? '📺 Hoje: ' + parts.join(' + ') : '😴 Nada programado hoje';
    try {
      if (V40.ligaDaily) { const dl = V40.ligaDaily(); if (dl.size) txt += ` · ⚽ ${dl.size} jogos da Liga`; }
    } catch (e) {}
    return txt;
  }
  V40.refreshNotifications = function () {
    const a = app();
    const cfg = V40.get('notif', { on: false, time: '19:00' });
    if (!a || typeof a.setNotifications !== 'function') return;
    const texts = {};
    if (cfg.on) for (let k = 0; k < 10; k++) { const d = V40.addDays(V40.today(), k); texts[d] = dayText(d); }
    try { a.setNotifications(!!cfg.on, cfg.time || '19:00', JSON.stringify(texts)); } catch (e) {}
  };
  V40.openNotifSettings = function () {
    const cfg = V40.get('notif', { on: false, time: '19:00' });
    if (!V40.notifSupported()) {
      V40.modal(`<h3>🔔 Notificações</h3><p>As notificações do próprio app funcionam no <b>app Android (APK)</b> — baixe a versão nova em Config ▸ 🤖 App Android.</p><p class="v40-muted">No iPhone/iPad, use ⏰ Lembretes no calendário.</p>`);
      return;
    }
    V40.modal(`<h3>🔔 Notificações do app</h3>
      <label class="v40-check-row"><input type="checkbox" id="v40NotifOn" ${cfg.on ? 'checked' : ''}><span>Avisar todo dia com o que tem pra ver (e os jogos da Liga)</span></label>
      <div class="v40-form"><label>Horário <input type="time" id="v40NotifTime" value="${cfg.time || '19:00'}"></label></div>
      <p class="v40-muted">O texto de cada dia é montado quando você abre o app (vale pros próximos 10 dias).</p>
      <button class="v40-primary" id="v40NotifSave">Salvar</button> <button id="v40NotifTest">🔔 Testar agora</button>`);
    document.getElementById('v40NotifSave').addEventListener('click', () => {
      V40.set('notif', { on: document.getElementById('v40NotifOn').checked, time: document.getElementById('v40NotifTime').value || '19:00' });
      V40.refreshNotifications();
      closeModal();
      V40.toast('🔔 Notificações salvas');
    });
    document.getElementById('v40NotifTest').addEventListener('click', () => { const a = app(); try { a.testNotification('UCM Watchlist', dayText(V40.today())); } catch (e) { alert('Não deu: ' + e.message); } });
  };

  // =================== 🧹 FAXINA DO INÍCIO + LISTA COMPACTA ===================
  // botões antigos do Início (que repetem os novos) vão pra dentro de "⋯ Mais"
  const origHome = V40.renderHomeExtra;
  V40.renderHomeExtra = function () {
    origHome.apply(this, arguments);
    const page = document.getElementById('tabInicio');
    // 🔄 Recarregar no topo do Início também (o antigo ficou dentro de "Mais ferramentas")
    if (page && !page.querySelector(':scope > .tab-reload-btn')) {
      const rb = document.createElement('button');
      rb.className = 'tab-reload-btn';
      rb.textContent = '🔄 Recarregar (' + APP_VERSION + ')';
      rb.addEventListener('click', () => reloadAppNoCache('tabInicio'));
      page.insertBefore(rb, page.firstChild);
    }
    if (!page) return;
    // v40.6.4: sem o grupo "Mais ferramentas". Os botões antigos que repetem os novos somem
    // (Ajustar ritmo = Episódios por dia; Recarregar = botão do topo) e os que só existem lá
    // (Modo maratona, O que cabe no meu tempo?, Compartilhar progresso) ficam logo abaixo dos novos.
    ['btnPace', 'btnReloadHome'].forEach(id => { const b = document.getElementById(id); if (b) b.style.display = 'none'; });
    const old = page.querySelector('.dash-actions:not(.v40-actions)');
    const box = document.getElementById('v40Home');
    if (old && box && box.nextSibling !== old) {
      old.classList.add('v40-old-actions');
      box.parentNode.insertBefore(old, box.nextSibling);
    }
    const det = document.getElementById('v40HomeMore');
    if (det) det.remove();
  };
  // na lista compacta, tocar no título abre/fecha as ações da linha
  const origDecor = window.v40DecorateRow;
  window.v40DecorateRow = function (row, it, mainCol, actions) {
    if (origDecor) origDecor(row, it, mainCol, actions);
    // 📊 v40.6.7: barra de progresso da série (igual à das fases)
    try {
      const eps = simpleKind(it) === 'serie' ? (extractEpsCount(it.text) || 0) : 0;
      if (eps > 1 && !it.done) {
        const n = Array.isArray(it.epDone) ? it.epDone.slice(0, eps).filter(Boolean).length : 0;
        const pct = Math.round(100 * n / eps);
        const bar = document.createElement('div');
        bar.className = 'v40-sbar' + (pct >= 100 ? ' full' : '');
        bar.innerHTML = `<span class="v40-sbar-track"><span class="v40-sbar-fill" style="width:${pct}%"></span></span><span class="v40-sbar-lbl">${pct}%</span><small>${n}/${eps}</small>`;
        const after = mainCol.querySelector('.series-pct-line') || mainCol.querySelector('.watch-date');
        if (after) after.after(bar); else mainCol.appendChild(bar);
      }
    } catch (e) {}
    row.addEventListener('click', e => {
      if (!document.body.classList.contains('v40-compact')) return;
      if (e.target.closest('button, input, a, img, .check, .rating-widget, .episode-list')) return;
      row.classList.toggle('v40-open');
    });
  };

  // ao abrir: notificações (APK) e botão de voz
  setTimeout(() => { try { V40.refreshNotifications(); } catch (e) {} addVoiceButton(); }, 2500);
})();
