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
  // Responde com os dados de verdade da lista (quanto falta, data final, o que tem hoje…),
  // começa com "sim/não" quando a pergunta é de sim ou não, e não repete a mesma resposta.
  const fmt = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—';
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const nm = it => String(it.text || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
  function syncLine() {
    const st = V40.syncState || {};
    let s = st.auto ? 'Neste aparelho a 🔄 Automática está ligada ✅.' : 'Neste aparelho a 🔄 Automática está desligada — dá pra ligar na tela de sincronização.';
    if (st.lastPushAt) s += ` Último envio daqui: ${new Date(st.lastPushAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.`;
    return s;
  }
  const FAQ = [
    { id: 'hoje', k: /(o que (eu )?(assisto|vejo|tem|vou ver|vou assistir)( pra)? hoje|plano de hoje|programa(do|cao) (de|pra) hoje|hoje tem)/, ans: () => {
      const p = V40.todayPlan();
      const parts = [];
      if (p.epsTotal) parts.push(`${p.epsTotal} episódio(s) (${p.epsDone} já marcado(s))`);
      p.titles.forEach(t => parts.push(`${nm(t.it)}${t.done ? ' ✅' : ''}`));
      let s = parts.length ? `Hoje: ${parts.join(' · ')}.` : 'Hoje não tem nada programado 🎉.';
      if (p.late) s += `\n\nE tem ${p.late} episódio(s) atrasado(s) — dá pra resolver no Início.`;
      const cur = V40.currentItem && V40.currentItem();
      if (!parts.length && cur) s += ` O próximo da fila é ${nm(cur)}${cur.watchStart ? ` (${fmt(cur.watchStart)})` : ''}.`;
      return s;
    }, act: ['🎲 Sortear o que ver', () => V40.openDraw()] },
    { id: 'falta', k: /(quanto(s)? (falta|ja vi|eu ja)|progresso|porcentagem|quantos (titulos|filmes|eu vi))/, ans: () => {
      const total = items.length, done = items.filter(i => i.done).length;
      const end = V40.endDate && V40.endDate();
      return `Você já viu ${done} de ${total} títulos (${Math.round(done / total * 100)}%). Faltam ${total - done}.${end ? ` No ritmo de agora, você termina em ${fmt(end)} — daqui a ${daysBetween(V40.today(), end)} dias.` : ''}`;
    } },
    { id: 'fim', k: /(quando (eu )?(termino|vou terminar|acaba)|data final|data de termino|terminar a lista)/, ans: () => {
      const end = V40.endDate && V40.endDate();
      return end ? `No ritmo de agora, você termina em ${fmt(end)} (daqui a ${daysBetween(V40.today(), end)} dias). Se mudar os episódios por dia ou atrasar, essa data anda junto.` : 'Não achei data final — parece que não tem nada pendente com data. 🎉';
    }, act: ['⏱ Episódios por dia', () => V40.openRateSettings()] },
    { id: 'prox', k: /(qual (e |eh )?o proximo|o que vem depois|proximo (titulo|filme|da fila))/, ans: () => {
      const cur = V40.currentItem && V40.currentItem();
      return cur ? `O próximo é ${nm(cur)}${cur.watchStart ? `, marcado pra ${fmt(cur.watchStart)}` : ''}.` : 'Não tem nada pendente na fila. 🎉';
    } },
    { id: 'streak', k: /(sequencia|streak|dias seguidos|ofensiva)/, ans: () => {
      const s = V40.currentStreak ? V40.currentStreak() : 0;
      return s ? `Sua sequência está em ${s} dia(s) seguido(s) 🔥. Marcar qualquer episódio ou título no dia conta.` : 'Sua sequência está zerada agora. Marque qualquer episódio ou título hoje pra começar de novo 🔥.';
    }, act: ['🏆 Ver troféus', () => switchTab('tabConquistas')] },
    { id: 'sync', k: /(sincron|ipad|nuvem|outro aparelho|tablet|celular novo|vice.?versa|nos (2|dois) aparelhos)/, ans: n => {
      if (/(autom|sozinh|instant|tempo real|na hora|vice.?versa|vai (aparecer|marcar|atualizar|mudar)|aparece (no|la|tambem))/.test(n)) {
        return 'Não fica 100% automático — é de propósito, mas é quase:\n\nCom a 🔄 Automática ligada nos dois aparelhos, o que você marca no celular sobe pra nuvem sozinho em poucos segundos. Quando você abrir o app no iPad, aparece um aviso "☁️ O outro aparelho tem X mudanças" — toca em Ver ▸ Juntar e ele marca lá também. No caminho contrário é igual.\n\nEle não aplica sem você tocar de propósito porque, nas vezes em que aplicava sozinho, já apagou progresso.\n\n' + syncLine();
      }
      return `Pra ter a mesma lista no celular e no iPad, os dois usam o mesmo código (o deste aparelho é ${V40.syncCode()}). Na tela de sincronização você compara os dois lados e escolhe juntar, ficar com um ou com o outro.\n\n` + syncLine();
    }, short: 'Resumindo: o que você marca sobe sozinho pra nuvem (com a 🔄 Automática ligada), mas no outro aparelho ele só junta quando você toca em Ver ▸ Juntar no aviso que aparece ao abrir o app.', act: ['☁️ Abrir sincronização', () => V40.openSync()] },
    { id: 'atraso', k: /(atras|perdi (uns|alguns) dias|fiquei pra tras)/, a: 'Sem problema. No Início aparece o botão vermelho "⏰ … atrasado(s) — resolver". Lá você escolhe: recomeçar de hoje (a data final anda), diluir (+1 ep por dia, a data final não muda) ou deixar como está.', act: ['🧯 Resolver atraso', () => V40.openLateHelper()] },
    { id: 'desfazer', k: /(desfa[zc]|voltar (atras|como estava)|errei|apaguei|sumiu (meu|o) progresso|restaurar)/, a: 'Dá pra voltar, sim. Logo depois de marcar aparece "↺ Desfazer". Pra voltar a lista inteira pra um dia anterior, use o Histórico de versões. Título removido fica 30 dias na lixeira.', act: ['🕰 Histórico de versões', () => V40.openVersions()], act2: ['🗑 Lixeira', () => V40.showTrash()] },
    { id: 'eps', k: /(varios ep|todos os ep|marcar (de uma vez|varios)|ate hoje)/, a: 'Abra os episódios da série e toque em "✓ Marcar todos até hoje" — ou segure o dedo num episódio pra marcar todos até ele.' },
    { id: 'mata', k: /(mata.?mata|verdadeiro 10|libertadores)/, a: 'Os 8 primeiros do campeonato jogam a Libertadores: quartas (1×8, 4×5, 2×7, 3×6), semi e final. Sem empate no mata-mata. Fica em 🥇 Liga ▸ 🏆 Libertadores.', act: ['🏆 Abrir a Libertadores', () => { V40.ligaTab = 'mata'; switchTab('tabLiga'); }] },
    { id: 'liga', k: /(liga|campeonato|pontos|classifica|ranking|jogo|partida)/, a: 'O campeonato é todos contra todos: em 🥇 Liga ▸ ⚽ Jogos aparece um confronto por vez e você toca no vencedor ou no = (empate). Vitória 3, empate 1, derrota 0. Séries contam como 1 time só.', act: ['⚽ Jogar', () => { V40.ligaTab = 'jogos'; switchTab('tabLiga'); }] },
    { id: 'capa', k: /(capa|poster|imagem|sinopse|elenco|trailer|tmdb|chave)/, a: 'Capas, sinopse, elenco, trailer e onde assistir vêm do TMDB com a sua chave (Config ▸ 🌐 Dados de fora). Toque na capa de um título pra ver a ficha.', act: ['🌐 Dados de fora', () => V40.openExtSettings()] },
    { id: 'ritmo', k: /(ritmo|ep(isodios)? por dia|eps? \/ ?dia|mais rapido|mais devagar)/, a: 'Você escolhe quantos episódios por dia em Início ▸ ⏱ Episódios por dia. Vale a partir de amanhã, e o app mostra a data final nova antes de aplicar.', act: ['⏱ Episódios por dia', () => V40.openRateSettings()] },
    { id: 'folga', k: /(folga|hoje nao|viagem|pausa|ferias)/, a: 'Pra um dia só: "🛌 Hoje não vou assistir" no Início. Pra vários dias: ✈️ Modo viagem. Nos dois o cronograma se ajusta sozinho.', act: ['🛌 Hoje não vou assistir', () => V40.skipToday()], act2: ['✈️ Modo viagem', () => V40.openTravel()] },
    { id: 'lembrete', k: /(lembrete|notifica|alarme|avisar)/, a: 'Os lembretes vão pro calendário do celular (um evento por dia com o que assistir). Assim avisa mesmo com o app fechado.', act: ['⏰ Lembretes', () => V40.openReminders()] },
    { id: 'senha', k: /(senha|pin|bloque|digital|biometria|rosto)/, a: 'Dá pra pôr PIN e digital/rosto pra abrir o app.', act: ['🔒 Senha / biometria', () => V40.openLockSettings()] },
    { id: 'backup', k: /(backup|exportar|planilha|csv|excel)/, a: 'Config ▸ ⬇ Exportar backup guarda tudo num arquivo. Pra planilha: 📊 Exportar planilha (CSV). E se a sincronização estiver em uso, a nuvem guarda um backup por semana.', act: ['📊 Planilha', () => V40.exportCSV()] },
    { id: 'apk', k: /(apk|android|instalar|baixar o app)/, a: 'O app Android abre a lista num app próprio, sem depender do Chrome. No iPad/iPhone é só usar "Adicionar à Tela de Início" no Safari.', act: ['📲 App Android', () => V40.openApk()] },
    { id: 'tema', k: /(tema|cor|escuro|claro|letra|fonte|tamanho)/, a: 'Tema por herói, claro/escuro/automático e tamanho da letra ficam em Aparência.', act: ['🎨 Aparência', () => V40.openAppearance()] },
    { id: 'amigo', k: /(amigo|perfil|compartilh|mandar pra alguem)/, a: 'Pro seu amigo ter a lista dele: mande o link breno779.github.io/amigo/. Pra ele ver o seu progresso: 👥 Perfil pra amigos.', act: ['👥 Perfil', () => V40.openProfileShare()] },
    { id: 'universo', k: /(quiz|trilha|vilao|glossario|pos.?credito)/, a: 'Tudo isso fica no 📚 Universo.', act: ['📚 Universo', () => V40.openUniverse()] },
    { id: 'versao', k: /(versao|atualiz|recarreg)/, ans: () => `Você está na ${typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'v40'}. Pra pegar a versão mais nova, toque em 🔄 Recarregar (tem em qualquer aba).` },
    { id: 'add', k: /(adicionar|novo titulo|mover (um )?titulo|outra fase)/, a: 'Adicionar e mover títulos fica em Config ▸ ➕ Adicionar / mover títulos.', act: ['➕ Abrir', () => switchTab('tabAdicionar')] },
    { id: 'sorteio', k: /(sorteio|o que (eu )?assist|nao sei o que ver)/, a: 'O 🎲 Sorteio escolhe entre o que é de hoje, os atrasados e os próximos da fila.', act: ['🎲 Sortear', () => V40.openDraw()] }
  ];
  const BUG = /(bug|erro|errad|trav|nao (funciona|abre|aparece|carrega|salva)|sumi|quebr|bugou|estranho|cortando|fora de ordem)/;
  const WISH = /(quero|queria|coloca|adiciona|cria|muda |tira|remove|podia|poderia|seria (legal|bom)|ideia|sugest)/;
  const QUESTION = /(\?|^(e |ai |mas |entao )?(se eu|da pra|consigo|tem como|vai |posso|e possivel|funciona|como|onde|quando|qual|quanto|o que|por ?que))/;

  function answer(q) {
    const n = norm(q).trim();
    if (/^(oi+|ola|e ai|eai|bom dia|boa tarde|boa noite|salve)\b/.test(n) && n.length < 20) {
      return { text: pick(['Oi! 👋 Em que posso ajudar?', 'E aí! 👋 Pode perguntar — progresso, o que ver hoje, sincronização, Liga…', 'Opa! 👋 Manda a pergunta, ou conta um bug/ideia.']) };
    }
    if (/^(obrigad|valeu|vlw|top|show|massa|perfeito|boa)\b/.test(n) && n.length < 25) {
      return { text: pick(['Por nada! 😄', 'Tamo junto! 🦸', 'Disponha! Qualquer coisa é só chamar.']) };
    }
    if (/(quem (e|eh) voce|o que voce (faz|sabe)|me ajuda|ajuda$)/.test(n)) {
      return { text: 'Sou o assistente do app e funciono sem internet. Sei te dizer:\n• quanto falta e quando você termina\n• o que tem pra ver hoje e qual é o próximo\n• sua sequência de dias\n• como resolver atrasos, sincronizar celular e iPad, usar a Liga, capas, lembretes, senha…\n\nSe for um bug ou ideia, eu monto o pedido pro Claude.' };
    }
    const hit = FAQ.find(f => f.k.test(n));
    const hitText = hit ? (hit.ans ? hit.ans(n) : hit.a) : null;
    const base = hit ? { text: hitText, act: hit.act, act2: hit.act2, hid: hit.id, short: hit.short } : null;
    // pergunta sobre um assunto que eu conheço: responde direto (mesmo se tiver "bug" no meio)
    if (base && QUESTION.test(n) && !/(bug|erro|bugou|quebr|trav)/.test(n)) return base;
    if (BUG.test(n)) {
      const issues = V40.healthCheck ? V40.healthCheck().filter(i => i.lvl !== 'info') : [];
      return {
        text: `${pick(['Poxa, vamos resolver isso.', 'Entendi, parece um problema.', 'Hmm, isso não devia acontecer.'])}${issues.length ? ` A verificação achou ${issues.length} aviso(s) nos dados — eles vão junto no pedido.` : ' Dei uma olhada nos dados e não achei nada estranho, então provavelmente é coisa do app mesmo.'}${hitText ? '\n\nEnquanto isso, talvez ajude: ' + hitText : ''}\n\nMande pro Claude que ele corrige. Um print da tela ajuda muito (dá pra anexar no 📎).`,
        pedido: true, act: hit && hit.act, hid: 'bug'
      };
    }
    if (WISH.test(n) && !QUESTION.test(n)) return { text: pick(['Boa ideia!', 'Gostei!', 'Faz sentido!']) + ' Isso eu não consigo mudar daqui, mas o pedido já está pronto pra mandar pro Claude, com as informações do app.' + (hitText ? '\n\nSó pra saber, algo parecido já existe: ' + hitText : ''), act: hit && hit.act, pedido: true, hid: 'wish' };
    if (base) return base;
    return {
      text: pick(['Hmm, essa eu não sei responder sozinho 🤔.', 'Não entendi bem essa 🤔.']) + ' Posso falar de: quanto falta, o que ver hoje, data final, atrasos, sincronização, Liga, capas, lembretes, senha.\n\nSe for algo diferente, mande pro Claude — ele responde direitinho.',
      pedido: true, hid: 'nada'
    };
  }
  // não repete a mesma resposta duas vezes seguidas
  function answerFresh(q) {
    const r = answer(q);
    const lastBot = V40.chat.slice().reverse().find(m => m.from === 'bot');
    if (lastBot && r.hid && lastBot.hid === r.hid && lastBot.text.split('\n\n📎')[0] === r.text) {
      if (r.short) return Object.assign({}, r, { text: r.short, hid: r.hid + '-curto' });
      return Object.assign({}, r, { text: 'É a mesma resposta de antes 😅 — se não era isso que você queria saber, tenta perguntar de outro jeito ou mande pro Claude.', pedido: true, hid: 'repeat' });
    }
    return r;
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
      : 'Oi! 👋 Pode perguntar o que quiser sobre a lista — quanto falta, o que ver hoje, sincronização, Liga… Se for bug ou ideia, eu monto o pedido pro Claude.');
    let n = 0;
    Object.keys(actions).forEach(k => delete actions[k]);
    const bubbles = V40.chat.map((m, i) => {
      if (m.from === 'me') return `<div class="v40-msg me">${(m.att || []).length ? `<div class="v40-att-row">${m.att.map(a => a.thumb ? `<img src="${a.thumb}" alt="">` : `<span class="v40-att-ic">${a.kind === 'vid' ? '🎬' : '📎'}</span>`).join('')}</div>` : ''}${m.text ? `<div>${V40.esc(m.text)}</div>` : ''}</div>`;
      let btns = '';
      (m.acts || []).forEach(a => { const id = 'a' + (n++); actions[id] = a; btns += `<button data-act="${id}">${V40.esc(a)}</button>`; });
      if (m.pedido) btns += `<button class="v40-primary" data-ped="${i}">📨 ${MODE === 'amigo' ? 'Mandar pro dono do app' : 'Mandar pro Claude'}</button>`;
      return `<div class="v40-msg bot"><div>${V40.esc(m.text).replace(/\n/g, '<br>')}</div>${btns ? `<div class="v40-msg-acts">${btns}</div>` : ''}</div>`;
    }).join('');
    const sent = (V40.get('pedidos', []) || []).slice().reverse();
    page.innerHTML = `
      <h2 class="v40-page-title">💬 Pedidos e ajuda</h2>
      <div class="v40-chat" id="v40Chat">${bubbles}</div>
      <div class="v40-att-preview" id="v40AttPrev">${pending.map((a, i) => `<span class="v40-att-p">${a.thumb ? `<img src="${a.thumb}" alt="">` : `<span class="v40-att-ic">${a.kind === 'vid' ? '🎬' : '📎'}</span>`}<button data-unatt="${i}" title="Tirar">✕</button></span>`).join('')}</div>
      <div class="v40-chat-in">
        <button class="v40-clip" id="v40ChatClip" title="Anexar foto ou vídeo">📎</button>
        <textarea id="v40ChatTxt" rows="2" placeholder="Pergunte algo ou descreva um bug/ideia…"></textarea>
        <button class="v40-primary" id="v40ChatSend">Enviar</button>
      </div>
      <input type="file" id="v40ChatFile" accept="image/*,video/*" multiple style="display:none;">
      <div class="v40-chips">${['Como marco vários episódios?', 'Fiquei atrasado', 'Achei um bug', 'Tenho uma ideia', 'Como mando pro meu amigo?'].map(t => `<button data-sug="${V40.esc(t)}">${V40.esc(t)}</button>`).join('')}</div>
      ${sent.length ? `<div class="stat-card" style="margin-top:12px;"><h4>📨 Pedidos que você mandou</h4>${sent.slice(0, 15).map((p, i) => `<div class="v40-row"><span style="flex:1">${V40.esc(p.text.slice(0, 120))}${p.text.length > 120 ? '…' : ''}<br><small class="v40-muted">${new Date(p.at).toLocaleString('pt-BR')} · via ${p.via}</small></span><button data-resend="${sent.length - 1 - i}">📋</button></div>`).join('')}</div>` : ''}
      <div class="dash-actions" style="margin-top:10px;"><button id="v40ChatClear">🧹 Limpar conversa</button><button id="v40ChatDiag">🔎 Ver diagnóstico</button></div>
      <p class="v40-muted">O assistente funciona sem internet e não manda nada sozinho: os pedidos só saem quando você toca em mandar.</p>`;
    const box = document.getElementById('v40Chat');
    box.scrollTop = box.scrollHeight;
    const send = () => {
      const t = document.getElementById('v40ChatTxt').value.trim();
      if (!t && !pending.length) return;
      const att = pending.map(a => ({ id: a.id, kind: a.kind, name: a.name, thumb: a.thumb }));
      const ids = pending.map(a => a.id);
      pending = [];
      push('me', t, { att });
      if (!t) {
        push('bot', `Recebi ${att.length} anexo(s) 📎. Eu não consigo ver o que tem neles daqui, mas eles vão junto quando você mandar o pedido. Conta em poucas palavras o que é?`, { pedido: true, q: '', atts: ids });
        V40.renderPedidos();
        return;
      }
      const r = answerFresh(t);
      const acts = [];
      if (r.act) acts.push(r.act[0]);
      if (r.act2) acts.push(r.act2[0]);
      let txt = r.text;
      if (ids.length) txt += `\n\n📎 ${ids.length} anexo(s) vão junto no pedido (eu não consigo ver o conteúdo, mas o Claude consegue).`;
      push('bot', txt, { acts, pedido: !!r.pedido || ids.length > 0, q: t, atts: ids, hid: r.hid });
      V40.renderPedidos();
    };
    document.getElementById('v40ChatClip').addEventListener('click', () => document.getElementById('v40ChatFile').click());
    document.getElementById('v40ChatFile').addEventListener('change', async e => {
      const files = Array.from(e.target.files || []);
      for (const f of files) {
        if (pending.length >= 6) { V40.toast('Máximo de 6 anexos por vez'); break; }
        if (f.size > 60 * 1024 * 1024) { V40.toast(`"${f.name}" é grande demais (máx. 60 MB)`); continue; }
        const id = 'f' + Date.now() + Math.random().toString(36).slice(2, 6);
        const kind = f.type.startsWith('video') ? 'vid' : 'img';
        attachFiles[id] = f;
        pending.push({ id, kind, name: f.name, thumb: await makeThumb(f, kind) });
      }
      e.target.value = '';
      const keep = document.getElementById('v40ChatTxt').value;
      V40.renderPedidos();
      document.getElementById('v40ChatTxt').value = keep;
    });
    page.querySelectorAll('[data-unatt]').forEach(b => b.addEventListener('click', () => {
      const keep = document.getElementById('v40ChatTxt').value;
      pending.splice(+b.dataset.unatt, 1); V40.renderPedidos();
      document.getElementById('v40ChatTxt').value = keep;
    }));
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
      openSend(m.q || '', m.atts || []);
    }));
    page.querySelectorAll('[data-resend]').forEach(b => b.addEventListener('click', () => {
      const p = (V40.get('pedidos', []) || [])[+b.dataset.resend];
      if (p) sendShare(pedidoText(p.text));
    }));
    document.getElementById('v40ChatClear').addEventListener('click', () => { if (confirm('Limpar a conversa?')) { V40.chat = []; saveChat(); V40.renderPedidos(); } });
    document.getElementById('v40ChatDiag').addEventListener('click', () => V40.modal(`<h3>🔎 Diagnóstico</h3><pre class="v40-pre">${V40.esc(V40.diagnostics())}</pre>`));
  };
  function openSend(q, attIds) {
    attIds = attIds || [];
    const files = attIds.map(id => attachFiles[id]).filter(Boolean);
    const lost = attIds.length - files.length;
    V40.modal(`<h3>📨 ${MODE === 'amigo' ? 'Mandar pro dono do app' : 'Mandar pro Claude'}</h3>
      <label class="v40-muted">O que você quer (pode editar):</label>
      <textarea id="v40PedTxt" rows="4" class="v40-ped-txt">${V40.esc(q)}</textarea>
      ${files.length ? `<p>📎 ${files.length} anexo(s): ${files.map(f => V40.esc(f.name)).join(', ')}</p>` : ''}
      ${lost ? `<p class="v40-muted">⚠️ ${lost} anexo(s) não estão mais na memória (o app foi fechado). Anexe de novo se precisar.</p>` : ''}
      <details class="v40-help"><summary>Vai junto (automático)</summary><pre class="v40-pre">${V40.esc(V40.diagnostics())}</pre></details>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px;">
        ${files.length ? `<button class="v40-primary" id="v40PedFiles">📤 Mandar COM os anexos (escolha ${MODE === 'amigo' ? 'o WhatsApp' : 'o Claude ou o WhatsApp'})</button>` : ''}
        ${MODE === 'amigo' ? '' : `<button class="${files.length ? '' : 'v40-primary'}" id="v40PedClaude">🤖 Copiar e abrir o Claude${files.length ? ' (só o texto)' : ''}</button>`}
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
    const pf = document.getElementById('v40PedFiles');
    if (pf) pf.addEventListener('click', async () => { const ok = await shareFiles(done('anexos'), files); if (ok) closeModal(); });
    const c = document.getElementById('v40PedClaude');
    if (c) c.addEventListener('click', () => { sendClaude(done('Claude')); closeModal(); });
    document.getElementById('v40PedWhats').addEventListener('click', () => { sendWhats(done('WhatsApp')); closeModal(); });
    document.getElementById('v40PedShare').addEventListener('click', () => { sendShare(done('compartilhar')); closeModal(); });
  }
  V40.openPedido = openSend;

  // ---------- anexos ----------
  const attachFiles = {};   // id -> File (só na memória enquanto o app está aberto)
  let pending = [];         // anexos escolhidos, ainda não enviados no chat
  function makeThumb(file, kind) {
    return new Promise(res => {
      const done = (src) => {
        try {
          const W = 160;
          const c = document.createElement('canvas');
          const r = Math.min(1, W / Math.max(src.width || src.videoWidth, src.height || src.videoHeight));
          c.width = Math.round((src.width || src.videoWidth) * r); c.height = Math.round((src.height || src.videoHeight) * r);
          c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
          res(c.toDataURL('image/jpeg', 0.7));
        } catch (e) { res(null); }
      };
      const url = URL.createObjectURL(file);
      if (kind === 'img') {
        const im = new Image();
        im.onload = () => { done(im); URL.revokeObjectURL(url); };
        im.onerror = () => { res(null); URL.revokeObjectURL(url); };
        im.src = url;
      } else {
        const v = document.createElement('video');
        v.muted = true; v.playsInline = true; v.preload = 'metadata';
        const to = setTimeout(() => res(null), 2500);
        v.onloadeddata = () => { try { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); } catch (e) {} };
        v.onseeked = () => { clearTimeout(to); done(v); URL.revokeObjectURL(url); };
        v.onerror = () => { clearTimeout(to); res(null); };
        v.src = url;
      }
    });
  }
  function toB64(file) {
    return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => { const s = fr.result; res(s.slice(s.indexOf(',') + 1)); }; fr.onerror = rej; fr.readAsDataURL(file); });
  }
  async function shareFiles(text, files) {
    // 1) navegador com compartilhamento de arquivos (Chrome no Android, Safari no iPhone/iPad)
    try {
      if (navigator.canShare && navigator.canShare({ files })) {
        await navigator.share({ files, text, title: 'Pedido do app' });
        return true;
      }
    } catch (e) { if (e && e.name === 'AbortError') return false; }
    // 2) dentro do app Android (APK)
    let app = null;
    try { app = window.UCMApp || (window.parent && window.parent.UCMApp) || null; } catch (e) {}
    if (app && typeof app.shareFiles === 'function') {
      const total = files.reduce((s, f) => s + f.size, 0);
      if (total > 40 * 1024 * 1024) { alert('Anexos grandes demais pra mandar pelo app (máx. 40 MB juntos). Tente um vídeo menor.'); return false; }
      V40.toast('📤 Preparando os anexos…');
      const arr = [];
      for (const f of files) arr.push({ name: f.name, mime: f.type || 'application/octet-stream', b64: await toB64(f) });
      app.shareFiles(text, JSON.stringify(arr));
      return true;
    }
    // 3) sem jeito de mandar arquivos: copia o texto
    try { await navigator.clipboard.writeText(text); } catch (e) {}
    alert('Este navegador não deixa mandar os anexos direto. O texto foi copiado — abra o Claude (ou WhatsApp), cole e anexe os prints/vídeos pela galeria.');
    return true;
  }

  injectTab();
})();
