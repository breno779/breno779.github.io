/* =====================================================================
 * UCM Watchlist — v40 — 💬 aba Pedidos (a 100ª novidade)
 *  - assistente do próprio app (sem internet, sem custo): responde dúvidas e
 *    já abre a tela certa
 *  - pedido/bug com diagnóstico automático (versão, aparelho, erros achados)
 *  - "Mandar pro Claude" (copia e abre o Claude) ou WhatsApp
 * ===================================================================== */
(function () {
  'use strict';
  const V40 = window.V40;
  const MODE = window.V40_MODE || 'beta';

  // ---------- aba nova (no lugar do "Add", que foi pro Config) ----------
  function injectTab() {
    if (document.getElementById('tabPedidos')) return;
    const page = document.createElement('div');
    page.className = 'tab-page';
    page.id = 'tabPedidos';
    const tabbar = document.getElementById('tabbar');
    tabbar.parentNode.insertBefore(page, tabbar);
    const add = tabbar.querySelector('[data-tab="tabAdicionar"]');
    const btn = document.createElement('button');
    btn.className = 'tabbar-btn';
    btn.dataset.tab = 'tabPedidos';
    btn.innerHTML = '💬<span>Pedidos</span>';
    if (add) { tabbar.insertBefore(btn, add); add.style.display = 'none'; } else tabbar.appendChild(btn);
    btn.addEventListener('click', () => switchTab('tabPedidos'));
  }
  const origSwitch = window.switchTab;
  window.switchTab = function (name) {
    const r = origSwitch.apply(this, arguments);
    if (name === 'tabPedidos') { try { V40.renderPedidos(); ensureTabReloadBtn('tabPedidos'); } catch (e) { console.error(e); } }
    return r;
  };

  // ---------- conversa (fica no aparelho) ----------
  V40.chat = V40.get('chat', []);
  function saveChat() {
    if (V40.chat.length > 120) V40.chat = V40.chat.slice(-120);
    V40.set('chat', V40.chat);
  }
  function push(from, text, extra) {
    V40.chat.push(Object.assign({ from, text, at: new Date().toISOString() }, extra || {}));
    saveChat();
  }

  // ---------- diagnóstico automático ----------
  V40.diagnostics = function () {
    const ua = navigator.userAgent;
    const dev = /iPad|Macintosh/.test(ua) && navigator.maxTouchPoints > 1 ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : 'Computador';
    const app = /UCMWatchlistApp\//.test(ua) ? 'app Android (APK)' : (window.matchMedia('(display-mode: standalone)').matches ? 'instalado na tela inicial' : 'navegador');
    const issues = V40.healthCheck ? V40.healthCheck().filter(i => i.lvl !== 'info') : [];
    const done = items.filter(i => i.done).length;
    const last = (V40.activity || []).slice(-4).map(e => `${e.d.slice(5)} ${e.t} ${e.type}${e.name ? ' ' + e.name : ''}`);
    const lines = [
      `Versão: ${typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?'} (${MODE}, build ${V40.BUILD || '?'})`,
      `Aparelho: ${dev} · ${app} · tela ${window.innerWidth}×${window.innerHeight}`,
      `Lista: ${done}/${items.length} vistos · término ${V40.endDate ? (V40.endDate() || '—') : '—'}`,
      `Dados de fora: ${Object.keys(V40.ext || {}).length} títulos${V40.settings.tmdbKey ? ' (com chave TMDB)' : ' (sem chave TMDB)'}`,
      issues.length ? `Avisos da verificação: ${issues.slice(0, 5).map(i => i.msg).join(' | ')}` : 'Verificação: sem avisos',
      last.length ? `Últimas ações: ${last.join(' | ')}` : ''
    ].filter(Boolean);
    return lines.join('\n');
  };

  // ---------- respostas do assistente ----------
  const FAQ = [
    { k: /(atras|atraso|perdi (uns|alguns) dias|fiquei pra tr[aá]s)/, a: 'Quando você atrasa, no Início aparece o botão vermelho "⏰ … atrasado(s) — resolver". Lá você escolhe: recomeçar de hoje (a data final anda), diluir (+1 ep por dia, a data final não muda) ou deixar como está.', act: ['🧯 Resolver atraso', () => V40.openLateHelper()] },
    { k: /(desfa[zç]|voltar (atr[aá]s|como estava)|errei|apaguei|sumiu (meu|o) progresso|restaurar)/, a: 'Dá pra voltar: logo depois de marcar aparece "↺ Desfazer". Pra voltar a lista inteira pra um dia anterior, use o Histórico de versões. Título removido fica 30 dias na lixeira.', act: ['🕰 Histórico de versões', () => V40.openVersions()], act2: ['🗑 Lixeira', () => V40.showTrash()] },
    { k: /(v[aá]rios ep|todos os ep|marcar (de uma vez|v[aá]rios)|at[eé] hoje)/, a: 'Abra os episódios da série e toque em "✓ Marcar todos até hoje" — ou segure o dedo num episódio pra marcar todos até ele.' },
    { k: /(mata.?mata|verdadeiro 10)/, a: 'O mata-mata é com os títulos concluídos que valem 10 pontos. Você escolhe o vencedor de cada jogo até sobrar o verdadeiro 10. Fica na aba 🥇 Liga ▸ ⚔️ Mata-mata 10.', act: ['⚔️ Abrir o mata-mata', () => { V40.ligaTab = 'mata'; switchTab('tabLiga'); }] },
    { k: /(liga|campeonato|ponto|classifica|ranking)/, a: 'Na Liga a nota vira ponto arredondando (7,5 → 8). Mesma pontuação = mesma posição. Série em andamento entra com a média dos episódios que você avaliou. Heróis têm 3 tabelas: filmes, séries e geral.', act: ['🥇 Abrir a Liga', () => switchTab('tabLiga')] },
    { k: /(sincron|ipad|nuvem|outro aparelho|tablet|celular novo)/, a: 'Use o mesmo código no celular e no iPad. Na tela de sincronização você compara os dois lados e escolhe juntar, usar um ou outro — nada entra sem você escolher.', act: ['☁️ Sincronização', () => V40.openSync()] },
    { k: /(capa|poster|p[oô]ster|imagem|sinopse|elenco|trailer|tmdb|chave)/, a: 'Capas, sinopse, elenco, trailer e onde assistir vêm do TMDB com a sua chave (Config ▸ 🌐 Dados de fora). Toque na capa de um título pra ver a ficha.', act: ['🌐 Dados de fora', () => V40.openExtSettings()] },
    { k: /(ritmo|ep(is[oó]dios)? por dia|eps? \/ ?dia|mais r[aá]pido|mais devagar)/, a: 'Você escolhe quantos episódios por dia em Início ▸ ⏱ Episódios por dia. Vale a partir de amanhã e mostra a data final nova antes de aplicar.', act: ['⏱ Episódios por dia', () => V40.openRateSettings()] },
    { k: /(folga|hoje n[aã]o|viagem|pausa|f[eé]rias)/, a: 'Pra um dia: "🛌 Hoje não vou assistir" no Início. Pra vários dias: ✈️ Modo viagem.', act: ['🛌 Hoje não vou assistir', () => V40.skipToday()], act2: ['✈️ Modo viagem', () => V40.openTravel()] },
    { k: /(lembrete|notifica|alarme|avisar)/, a: 'Os lembretes vão pro calendário do celular (um evento por dia com o que assistir). Assim avisa mesmo com o app fechado.', act: ['⏰ Lembretes', () => V40.openReminders()] },
    { k: /(senha|pin|bloque|digital|biometria|rosto)/, a: 'Dá pra pôr PIN e digital/rosto pra abrir o app.', act: ['🔒 Senha / biometria', () => V40.openLockSettings()] },
    { k: /(backup|exportar|planilha|csv|excel)/, a: 'Config ▸ ⬇ Exportar backup guarda tudo num arquivo. Pra planilha: 📊 Exportar planilha (CSV).', act: ['📊 Planilha', () => V40.exportCSV()] },
    { k: /(apk|android|instalar|baixar o app)/, a: 'O app Android abre a lista num app próprio, sem depender do Chrome.', act: ['📲 App Android', () => V40.openApk()] },
    { k: /(tema|cor|escuro|claro|letra|fonte|tamanho)/, a: 'Tema por herói, claro/escuro/automático e tamanho da letra ficam em Aparência.', act: ['🎨 Aparência', () => V40.openAppearance()] },
    { k: /(amigo|perfil|compartilh|mandar pra algu[eé]m)/, a: 'Pro seu amigo usar a lista dele: mande o link breno779.github.io/amigo/. Pra ele ver o seu progresso: 👥 Perfil pra amigos.', act: ['👥 Perfil', () => V40.openProfileShare()] },
    { k: /(quiz|trilha|vil[aã]o|gloss[aá]rio|p[oó]s.?cr[eé]dito)/, a: 'Tudo isso fica no 📚 Universo.', act: ['📚 Universo', () => V40.openUniverse()] },
    { k: /(vers[aã]o|atualiz|recarreg)/, a: `Você está na ${typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'v40'}. Pra pegar a versão nova, toque em 🔄 Recarregar (em qualquer aba).` },
    { k: /(adicionar|novo t[ií]tulo|mover (um )?t[ií]tulo|outra fase)/, a: 'Adicionar e mover títulos agora fica em Config ▸ ➕ Adicionar / mover títulos.', act: ['➕ Abrir', () => switchTab('tabAdicionar')] },
    { k: /(sorteio|o que (eu )?assist|n[aã]o sei o que ver)/, a: 'O 🎲 Sorteio escolhe entre o que é de hoje, os atrasados e os próximos da fila.', act: ['🎲 Sortear', () => V40.openDraw()] }
  ];
  const BUG = /(bug|erro|errad|trav|n[aã]o (funciona|abre|aparece|carrega|salva)|sumi|quebr|bugou|estranho|cortando|fora de ordem)/;
  const WISH = /(quero|queria|coloca|adiciona|cria|muda|tira|remove|podia|poderia|seria legal|ideia|sugest)/;

  function answer(q) {
    const n = (q || '').toLowerCase();
    if (/^(oi|ol[aá]|e a[ií]|bom dia|boa tarde|boa noite)\b/.test(n) && n.length < 20) {
      return { text: 'Oi! 👋 Sou o assistente do app. Me pergunte como fazer algo, ou descreva um bug ou ideia — aí eu preparo o pedido pra mandar pro Claude.' };
    }
    const hit = FAQ.find(f => f.k.test(n));
    if (BUG.test(n)) {
      const issues = V40.healthCheck ? V40.healthCheck().filter(i => i.lvl !== 'info') : [];
      return {
        text: `Entendi, parece um problema.${issues.length ? ` A verificação achou ${issues.length} aviso(s) nos dados — vão junto no pedido.` : ' A verificação não achou nada estranho nos dados.'}${hit ? '\n\nTalvez ajude: ' + hit.a : ''}\n\nMandando pro Claude, ele corrige. Se der, tire um print da tela e mande junto.`,
        pedido: true, act: hit && hit.act
      };
    }
    if (WISH.test(n)) return { text: 'Boa ideia! Isso eu não consigo fazer daqui — mas já deixo o pedido pronto pra mandar pro Claude, com as informações do app.' + (hit ? '\n\nTalvez algo parecido já exista: ' + hit.a : ''), act: hit && hit.act, pedido: true };
    if (hit) return { text: hit.a, act: hit.act, act2: hit.act2 };
    return { text: 'Não sei responder isso sozinho. Se for um pedido ou problema, mande pro Claude por aqui:', pedido: true };
  }

  // ---------- pedido pronto ----------
  function pedidoText(msg) {
    const who = MODE === 'amigo' ? 'Lista do amigo (breno779.github.io/amigo/)' : 'UCM Watchlist (breno779.github.io)';
    return `📨 Pedido do app — ${who}\n\n${msg}\n\n— informações automáticas —\n${V40.diagnostics()}`;
  }
  async function sendClaude(text) {
    try { await navigator.clipboard.writeText(text); V40.toast('📋 Pedido copiado — é só colar no Claude'); } catch (e) {}
    const url = text.length < 1800 ? 'https://claude.ai/new?q=' + encodeURIComponent(text) : 'https://claude.ai/new';
    window.open(url, '_blank', 'noopener');
  }
  function sendWhats(text) {
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
  }
  async function sendShare(text) {
    try { if (navigator.share) { await navigator.share({ title: 'Pedido do app', text }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text); V40.toast('📋 Copiado'); } catch (e) {}
  }

  // ---------- tela ----------
  const actions = {};
  V40.renderPedidos = function () {
    const page = document.getElementById('tabPedidos');
    if (!page) return;
    if (!V40.chat.length) push('bot', MODE === 'amigo'
      ? 'Oi! 👋 Sou o assistente da sua lista. Me pergunte como fazer algo, ou conte um problema/ideia — eu monto a mensagem pra você mandar pro dono do app.'
      : 'Oi! 👋 Sou o assistente do app (funciono sem internet). Me pergunte como fazer algo, ou conte um bug ou ideia — eu monto o pedido com as informações do app pra você mandar pro Claude.');
    let n = 0;
    Object.keys(actions).forEach(k => delete actions[k]);
    const bubbles = V40.chat.map((m, i) => {
      if (m.from === 'me') return `<div class="v40-msg me"><div>${V40.esc(m.text)}</div></div>`;
      let btns = '';
      (m.acts || []).forEach(a => { const id = 'a' + (n++); actions[id] = a; btns += `<button data-act="${id}">${V40.esc(a)}</button>`; });
      if (m.pedido) btns += `<button class="v40-primary" data-ped="${i}">📨 ${MODE === 'amigo' ? 'Mandar pro dono do app' : 'Mandar pro Claude'}</button>`;
      return `<div class="v40-msg bot"><div>${V40.esc(m.text).replace(/\n/g, '<br>')}</div>${btns ? `<div class="v40-msg-acts">${btns}</div>` : ''}</div>`;
    }).join('');
    const sent = (V40.get('pedidos', []) || []).slice().reverse();
    page.innerHTML = `
      <h2 class="v40-page-title">💬 Pedidos e ajuda</h2>
      <div class="v40-chat" id="v40Chat">${bubbles}</div>
      <div class="v40-chat-in">
        <textarea id="v40ChatTxt" rows="2" placeholder="Pergunte algo ou descreva um bug/ideia…"></textarea>
        <button class="v40-primary" id="v40ChatSend">Enviar</button>
      </div>
      <div class="v40-chips">${['Como marco vários episódios?', 'Fiquei atrasado', 'Achei um bug', 'Tenho uma ideia', 'Como mando pro meu amigo?'].map(t => `<button data-sug="${V40.esc(t)}">${V40.esc(t)}</button>`).join('')}</div>
      ${sent.length ? `<div class="stat-card" style="margin-top:12px;"><h4>📨 Pedidos que você mandou</h4>${sent.slice(0, 15).map((p, i) => `<div class="v40-row"><span style="flex:1">${V40.esc(p.text.slice(0, 120))}${p.text.length > 120 ? '…' : ''}<br><small class="v40-muted">${new Date(p.at).toLocaleString('pt-BR')} · via ${p.via}</small></span><button data-resend="${sent.length - 1 - i}">📋</button></div>`).join('')}</div>` : ''}
      <div class="dash-actions" style="margin-top:10px;"><button id="v40ChatClear">🧹 Limpar conversa</button><button id="v40ChatDiag">🔎 Ver diagnóstico</button></div>
      <p class="v40-muted">O assistente funciona sem internet e não manda nada sozinho: os pedidos só saem quando você toca em mandar.</p>`;
    const box = document.getElementById('v40Chat');
    box.scrollTop = box.scrollHeight;
    const send = () => {
      const t = document.getElementById('v40ChatTxt').value.trim();
      if (!t) return;
      push('me', t);
      const r = answer(t);
      const acts = [];
      if (r.act) acts.push(r.act[0]);
      if (r.act2) acts.push(r.act2[0]);
      push('bot', r.text, { acts, pedido: !!r.pedido, q: t });
      V40.renderPedidos();
    };
    document.getElementById('v40ChatSend').addEventListener('click', send);
    document.getElementById('v40ChatTxt').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    page.querySelectorAll('[data-sug]').forEach(b => b.addEventListener('click', () => { document.getElementById('v40ChatTxt').value = b.dataset.sug; send(); }));
    page.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      const label = actions[b.dataset.act];
      const f = FAQ.find(x => (x.act && x.act[0] === label) || (x.act2 && x.act2[0] === label));
      const fn = f ? (f.act && f.act[0] === label ? f.act[1] : f.act2[1]) : null;
      if (fn) fn();
    }));
    page.querySelectorAll('[data-ped]').forEach(b => b.addEventListener('click', () => {
      const m = V40.chat[+b.dataset.ped];
      const q = m.q || '';
      openSend(q);
    }));
    page.querySelectorAll('[data-resend]').forEach(b => b.addEventListener('click', () => {
      const p = (V40.get('pedidos', []) || [])[+b.dataset.resend];
      if (p) sendShare(pedidoText(p.text));
    }));
    document.getElementById('v40ChatClear').addEventListener('click', () => { if (confirm('Limpar a conversa?')) { V40.chat = []; saveChat(); V40.renderPedidos(); } });
    document.getElementById('v40ChatDiag').addEventListener('click', () => V40.modal(`<h3>🔎 Diagnóstico</h3><pre class="v40-pre">${V40.esc(V40.diagnostics())}</pre>`));
  };
  function openSend(q) {
    V40.modal(`<h3>📨 ${MODE === 'amigo' ? 'Mandar pro dono do app' : 'Mandar pro Claude'}</h3>
      <label class="v40-muted">O que você quer (pode editar):</label>
      <textarea id="v40PedTxt" rows="4" class="v40-ped-txt">${V40.esc(q)}</textarea>
      <details class="v40-help"><summary>Vai junto (automático)</summary><pre class="v40-pre">${V40.esc(V40.diagnostics())}</pre></details>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px;">
        ${MODE === 'amigo' ? '' : '<button class="v40-primary" id="v40PedClaude">🤖 Copiar e abrir o Claude</button>'}
        <button id="v40PedWhats">💬 Mandar pelo WhatsApp</button>
        <button id="v40PedShare">📤 Outro app / copiar</button>
      </div>
      <p class="v40-muted">${MODE === 'amigo' ? 'Manda pro Breno, que repassa pro Claude.' : 'No Claude: o pedido já vai escrito (ou cole, se não aparecer). Mande um print junto se for bug.'}</p>`);
    const done = via => {
      const txt = document.getElementById('v40PedTxt').value.trim() || q;
      const list = V40.get('pedidos', []) || [];
      list.push({ text: txt, at: new Date().toISOString(), via });
      V40.set('pedidos', list);
      return pedidoText(txt);
    };
    const c = document.getElementById('v40PedClaude');
    if (c) c.addEventListener('click', () => { sendClaude(done('Claude')); closeModal(); });
    document.getElementById('v40PedWhats').addEventListener('click', () => { sendWhats(done('WhatsApp')); closeModal(); });
    document.getElementById('v40PedShare').addEventListener('click', () => { sendShare(done('compartilhar')); closeModal(); });
  }
  V40.openPedido = openSend;

  injectTab();
})();
