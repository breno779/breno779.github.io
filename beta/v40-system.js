/* =====================================================================
 * UCM Watchlist — v40 BETA — ⚙️ sistema: Config nova, lixeira 30 dias,
 * histórico de versões, verificação de erros, só leitura, CSV, registro
 * de atividades, ajuda, novidades, acessibilidade — e o início de tudo.
 * ===================================================================== */
(function () {
  'use strict';
  const V40 = window.V40;
  const BUILD = (function () {
    try { const m = /[?&]b=(\d+)/.exec(document.currentScript.src); return m ? m[1] : 'dev'; } catch (e) { return 'dev'; }
  })();
  V40.BUILD = BUILD;
  V40.VERSION_LABEL = 'v40 beta (parte 2)';

  // =================== APARÊNCIA ===================
  let mql = null;
  V40.applyAppearance = function () {
    const s = V40.settings;
    document.documentElement.style.fontSize = Math.round(16 * (s.fontScale || 1)) + 'px';
    document.body.classList.toggle('v40-battery', !!s.battery);
    document.body.classList.toggle('v40-contrast', !!s.contrast);
    if (s.themeMode === 'auto') {
      mql = mql || window.matchMedia('(prefers-color-scheme: light)');
      applyTheme(mql.matches);
      if (!mql._v40) { mql.addEventListener('change', e => { if (V40.settings.themeMode === 'auto') applyTheme(e.matches); }); mql._v40 = true; }
    } else if (s.themeMode === 'light') applyTheme(true);
    else if (s.themeMode === 'dark') applyTheme(false);
    V40.applyReadOnlyUI();
  };

  // =================== LIXEIRA (30 dias) ===================
  V40.showTrash = function () {
    V40.purgeTrash();
    const now = Date.now();
    const rows = trash.map(it => {
      const left = it.deletedAt ? Math.max(0, V40.TRASH_DAYS - Math.floor((now - new Date(it.deletedAt).getTime()) / 86400000)) : V40.TRASH_DAYS;
      return `<div class="v40-row"><span style="flex:1">${V40.esc(it.text)}<br><small class="v40-muted">apaga sozinho em ${left} dia${left === 1 ? '' : 's'}</small></span><button data-restore="${it.id}" class="v40-primary">Restaurar</button></div>`;
    }).join('');
    V40.modal(`<h3>🗑 Lixeira</h3>
      <p class="v40-muted">Títulos removidos ficam aqui por ${V40.TRASH_DAYS} dias e depois somem de vez.</p>
      ${rows || '<p>Lixeira vazia.</p>'}
      ${trash.length ? '<button id="v40TrashEmpty" class="v40-danger" style="margin-top:10px;">Esvaziar agora</button>' : ''}`);
    document.querySelectorAll('[data-restore]').forEach(b => b.addEventListener('click', () => {
      if (!V40.guard()) return;
      const id = parseInt(b.dataset.restore, 10);
      const idx = trash.findIndex(i => i.id === id);
      if (idx < 0) return;
      const [restored] = trash.splice(idx, 1);
      delete restored.deletedAt;
      items.push(restored);
      save(); render(); closeModal();
      autoReschedule('item restaurado da lixeira', restored.id);
    }));
    const e = document.getElementById('v40TrashEmpty');
    if (e) e.addEventListener('click', () => {
      if (!V40.guard()) return;
      if (!confirm(`Apagar de vez ${trash.length} título(s) da lixeira?`)) return;
      trash = []; save(); closeModal(); V40.toast('🗑 Lixeira esvaziada');
    });
  };

  // =================== HISTÓRICO DE VERSÕES ===================
  V40.openVersions = function () {
    const idx = V40.get('snap-index', []).slice().reverse();
    const rows = idx.map(d => {
      let info = '';
      try {
        const s = JSON.parse(localStorage.getItem('v40-snap-' + d) || 'null');
        if (s) info = `${s.items.filter(i => i.done).length}/${s.items.length} vistos · salvo ${new Date(s.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      } catch (e) {}
      return `<div class="v40-row"><span style="flex:1">${V40.fmtBR(d, true)}${d === V40.today() ? ' (hoje)' : ''}<br><small class="v40-muted">${info}</small></span><button data-snap="${d}">Voltar pra essa</button></div>`;
    }).join('');
    V40.modal(`<h3>🕰 Histórico de versões</h3>
      <p class="v40-muted">O app guarda sozinho uma cópia por dia (a primeira de cada dia), das últimas ${V40.SNAP_KEEP}. Se algo der errado, volte pra uma delas — antes de voltar, a versão de agora também é guardada.</p>
      ${rows || '<p class="v40-muted">Ainda sem cópias.</p>'}`);
    document.querySelectorAll('[data-snap]').forEach(b => b.addEventListener('click', () => {
      if (!V40.guard()) return;
      const d = b.dataset.snap;
      let s = null;
      try { s = JSON.parse(localStorage.getItem('v40-snap-' + d) || 'null'); } catch (e) {}
      if (!s || !Array.isArray(s.items)) { V40.toast('❌ Cópia inválida'); return; }
      if (!confirm(`Voltar a lista pra como estava em ${V40.fmtBR(d, true)}? (a de agora fica guardada em "antes de voltar")`)) return;
      try { localStorage.setItem('v40-snap-before-restore', JSON.stringify({ at: new Date().toISOString(), items, trash })); } catch (e) {}
      items = withOrder(s.items);
      trash = Array.isArray(s.trash) ? s.trash : [];
      nextId = items.reduce((m, i) => Math.max(m, i.id), 0) + 1;
      V40._state = null;
      save(); render(); closeModal();
      V40.logEvent('restore', { name: d });
      V40.toast(`🕰 Lista voltou pra ${V40.fmtBR(d, true)}`, () => {
        let prev = null;
        try { prev = JSON.parse(localStorage.getItem('v40-snap-before-restore') || 'null'); } catch (e) {}
        if (!prev) return;
        items = withOrder(prev.items); trash = prev.trash || []; V40._state = null; save(); render();
        V40.toast('↺ Desfeito');
      });
    }));
  };

  // =================== VERIFICAÇÃO / SAÚDE DOS DADOS ===================
  V40.healthCheck = function () {
    const issues = [];
    const seen = {};
    items.forEach(it => {
      const k = normalizeStr(it.text).trim();
      if (seen[k]) issues.push({ lvl: 'warn', msg: `Título repetido: "${V40.cleanName(it)}"` });
      seen[k] = true;
      if (typeof it.rating === 'number' && (it.rating < 0 || it.rating > 10)) issues.push({ lvl: 'err', msg: `Nota fora de 0–10 em "${V40.cleanName(it)}": ${it.rating}` });
      if (Array.isArray(it.epRatings) && it.epRatings.some(v => typeof v === 'number' && (v < 0 || v > 10))) issues.push({ lvl: 'err', msg: `Nota de episódio fora de 0–10 em "${V40.cleanName(it)}"` });
      const eps = extractEpsCount(it.text);
      if (eps && Array.isArray(it.epDone) && it.epDone.length > eps) issues.push({ lvl: 'warn', msg: `"${V40.cleanName(it)}" tem ${it.epDone.length} episódios marcáveis mas o título diz ${eps}` });
      if (!it.done && !it.noSchedule && !it.watchStart) issues.push({ lvl: 'warn', msg: `Sem data no cronograma: "${V40.cleanName(it)}"` });
      if (it.watchStart && it.watchEnd && it.watchEnd < it.watchStart) issues.push({ lvl: 'err', msg: `Data final antes da inicial em "${V40.cleanName(it)}"` });
      if (it.done && it.completedAt && it.completedAt > V40.today()) issues.push({ lvl: 'warn', msg: `Concluído numa data futura: "${V40.cleanName(it)}" (${V40.fmtBR(it.completedAt, true)})` });
      if (it.done && it.watchStart) issues.push({ lvl: 'info', msg: `"${V40.cleanName(it)}" está visto mas ainda tem data no cronograma` });
      if (simpleKind(it) === 'serie' && it.done && Array.isArray(it.epDone) && it.epDone.some(v => !v)) issues.push({ lvl: 'info', msg: `"${V40.cleanName(it)}" está visto, mas tem episódio desmarcado` });
    });
    const ids = {};
    items.forEach(it => { if (ids[it.id]) issues.push({ lvl: 'err', msg: `ID repetido (${it.id})` }); ids[it.id] = true; });
    return issues;
  };
  V40.openHealth = function () {
    const issues = V40.healthCheck();
    const icon = { err: '❌', warn: '⚠️', info: 'ℹ️' };
    V40.modal(`<h3>🩺 Verificação de erros</h3>
      ${issues.length ? `<p>${issues.filter(i => i.lvl === 'err').length} erro(s) · ${issues.filter(i => i.lvl === 'warn').length} aviso(s) · ${issues.filter(i => i.lvl === 'info').length} observação(ões)</p>${issues.map(i => `<div class="v40-row"><span>${icon[i.lvl]}</span><span style="flex:1">${V40.esc(i.msg)}</span></div>`).join('')}` : '<p>✅ Nada de estranho na sua lista.</p>'}
      <p class="v40-muted">Só mostra — não muda nada sozinho. Se algo aqui estiver errado de verdade, me fala que eu corrijo.</p>`);
  };

  // =================== SÓ LEITURA ===================
  V40.setReadOnly = function (on) {
    V40.settings.readOnly = !!on;
    V40.saveSettings();
    V40.applyReadOnlyUI();
    V40.toast(on ? '👁 Modo só leitura ligado' : '✏️ Modo só leitura desligado');
  };

  // =================== CSV ===================
  V40.exportCSV = function () {
    const order = V40.orderIndex();
    const head = ['ordem', 'fase', 'titulo', 'tipo', 'formato', 'visto', 'concluido_em', 'nota', 'pontos_liga', 'eps_vistos', 'eps_total', 'favorito', 'quero_rever', 'roteiro', 'acao', 'emocao', 'herois'];
    const q = v => {
      const s = v == null ? '' : String(v);
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const rows = sortItems(items.slice()).map(it => {
      const k = simpleKind(it);
      const eps = extractEpsCount(it.text);
      const r = V40.effRating(it);
      const s = it.subRatings || {};
      let heroes = '';
      try { heroes = heroGroupsOf(it).map(g => g.label).join(' / '); } catch (e) {}
      return [order.get(it.id) + 1, it.phase, V40.cleanName(it), k, it.text.includes('🎨') ? 'animação' : (k === 'jogo' ? 'jogo' : 'live action'), it.done ? 'sim' : 'não', it.completedAt || '',
        r > 0 ? String(V40.round1(r)).replace('.', ',') : '', r > 0 ? V40.points(r) : '', Array.isArray(it.epDone) ? it.epDone.filter(Boolean).length : '', eps || '',
        it.favorite ? 'sim' : '', it.rewatch ? 'sim' : '', s.roteiro != null ? String(s.roteiro).replace('.', ',') : '', s.acao != null ? String(s.acao).replace('.', ',') : '', s.emocao != null ? String(s.emocao).replace('.', ',') : '', heroes].map(q).join(';');
    });
    const csv = '﻿' + head.join(';') + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ucm-watchlist-${V40.today()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    V40.toast('📊 Planilha (CSV) baixada — abre no Excel/Sheets');
  };

  // backup também leva os dados da v40 (coleções, liga, registro…)
  const origDownload = window.downloadBackup;
  window.downloadBackup = function (filename) {
    const v40 = {};
    try {
      ['settings', 'collections', 'activity', 'knockout', 'liga-history', 'rate-history', 'extra-pauses', 'month-goals', 'challenges-done', 'watch-time', 'day-status', 'best-streak'].forEach(k => { v40[k] = V40.get(k, null); });
    } catch (e) {}
    const blob = new Blob([JSON.stringify({ version: LIST_VERSION, items, trash, v40 }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (filename || 'ucm-watchlist-backup.json').replace('ucm-watchlist', 'ucm-v40beta');
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  V40._origDownload = origDownload;

  // =================== REGISTRO DE ATIVIDADES ===================
  const ACT_LABEL = {
    title: e => `✅ Concluiu <b>${V40.esc(e.name)}</b>`,
    untitle: e => `↩️ Desmarcou <b>${V40.esc(e.name)}</b>`,
    ep: e => `📺 Marcou ${e.n || 1} ep. de <b>${V40.esc(e.name)}</b>`,
    unep: e => `↩️ Desmarcou ${e.n || 1} ep. de <b>${V40.esc(e.name)}</b>`,
    rate: e => `⭐ Nota <b>${e.v}</b> pra <b>${V40.esc(e.name)}</b>${e.from ? ` (era ${e.from})` : ''}`,
    eprate: e => `⭐ Avaliou ${e.n || 1} ep. de <b>${V40.esc(e.name)}</b>`,
    remove: e => `🗑 Removeu <b>${V40.esc(e.name)}</b>`,
    plan: e => `🗓 ${V40.esc(e.name)}`,
    recover: () => '🩹 Recomeçou de hoje',
    level: e => `⭐ Subiu pro nível ${e.v}`,
    challenge: e => `🎯 Desafio: ${V40.esc(e.name)}`,
    restore: e => `🕰 Voltou a lista pra ${V40.fmtBR(e.name, true)}`,
    'ko-champion': () => '👑 Mata-mata decidido'
  };
  V40.openActivity = function () {
    const list = V40.activity.slice().reverse().slice(0, 300);
    let lastD = null;
    const rows = list.map(e => {
      const f = ACT_LABEL[e.type];
      if (!f) return '';
      const head = e.d !== lastD ? `<div class="v40-act-day">${V40.fmtBR(e.d, true)}</div>` : '';
      lastD = e.d;
      return head + `<div class="v40-act"><small>${e.t}</small> ${f(e)}</div>`;
    }).join('');
    V40.modal(`<h3>📜 Registro de atividades</h3><p class="v40-muted">O que mudou e quando (desde que a v40 começou a registrar). Mostra as últimas 300.</p>${rows || '<p class="v40-muted">Nada registrado ainda.</p>'}`);
  };

  // =================== AJUDA E NOVIDADES ===================
  const NEWS = [
    ['🥇', 'Aba Liga', 'Pontos corridos por título (158 participantes; What If T1 e T2 valem 1 cada), campeonato de heróis em 3 tabelas, mata-mata dos 10, por fase, duelo, histórico, artilheiro e melhor defesa, imagem pra compartilhar.'],
    ['🏠', 'Início', 'Card de hoje com barra da meta, atrasos com botão "resolver", nível/XP, sequência e recorde, meta do mês, desafio da semana, modo cinema, sorteio, folga, viagem, simulador e calendário do mês.'],
    ['🗓', 'Planejamento', 'Episódios por dia escolhidos na tela (vale a partir de amanhã), "hoje não vou assistir", modo viagem, recomeçar de hoje ou diluir o atraso, simulador e previsão pelo seu ritmo real.'],
    ['🎬', 'Lista', 'Modo foco, filtro avançado, ordenar por nota/data/herói/nome, busca por herói e fase, quero rever, coleções, notas detalhadas, deslizar pra marcar e marcar vários episódios de uma vez.'],
    ['📊', 'Stats', 'Quanto falta (até "sem dormir"), ranking de títulos, notas ao longo do tempo, nota de cada episódio, mapa de calor, dia mais ativo, heróis amados/odiados, animação x live action, fases e retrospectiva do ano.'],
    ['🏆', 'Troféus', 'Sequências de 3 a 100 dias (agora episódios contam), maratona num dia, semana e mês perfeitos, recuperação, fases, liga, níveis e desafios — com confete.'],
    ['⚙️', 'Sistema', 'Temas por herói, claro/escuro/automático, letra maior ou menor, sons, modo bateria, alto contraste, só leitura, layout do início, apelidos dos heróis, lixeira de 30 dias, histórico de versões, verificação de erros, registro de atividades, CSV.'],
    ['🌐', 'Dados de fora (parte 2)', 'Capas oficiais, sinopse em português, elenco, trailer, nota do público e onde assistir no Brasil (TMDB, com a sua chave). Nomes oficiais dos episódios e resumo do último que você viu (TVmaze) — só aparecem quando a conta de episódios bate.'],
    ['📚', 'Universo (parte 2)', 'Trilhas por personagem, vilões, glossário, quiz só do que você já viu, cenas pós-créditos e "bom ter visto antes" na ficha de cada título. Ordem de lançamento e nomes em inglês.'],
    ['☁️', 'Nuvem e aparelho (parte 2)', 'Sincronização da beta com tela de comparação (juntar / usar um lado), backups semanais na nuvem, perfil pra amigos com comparação de notas, PIN e digital/rosto, lembretes no calendário do celular, atalhos no ícone e telas em 2 colunas no iPad.'],
    ['🗑', 'Saiu', 'As anotações 📝 (como você pediu).']
  ];
  V40.openNews = function () {
    V40.modal(`<h3>🆕 O que há de novo — ${V40.VERSION_LABEL}</h3>
      ${NEWS.map(n => `<div class="v40-news"><span class="ic">${n[0]}</span><div><b>${n[1]}</b><br><small>${n[2]}</small></div></div>`).join('')}
      <p class="v40-muted">App Android (APK): veja Config ▸ 📲 App Android.</p>
      <p class="v40-muted">Build ${BUILD}</p>`);
  };
  const HELP = [
    ['Como marco um título?', 'Toque no quadradinho à esquerda — ou deslize o título pra direita.'],
    ['Como marco vários episódios?', 'Abra os episódios ▸ "✓ Marcar todos até hoje", ou segure o dedo num episódio pra marcar todos até ele.'],
    ['Onde ficam os extras de cada título?', 'Toque no NOME do título na Lista: aparecem quero rever, coleções, notas detalhadas, cartão do herói e duelo.'],
    ['Como funciona a pontuação da Liga?', 'A nota vira ponto arredondando: 7,0–7,4 = 7 pontos; 7,5–7,9 = 8. Mesmo ponto = mesma posição. Série em andamento entra com a média dos episódios que você avaliou.'],
    ['O que é o mata-mata dos 10?', 'Todos os títulos concluídos que valem 10 pontos se enfrentam; você escolhe o vencedor de cada jogo até sobrar o verdadeiro 10.'],
    ['Mudei o ritmo e quero voltar', 'Início ▸ ⏱ Episódios por dia ▸ escolha de novo. Vale a partir de amanhã; o passado não muda.'],
    ['Fiquei atrasado', 'Início ▸ botão vermelho de atraso ▸ escolha recomeçar de hoje ou diluir.'],
    ['A beta mexe no meu app de verdade?', 'Não. A beta tem a gaveta dela. Ela copiou seu progresso quando abriu pela primeira vez, e dá pra copiar de novo em Config.'],
    ['Deu algo errado', 'Config ▸ 🕰 Histórico de versões pra voltar a lista pra um dia anterior.']
  ];
  V40.openHelp = function () {
    V40.modal(`<h3>❓ Ajuda</h3>${HELP.map(h => `<details class="v40-help"><summary>${h[0]}</summary><p>${h[1]}</p></details>`).join('')}
      <button class="v40-link" id="v40HelpTour">Rever o tour de boas-vindas ›</button>`);
    document.getElementById('v40HelpTour').addEventListener('click', () => V40.openTour(0));
  };

  // =================== CONFIG NOVA ===================
  V40.openHomeLayout = function () {
    const h = V40.settings.home;
    V40.modal(`<h3>🧩 Layout do início</h3><p class="v40-muted">Escolha o que aparece na tela inicial.</p>
      ${V40.HOME_BLOCKS.map(([k, l]) => `<label class="v40-check-row"><input type="checkbox" data-hb="${k}" ${h[k] ? 'checked' : ''}><span>${l}</span></label>`).join('')}`);
    document.querySelectorAll('[data-hb]').forEach(cb => cb.addEventListener('change', () => {
      V40.settings.home[cb.dataset.hb] = cb.checked; V40.saveSettings(); V40.renderHomeExtra();
    }));
  };
  V40.openNicknames = function () {
    V40.modal(`<h3>🏷 Apelidos dos heróis</h3><p class="v40-muted">Renomeie do seu jeito (aparece na Liga, Stats e filtros). Deixe vazio pra voltar ao nome original.</p>
      <div class="v40-nick-list">${HERO_GROUPS.map(g => `<label class="v40-nick"><span>${g.emoji}</span><input type="text" data-nick="${g.id}" placeholder="${V40.esc(g._origLabel || g.label)}" value="${V40.esc(V40.settings.heroNicknames[g.id] || '')}"></label>`).join('')}</div>
      <button id="v40NickSave" class="v40-primary" style="margin-top:10px;">Salvar apelidos</button>`, true);
    document.getElementById('v40NickSave').addEventListener('click', () => {
      document.querySelectorAll('[data-nick]').forEach(inp => {
        const v = inp.value.trim();
        if (v) V40.settings.heroNicknames[inp.dataset.nick] = v; else delete V40.settings.heroNicknames[inp.dataset.nick];
      });
      V40.saveSettings(); V40.applyNicknames(); closeModal(); render();
      V40.toast('🏷 Apelidos salvos');
    });
  };
  V40.openAppearance = function () {
    const s = V40.settings;
    const tm = s.themeMode || (document.body.classList.contains('light') ? 'light' : 'dark');
    V40.modal(`<h3>🎨 Aparência</h3>
      <div class="v40-form">
        <label>Tema <select id="v40ThemeMode"><option value="dark" ${tm === 'dark' ? 'selected' : ''}>🌙 Escuro</option><option value="light" ${tm === 'light' ? 'selected' : ''}>☀️ Claro</option><option value="auto" ${tm === 'auto' ? 'selected' : ''}>🌗 Automático (segue o aparelho)</option></select></label>
        <label>Tamanho da letra <input type="range" id="v40Font" min="0.85" max="1.3" step="0.05" value="${s.fontScale || 1}"><b id="v40FontV">${Math.round((s.fontScale || 1) * 100)}%</b></label>
      </div>
      <label class="v40-check-row"><input type="checkbox" id="v40HeroBg" ${s.heroBg ? 'checked' : ''}><span>🖼 Fundo muda conforme o herói do título do dia</span></label>
      <label class="v40-check-row"><input type="checkbox" id="v40Contrast" ${s.contrast ? 'checked' : ''}><span>🔲 Alto contraste</span></label>
      <button id="v40ThemePick" class="v40-pick">🦸 Tema por herói (cores)…</button>`);
    document.getElementById('v40ThemeMode').addEventListener('change', e => { s.themeMode = e.target.value; V40.saveSettings(); V40.applyAppearance(); });
    document.getElementById('v40Font').addEventListener('input', e => { s.fontScale = +e.target.value; document.getElementById('v40FontV').textContent = Math.round(s.fontScale * 100) + '%'; V40.saveSettings(); V40.applyAppearance(); });
    document.getElementById('v40HeroBg').addEventListener('change', e => { s.heroBg = e.target.checked; V40.saveSettings(); V40.applyHeroBg(); });
    document.getElementById('v40Contrast').addEventListener('change', e => { s.contrast = e.target.checked; V40.saveSettings(); V40.applyAppearance(); });
    document.getElementById('v40ThemePick').addEventListener('click', V40.openThemePicker);
  };

  V40.renderConfigExtra = function () {
    const page = document.getElementById('tabConfig');
    if (!page) return;
    let box = document.getElementById('v40Config');
    if (!box) {
      box = document.createElement('div');
      box.id = 'v40Config';
      const list = page.querySelector('.config-list');
      page.insertBefore(box, list);
    }
    const s = V40.settings;
    const issues = V40.healthCheck();
    const errs = issues.filter(i => i.lvl !== 'info').length;
    const copiedAt = V40.get('copied-at', null) || (function () { try { return localStorage.getItem('v40-copied-at'); } catch (e) { return null; } })();
    box.innerHTML = `
      <div class="v40-beta-box">
        <b>🧪 ${V40.VERSION_LABEL}</b><br>
        <small>Gaveta própria — seu app de verdade não muda. ${copiedAt ? 'Progresso copiado do app atual em ' + new Date(copiedAt).toLocaleString('pt-BR') + '.' : ''}</small>
        <div class="dash-actions" style="margin:8px 0 0;"><button id="v40CfgCopy">📥 Copiar de novo do app atual</button><button id="v40CfgNews">🆕 Novidades</button><button id="v40CfgHelp">❓ Ajuda</button></div>
      </div>
      <h3 class="v40-cfg-h">✨ Novidades da v40</h3>
      <div class="config-list">
        <button id="v40CfgSync">☁️ Sincronização da beta (celular ⇄ iPad), com aviso de conflito ${V40.syncState && V40.syncState.auto ? '✅' : ''}</button>
        <button id="v40CfgBackups">🗄 Backups na nuvem</button>
        <button id="v40CfgProfile">👥 Perfil pra amigos (e ver o de um amigo)</button>
        <button id="v40CfgLock">🔒 Senha / biometria ${V40.lockCfg && V40.lockCfg() ? '✅' : ''}</button>
        <button id="v40CfgRem">⏰ Lembretes no calendário do celular</button>
        <button id="v40CfgApk">📲 App Android (APK)</button>
        <button id="v40CfgUni">📚 Universo: trilhas, vilões, glossário, quiz, pós-créditos</button>
        <button id="v40CfgExt">🌐 Dados de fora: capas, episódios, sinopses (TMDB/TVmaze) ${V40.settings.tmdbKey ? '🔑' : '<span class="v40-badge">sem chave</span>'}</button>
        <button id="v40CfgAppearance">🎨 Aparência: tema, letra, fundo por herói, contraste</button>
        <button id="v40CfgLayout">🧩 Layout do início</button>
        <button id="v40CfgNick">🏷 Apelidos dos heróis</button>
        <button id="v40CfgCols">🗂 Coleções</button>
        <label class="v40-switch"><input type="checkbox" id="v40CfgSounds" ${s.sounds ? 'checked' : ''}><span>🔊 Efeitos sonoros</span></label>
        <label class="v40-switch"><input type="checkbox" id="v40CfgConfetti" ${s.confetti ? 'checked' : ''}><span>🎉 Confete ao concluir</span></label>
        <label class="v40-switch"><input type="checkbox" id="v40CfgSwipe" ${s.swipe ? 'checked' : ''}><span>👉 Deslizar pra marcar</span></label>
        <label class="v40-switch"><input type="checkbox" id="v40CfgBattery" ${s.battery ? 'checked' : ''}><span>🔋 Modo bateria (sem animações)</span></label>
        <label class="v40-switch"><input type="checkbox" id="v40CfgRO" ${s.readOnly ? 'checked' : ''}><span>👁 Modo só leitura (pra mostrar pra alguém)</span></label>
        <button id="v40CfgVersions">🕰 Histórico de versões (voltar a um dia anterior)</button>
        <button id="v40CfgHealth">🩺 Verificação de erros ${errs ? `<span class="v40-badge">${errs}</span>` : '✅'}</button>
        <button id="v40CfgActivity">📜 Registro de atividades</button>
        <button id="v40CfgCSV">📊 Exportar planilha (CSV)</button>
        <button id="v40CfgReset" class="v40-danger-btn">🧹 Apagar a beta e começar de novo</button>
      </div>
      <h3 class="v40-cfg-h">Do app de sempre</h3>`;
    const on = (id, fn) => { const e = document.getElementById(id); if (e) e.addEventListener('click', fn); };
    on('v40CfgCopy', () => {
      if (!confirm('Copiar de novo o progresso do app atual pra beta? O que você mudou SÓ na beta (lista e notas) será substituído. Coleções, liga e registro da v40 ficam.')) return;
      window.v40CopyFromMainApp();
      location.replace(location.pathname + '?nocache=' + Date.now());
    });
    on('v40CfgNews', V40.openNews);
    on('v40CfgHelp', V40.openHelp);
    on('v40CfgAppearance', V40.openAppearance);
    on('v40CfgExt', V40.openExtSettings);
    on('v40CfgSync', V40.openSync);
    on('v40CfgBackups', V40.openCloudBackups);
    on('v40CfgProfile', V40.openProfileShare);
    on('v40CfgLock', V40.openLockSettings);
    on('v40CfgRem', V40.openReminders);
    on('v40CfgUni', () => V40.openUniverse());
    on('v40CfgApk', V40.openApk);
    on('v40CfgLayout', V40.openHomeLayout);
    on('v40CfgNick', V40.openNicknames);
    on('v40CfgCols', V40.openCollectionsManager);
    on('v40CfgVersions', V40.openVersions);
    on('v40CfgHealth', V40.openHealth);
    on('v40CfgActivity', V40.openActivity);
    on('v40CfgCSV', V40.exportCSV);
    on('v40CfgReset', () => {
      if (!confirm('Apagar TUDO da beta (lista, liga, coleções, registro) e copiar de novo do app atual? O app de verdade não é afetado.')) return;
      window.__v40real.keys().filter(k => k && k.indexOf('v40b:') === 0).forEach(k => window.__v40real.removeRaw(k));
      location.replace(location.pathname + '?nocache=' + Date.now());
    });
    const sw = (id, key, after) => {
      const e = document.getElementById(id);
      if (e) e.addEventListener('change', () => { s[key] = e.checked; V40.saveSettings(); if (after) after(); });
    };
    sw('v40CfgSounds', 'sounds', () => V40.sound('done'));
    sw('v40CfgConfetti', 'confetti', () => V40.confetti(false));
    sw('v40CfgSwipe', 'swipe');
    sw('v40CfgBattery', 'battery', V40.applyAppearance);
    const ro = document.getElementById('v40CfgRO');
    if (ro) ro.addEventListener('change', () => V40.setReadOnly(ro.checked));
    // botão antigo da lixeira → lixeira nova (com prazo de 30 dias)
    const tb = document.getElementById('btnTrash');
    if (tb && !tb.dataset.v40) {
      const clone = tb.cloneNode(true);
      clone.dataset.v40 = '1';
      clone.textContent = '🗑 Lixeira (apaga sozinha em 30 dias)';
      tb.parentNode.replaceChild(clone, tb);
      clone.addEventListener('click', V40.showTrash);
    }
    // tema antigo (botão claro/escuro): sai do automático
    const bt = document.getElementById('btnTheme');
    if (bt && !bt.dataset.v40) {
      bt.dataset.v40 = '1';
      bt.addEventListener('click', () => { V40.settings.themeMode = document.body.classList.contains('light') ? 'light' : 'dark'; V40.saveSettings(); });
    }
    const bp = document.getElementById('btnPalette');
    if (bp && !bp.dataset.v40) {
      const clone = bp.cloneNode(true);
      clone.dataset.v40 = '1';
      clone.textContent = '🎨 Trocar paleta de cor (temas por herói)';
      bp.parentNode.replaceChild(clone, bp);
      clone.addEventListener('click', V40.openThemePicker);
    }
  };

  // =================== TROFÉUS (topo) ===================
  V40.renderTrophiesExtra = function () {
    const page = document.getElementById('tabConquistas');
    if (!page) return;
    const streak = V40.currentStreak(), best = V40.bestStreak();
    const next = [3, 7, 10, 14, 21, 30, 50, 75, 100].find(n => n > best);
    const lv = V40.levelOf(V40.xp().xp);
    const box = document.createElement('div');
    box.className = 'v40-trophy-top';
    box.innerHTML = `<div><b>🔥 ${streak}</b><small>dias seguidos agora</small></div><div><b>🏅 ${best}</b><small>seu recorde</small></div><div><b>${lv.cur.icon} ${lv.level}</b><small>nível</small></div>
      ${next ? `<p class="v40-muted" style="grid-column:1/-1;margin:4px 0 0;">Próximo troféu de sequência: <b>${next} dias</b> (faltam ${next - best} pro recorde chegar lá). Agora episódio marcado também conta.</p>` : ''}`;
    const h2 = page.querySelector('h2');
    page.insertBefore(box, h2 ? h2.nextSibling : page.firstChild);
    page.querySelectorAll('.achv-card').forEach(c => { if (c.title) c.setAttribute('aria-label', c.textContent.trim() + ' — ' + c.title); });
  };

  // =================== ACESSIBILIDADE ===================
  function a11y() {
    const tb = document.getElementById('tabbar');
    if (tb) {
      tb.setAttribute('role', 'tablist');
      tb.querySelectorAll('.tabbar-btn').forEach(b => {
        b.setAttribute('role', 'tab');
        const sp = b.querySelector('span');
        if (sp) b.setAttribute('aria-label', sp.textContent);
        b.setAttribute('aria-selected', b.classList.contains('tab-active') ? 'true' : 'false');
      });
    }
    document.querySelectorAll('.icon-btn:not([aria-label]), .search-icon-btn:not([aria-label])').forEach(b => { if (b.title) b.setAttribute('aria-label', b.title); });
    document.querySelectorAll('.check:not([role])').forEach(c => { c.setAttribute('role', 'checkbox'); c.setAttribute('tabindex', '0'); c.setAttribute('aria-label', 'Marcar como visto'); c.setAttribute('aria-checked', c.classList.contains('done') ? 'true' : 'false'); });
  }
  const prevAfter = window.v40AfterRender;
  window.v40AfterRender = function () {
    if (prevAfter) prevAfter();
    a11y();
  };
  // Enter/Espaço no quadradinho de marcar (teclado / leitor de tela)
  document.addEventListener('keydown', ev => {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target && ev.target.classList && ev.target.classList.contains('check')) {
      ev.preventDefault();
      ev.target.click();
    }
  });

  // offline / online
  function updateOnline() {
    const chip = document.getElementById('v40SavedChip');
    if (!chip) return;
    chip.classList.toggle('offline', !navigator.onLine);
    if (!navigator.onLine) chip.textContent = '📴 offline · salvo no aparelho';
  }
  window.addEventListener('online', updateOnline);
  window.addEventListener('offline', updateOnline);

  // =================== INÍCIO DE TUDO ===================
  function boot() {
    try { if (V40.get('lock', null)) document.body.classList.add('v40-locked'); } catch (e) {}
    try { V40.init(); } catch (e) { console.error('v40 init', e); }
    try { V40.initFun(); } catch (e) { console.error('v40 fun', e); }
    try { V40.applyAppearance(); } catch (e) { console.error('v40 appearance', e); }
    try { if (V40.initData) V40.initData(); } catch (e) { console.error('v40 data', e); }
    // versão nova da beta: confere os dados e guarda uma cópia antes (teste de saúde)
    const lastBuild = V40.get('last-build', null);
    if (lastBuild !== BUILD) {
      V40.dailySnapshot(true);
      const issues = V40.healthCheck().filter(i => i.lvl === 'err');
      V40.set('last-build', BUILD);
      if (lastBuild) setTimeout(() => V40.toast(issues.length ? `⚠️ Versão nova: ${issues.length} problema(s) nos dados — veja Config ▸ Verificação` : '✅ Versão nova da beta — dados conferidos e cópia guardada'), 1200);
    }
    try { render(); } catch (e) { console.error('v40 render', e); }
    updateOnline();
    try { if (V40.initSync) V40.initSync(); } catch (e) { console.error('v40 sync', e); }
    // reabrir na aba Liga depois do 🔄
    try {
      const rt = localStorage.getItem('v40-reload-tab');
      if (rt) { localStorage.removeItem('v40-reload-tab'); switchTab(rt); }
    } catch (e) {}
    if (window.__v40JustCopied) setTimeout(() => V40.toast('📥 Seu progresso foi copiado do app atual pra beta'), 600);
    if (!V40.get('tour-done', false)) setTimeout(() => { if (!V40.get('tour-done', false)) V40.openTour(0); }, window.__v40JustCopied ? 1800 : 700);
  }
  // o botão 🔄 da aba Liga lembra a aba
  const origReload = window.reloadAppNoCache;
  window.reloadAppNoCache = function (stayTab) {
    if (stayTab === 'tabLiga') { try { localStorage.setItem('v40-reload-tab', 'tabLiga'); } catch (e) {} stayTab = null; }
    return origReload.call(this, stayTab);
  };
  boot();
})();
