#!/usr/bin/env python3
"""Gera beta/index.html (v40 beta) a partir do principal.html.

A beta usa um "armazenamento próprio": todas as chaves do localStorage ganham o prefixo
'v40b:' (shim no <head>), então ela nunca lê nem escreve o progresso do app atual. Na
primeira abertura ela COPIA (só leitura) o progresso do app atual pra dentro dela.
A sincronização com a nuvem fica desligada na beta (Firebase nem é carregado).

Uso: python3 tools/build_beta.py   (roda da raiz do repositório)
"""
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'principal.html'
OUT = ROOT / 'beta' / 'index.html'
BUILD = time.strftime('%Y%m%d%H%M')

V40_SCRIPTS = ['v40-catalog.js', 'v40-core.js', 'v40-liga.js', 'v40-stats.js', 'v40-fun.js', 'v40-data.js', 'v40-content.js', 'v40-sync.js', 'v40-system.js']

HEAD_SHIM = r"""<script>
// ===== v40 beta: armazenamento próprio =====
// Toda chave do localStorage desta página ganha o prefixo 'v40b:'. Assim a beta tem a
// "gaveta" dela e nunca mexe no progresso do app atual (que usa as chaves sem prefixo).
(function () {
  var P = 'v40b:';
  var S = Storage.prototype;
  var g = S.getItem, s = S.setItem, r = S.removeItem, k = S.key;
  window.__v40real = {
    get: function (key) { try { return g.call(window.localStorage, key); } catch (e) { return null; } },
    keys: function () {
      var out = [];
      try { for (var i = 0; i < window.localStorage.length; i++) out.push(k.call(window.localStorage, i)); } catch (e) {}
      return out;
    },
    setRaw: function (key, v) { return s.call(window.localStorage, key, v); },
    removeRaw: function (key) { return r.call(window.localStorage, key); }
  };
  S.getItem = function (key) { return g.call(this, P + key); };
  S.setItem = function (key, v) { return s.call(this, P + key, v); };
  S.removeItem = function (key) { return r.call(this, P + key); };

  // cópia do progresso do app atual (só leitura) — na 1ª abertura, ou quando pedido em Config
  var SKIP = /sync|reload-tab/i;
  window.v40CopyFromMainApp = function () {
    var copied = 0;
    window.__v40real.keys().forEach(function (key) {
      if (!key || key.indexOf(P) === 0) return;
      if (key.indexOf('ucm-') !== 0 || SKIP.test(key)) return;
      var v = window.__v40real.get(key);
      if (v === null) return;
      s.call(window.localStorage, P + key, v);
      copied++;
    });
    s.call(window.localStorage, P + 'v40-copied-at', new Date().toISOString());
    return copied;
  };
  try {
    var hasBeta = g.call(window.localStorage, P + 'ucm-watchlist-items-v1');
    var hasMain = g.call(window.localStorage, 'ucm-watchlist-items-v1');
    if (!hasBeta && hasMain) { window.v40CopyFromMainApp(); window.__v40JustCopied = true; }
  } catch (e) {}

  // ritmo (episódios por dia) configurável, com histórico: cada mudança vale A PARTIR de uma
  // data, pra não reescrever o passado. [{from:'YYYY-MM-DD', anim:3, live:2}]
  window.v40RateHistory = function () {
    try {
      var h = JSON.parse(localStorage.getItem('v40-rate-history') || 'null');
      if (Array.isArray(h) && h.length) return h;
    } catch (e) {}
    return [{ from: '0000-00-00', anim: 3, live: 2 }];
  };
  function isoOf(d) {
    if (typeof d === 'string') return d;
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  window.v40RateAt = function (d, kind) {
    var iso = isoOf(d);
    var h = window.v40RateHistory().slice().sort(function (a, b) { return a.from < b.from ? -1 : 1; });
    var cur = h[0];
    for (var i = 0; i < h.length; i++) if (h[i].from <= iso) cur = h[i];
    var o = window.__v40RateOverride;
    if (o && (!o.from || iso >= o.from)) return kind === 'live' ? o.live : o.anim;
    return kind === 'live' ? (cur.live || 2) : (cur.anim || 3);
  };
  // pausas extras (botão "hoje não vou assistir", modo viagem, recomeçar de hoje)
  window.v40IsExtraPause = function (d) {
    var iso = isoOf(d);
    var list = [];
    try { list = JSON.parse(localStorage.getItem('v40-extra-pauses') || '[]'); } catch (e) {}
    for (var i = 0; i < list.length; i++) if (iso >= list[i][0] && iso <= list[i][1]) return true;
    return false;
  };
})();
</script>
"""

BETA_BANNER = """<div class="v40-beta-ribbon" id="v40BetaRibbon">🧪 V40 BETA — testes à vontade: seu app de verdade não é afetado</div>
"""

SYNC_NOTICE = """<div style="margin-top:14px;padding:12px;border:1px dashed var(--gold);border-radius:10px;font-size:0.75rem;">
    <p style="margin:0 0 6px;font-family:'Bangers',cursive;letter-spacing:0.5px;">☁️ Sincronização desligada na beta</p>
    <p style="margin:0;color:var(--muted);">Para proteger seus dados de verdade, a beta nunca envia nem puxa nada da nuvem. Ela tem a gaveta dela, separada do app atual.</p>
  </div>
  <div style="display:none;">"""


def sub_once(text, old, new, label):
    if old not in text:
        print(f'ERRO: trecho não encontrado: {label}', file=sys.stderr)
        sys.exit(1)
    return text.replace(old, new, 1)


def main():
    s = SRC.read_text(encoding='utf-8')

    # --- <head> ---
    s = sub_once(s, '<title>Cronologia UCM — Watchlist</title>', '<title>UCM v40 beta</title>', 'title')
    s = sub_once(s, '<link rel="manifest" href="manifest.json">', '<link rel="manifest" href="manifest.json">', 'manifest')
    # sem service worker na beta (o do app principal continua cuidando do resto do site)
    s = re.sub(r"<script>\n// Registra o service worker.*?</script>\n", HEAD_SHIM, s, count=1, flags=re.S)
    if 'v40RateAt' not in s:
        print('ERRO: shim não inserido', file=sys.stderr); sys.exit(1)
    # Firebase não é carregado na beta -> sincronização impossível
    s = re.sub(r'<script src="https://www\.gstatic\.com/firebasejs/[^"]+"></script>\n', '', s)
    s = s.replace('href="icon-192.png"', 'href="../icon-192.png"')
    s = sub_once(s, '<meta name="apple-mobile-web-app-title" content="UCM Watchlist">',
                 '<meta name="apple-mobile-web-app-title" content="UCM v40 beta">', 'apple title')
    s = sub_once(s, '</head>', f'<link rel="stylesheet" href="v40.css?b={BUILD}">\n</head>', 'css link')

    # --- corpo ---
    s = sub_once(s, '<body>\n', '<body>\n' + BETA_BANNER, 'ribbon')
    s = sub_once(s, '<h1>ORDEM CRONOLÓGICA UCM</h1>', '<h1>ORDEM CRONOLÓGICA UCM <span class="v40-h1-tag">V40 BETA</span></h1>', 'h1')
    s = sub_once(s,
                 '  <div style="margin-top:14px;padding:12px;border:1px solid var(--line);border-radius:10px;">\n    <p style="margin:0 0 8px;font-family:\'Bangers\',cursive;letter-spacing:0.5px;">☁️ Sincronizar entre aparelhos</p>',
                 '  ' + SYNC_NOTICE + '\n    <p style="margin:0 0 8px;font-family:\'Bangers\',cursive;letter-spacing:0.5px;">☁️ Sincronizar entre aparelhos</p>',
                 'sync block')
    s = sub_once(s, '    <p id="syncStatus" style="font-size:0.7rem;color:var(--muted);text-align:center;margin-top:8px;"></p>\n  </div>\n',
                 '    <p id="syncStatus" style="font-size:0.7rem;color:var(--muted);text-align:center;margin-top:8px;"></p>\n  </div>\n  </div>\n',
                 'sync block end')

    # --- JS: sincronização morta (defesa extra) ---
    s = sub_once(s, 'function pushToCloudNow() {\n', 'function pushToCloudNow() {\n  return; // v40 beta: nunca envia nada pra nuvem\n', 'push')
    s = sub_once(s, 'function pullFromCloudNow() {\n', 'function pullFromCloudNow() {\n  return; // v40 beta: nunca puxa nada da nuvem\n', 'pull')
    s = sub_once(s, 'initCloudSync();\n\n</script>', '\n</script>', 'init sync')
    s = sub_once(s, 'setTimeout(maybeAutoBackup, 1500);\n', '', 'auto backup')

    # --- versão ---
    s = re.sub(r"const APP_VERSION = '[^']+';", "const APP_VERSION = 'v40 beta';", s, count=1)

    # --- ritmo configurável + pausas extras ---
    s = sub_once(s, "function trioRateFor(dateIso) { return 3; }",
                 "function trioRateFor(dateIso) { return window.v40RateAt ? v40RateAt(dateIso, 'anim') : 3; }", 'trio rate')
    s = sub_once(s, "  return PAUSE_WINDOWS.some(([start, end]) => iso >= start && iso <= end);\n",
                 "  if (window.v40IsExtraPause && v40IsExtraPause(iso)) return true;\n  return PAUSE_WINDOWS.some(([start, end]) => iso >= start && iso <= end);\n", 'pause')
    s = sub_once(s, "          rem -= isSlowDay(d) ? 1 : normalRate;\n",
                 "          rem -= isSlowDay(d) ? 1 : (window.v40RateAt ? v40RateAt(d, kind === 'anim' ? 'anim' : 'live') : normalRate);\n", 'rate')

    # --- anotações removidas ---
    s = re.sub(r"      const noteBtn = document\.createElement\('button'\);.*?mainCol\.appendChild\(starsEl\);\n\n      if \(it\.note\) \{.*?\n      \}\n",
               "      mainCol.appendChild(starsEl);\n", s, count=1, flags=re.S)
    if 'noteBtn' in s:
        print('ERRO: botão de anotação não removido', file=sys.stderr); sys.exit(1)

    # --- ganchos pro v40 ---
    s = sub_once(s, "      row.className = 'item' + (it.done ? ' done' : '') + (isToday(it) ? ' today' : '');\n",
                 "      row.className = 'item' + (it.done ? ' done' : '') + (isToday(it) ? ' today' : '');\n      row.dataset.id = it.id;\n", 'row id')
    s = sub_once(s, "      row.appendChild(stamp);\n\n      return row;\n",
                 "      row.appendChild(stamp);\n      if (window.v40DecorateRow) { try { v40DecorateRow(row, it, mainCol, actions); } catch (e) { console.error(e); } }\n\n      return row;\n", 'decorate')
    # busca também por herói e fase + filtros extras (modo foco, quero rever, coleções, filtro avançado)
    s = s.replace("if (term && !normalizeStr(it.text).includes(term)) return;",
                  "if (term && !(window.v40TermMatch ? v40TermMatch(it, term) : normalizeStr(it.text).includes(term))) return;\n    if (window.v40Filter && !v40Filter(it)) return;")
    s = s.replace("if (term && !normalizeStr(it.text).includes(term)) return false;",
                  "if (term && !(window.v40TermMatch ? v40TermMatch(it, term) : normalizeStr(it.text).includes(term))) return false;\n        if (window.v40Filter && !v40Filter(it)) return false;")
    s = sub_once(s, "  if (showNext7 || alphaMode || calendarFilter) {\n",
                 "  if (showNext7 || alphaMode || calendarFilter || (window.v40SortActive && v40SortActive())) {\n", 'flat mode')
    s = sub_once(s, "    if (list.length === 0) {\n      const noRes = document.createElement('div');\n      noRes.className = 'no-results';\n      noRes.textContent = calendarFilter",
                 "    if (window.v40SortList) list = v40SortList(list);\n    if (list.length === 0) {\n      const noRes = document.createElement('div');\n      noRes.className = 'no-results';\n      noRes.textContent = calendarFilter", 'sort hook')
    s = sub_once(s, "  renderPhaseTimeline();\n\n  const sel = document.getElementById('phaseSelect');",
                 "  renderPhaseTimeline();\n  if (window.v40AfterRender) { try { v40AfterRender(); } catch (e) { console.error(e); } }\n\n  const sel = document.getElementById('phaseSelect');", 'after render')

    # --- scripts da v40 ---
    tags = ''.join(f'<script src="{n}?b={BUILD}"></script>\n' for n in V40_SCRIPTS)
    s = sub_once(s, '<div class="marathon-screen" id="marathonScreen"></div>\n</body>',
                 '<div class="marathon-screen" id="marathonScreen"></div>\n' + tags + '</body>', 'scripts')

    OUT.write_text(s, encoding='utf-8')
    print(f'ok: {OUT.relative_to(ROOT)} (build {BUILD})')


if __name__ == '__main__':
    main()
