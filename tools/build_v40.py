#!/usr/bin/env python3
"""Gera as 3 páginas da v40 a partir da MESMA fonte (tools/base.html):

  principal.html     -> app oficial (v40). Usa o armazenamento normal, a sincronização normal.
  beta/index.html    -> beta: gaveta própria ('v40b:'), sem nuvem do app, faixa amarela.
  amigo/index.html   -> lista do amigo: começa do zero, gaveta própria ('amigo:').

Os scripts e o CSS da v40 ficam em /v40/ e são os mesmos pras 3; cada página diz o modo dela
em window.V40_MODE ('oficial' | 'beta' | 'amigo').

Uso: python3 tools/build_v40.py      (da raiz do repositório)
Para mudar o app: edite tools/base.html e/ou os arquivos em v40/, e rode este script.
"""
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'tools' / 'base.html'
BUILD = time.strftime('%Y%m%d%H%M')
VERSION = 'v40'

V40_SCRIPTS = ['v40-catalog.js', 'v40-core.js', 'v40-liga.js', 'v40-stats.js', 'v40-fun.js', 'v40-data.js',
               'v40-content.js', 'v40-sync.js', 'v40-pedidos.js', 'v40-system.js']


def sub_once(text, old, new, label):
    if old not in text:
        print(f'ERRO: trecho não encontrado: {label}', file=sys.stderr)
        sys.exit(1)
    return text.replace(old, new, 1)


# ---------------------------------------------------------------- shims (no <head>)
MODE_SHIM = r"""<script>
// ===== v40: modo da página + ritmo configurável + pausas extras =====
window.V40_MODE = '__MODE__';
(function () {
  // ritmo (episódios por dia) com histórico: cada mudança vale A PARTIR de uma data
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

BETA_SHIM = r"""<script>
// ===== v40 beta: armazenamento próprio (prefixo 'v40b:') =====
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
  var SKIP = /sync|reload-tab/i;
  window.v40CopyFromMainApp = function () {
    var copied = 0;
    window.__v40real.keys().forEach(function (key) {
      if (!key || key.indexOf(P) === 0 || key.indexOf('amigo:') === 0) return;
      if ((key.indexOf('ucm-') !== 0 && key.indexOf('v40-') !== 0) || SKIP.test(key)) return;
      var v = window.__v40real.get(key);
      if (v === null) return;
      s.call(window.localStorage, P + key, v);
      copied++;
    });
    s.call(window.localStorage, P + 'v40-copied-at', JSON.stringify(new Date().toISOString()));
    return copied;
  };
  try {
    var hasBeta = g.call(window.localStorage, P + 'ucm-watchlist-items-v1');
    var hasMain = g.call(window.localStorage, 'ucm-watchlist-items-v1');
    if (!hasBeta && hasMain) { window.v40CopyFromMainApp(); window.__v40JustCopied = true; }
  } catch (e) {}
})();
</script>
"""

AMIGO_SHIM = r"""<script>
// ===== Lista do amigo: armazenamento próprio + começo do zero =====
(function () {
  var P = 'amigo:';
  var S = Storage.prototype;
  var g = S.getItem, st = S.setItem, r = S.removeItem;
  S.getItem = function (k) { return g.call(this, P + k); };
  S.setItem = function (k, v) { return st.call(this, P + k, v); };
  S.removeItem = function (k) { return r.call(this, P + k); };
  try {
    if (!localStorage.getItem('amigo-start')) {
      var d = new Date();
      var iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      localStorage.setItem('amigo-start', iso);
      __FLAGS__.forEach(function (f) { localStorage.setItem(f, '1'); });
      localStorage.setItem('ucm-last-auto-backup', new Date().toISOString());
      window.__amigoFirstRun = true;
    }
  } catch (e) {}
  window.AMIGO_START = (function () { try { return localStorage.getItem('amigo-start'); } catch (e) { return null; } })();
})();
</script>
"""

BETA_BANNER = """<div class="v40-beta-ribbon" id="v40BetaRibbon">🧪 BETA — área de testes: o seu app de verdade não é afetado</div>
"""

SYNC_NOTICE = """<div style="margin-top:14px;padding:12px;border:1px dashed var(--gold);border-radius:10px;font-size:0.75rem;">
    <p style="margin:0 0 6px;font-family:'Bangers',cursive;letter-spacing:0.5px;">☁️ Sincronização desligada na beta</p>
    <p style="margin:0;color:var(--muted);">Para proteger seus dados de verdade, a beta nunca envia nem puxa nada da nuvem do app.</p>
  </div>
  <div style="display:none;">"""

AMIGO_FIRST_RUN = """
// lista do amigo: na 1ª abertura monta o cronograma inteiro a partir de hoje
(function () {
  try {
    var b = document.getElementById('badgeStart');
    if (b && AMIGO_START) { var p = AMIGO_START.split('-'); b.textContent = 'INÍCIO ' + p[2] + '/' + p[1] + '/' + p[0]; }
    if (!localStorage.getItem('amigo-scheduled')) {
      var first = sortItems(items.filter(function (i) { return !i.done; }))[0];
      if (first) recomputeSchedule(first.id, todayIso());
      localStorage.setItem('amigo-scheduled', '1');
      save();
      render();
      scrollToTodayItem(false);
    }
  } catch (e) { console.error(e); }
})();
"""


def common(s, mode, asset_prefix):
    # shim de modo/ritmo logo no começo do <head>
    s = sub_once(s, '<head>\n<meta charset="UTF-8">\n', '<head>\n<meta charset="UTF-8">\n' + MODE_SHIM.replace('__MODE__', mode), 'mode shim')
    s = sub_once(s, '</head>', f'<link rel="stylesheet" href="{asset_prefix}v40.css?b={BUILD}">\n</head>', 'css link')
    # ritmo + pausas
    s = sub_once(s, "function trioRateFor(dateIso) { return 3; }",
                 "function trioRateFor(dateIso) { return window.v40RateAt ? v40RateAt(dateIso, 'anim') : 3; }", 'trio rate')
    s = sub_once(s, "  return PAUSE_WINDOWS.some(([start, end]) => iso >= start && iso <= end);\n",
                 "  if (window.v40IsExtraPause && v40IsExtraPause(iso)) return true;\n  return PAUSE_WINDOWS.some(([start, end]) => iso >= start && iso <= end);\n", 'pause')
    s = sub_once(s, "          rem -= isSlowDay(d) ? 1 : normalRate;\n",
                 "          rem -= isSlowDay(d) ? 1 : (window.v40RateAt ? v40RateAt(d, kind === 'anim' ? 'anim' : 'live') : normalRate);\n", 'rate')
    # anotações removidas
    s = re.sub(r"      const noteBtn = document\.createElement\('button'\);.*?mainCol\.appendChild\(starsEl\);\n\n      if \(it\.note\) \{.*?\n      \}\n",
               "      mainCol.appendChild(starsEl);\n", s, count=1, flags=re.S)
    if 'noteBtn' in s:
        print('ERRO: botão de anotação não removido', file=sys.stderr); sys.exit(1)
    # ganchos
    s = sub_once(s, "      row.className = 'item' + (it.done ? ' done' : '') + (isToday(it) ? ' today' : '');\n",
                 "      row.className = 'item' + (it.done ? ' done' : '') + (isToday(it) ? ' today' : '');\n      row.dataset.id = it.id;\n", 'row id')
    s = sub_once(s, "      row.appendChild(stamp);\n\n      return row;\n",
                 "      row.appendChild(stamp);\n      if (window.v40DecorateRow) { try { v40DecorateRow(row, it, mainCol, actions); } catch (e) { console.error(e); } }\n\n      return row;\n", 'decorate')
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
    # envio automático pra nuvem não apaga os dados extras da v40 no documento
    s = sub_once(s, "    updatedAt: firebase.firestore.FieldValue.serverTimestamp()\n  }).then(() => {\n    setSyncStatus('✅ Sincronizado agora');",
                 "    updatedAt: firebase.firestore.FieldValue.serverTimestamp()\n  }, { merge: true }).then(() => {\n    setSyncStatus('✅ Sincronizado agora');", 'merge push')
    # scripts
    tags = ''.join(f'<script src="{asset_prefix}{n}?b={BUILD}"></script>\n' for n in V40_SCRIPTS)
    s = sub_once(s, '<div class="marathon-screen" id="marathonScreen"></div>\n</body>',
                 '<div class="marathon-screen" id="marathonScreen"></div>\n' + tags + '</body>', 'scripts')
    return s


OFICIAL_MIGRATE = r"""<script>
// ===== v40 oficial: traz (1 vez) o que você fez na beta neste aparelho =====
// coleções, liga/mata-mata, chave do TMDB, configurações, registro, metas… (a LISTA em si é
// decidida depois, numa tela onde você escolhe juntar / app / beta)
(function () {
  try {
    if (localStorage.getItem('v40-keys-migrated')) return;
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    var skip = /^v40-(snap|sync-code|sync-state|copied-at|last-build|keys-migrated|beta-items-decided|cloud-backup-week|tour-done)/;
    keys.forEach(function (k) {
      if (!k || k.indexOf('v40b:v40-') !== 0) return;
      var t = k.slice(5);
      if (skip.test(t)) return;
      if (localStorage.getItem(t) === null) localStorage.setItem(t, localStorage.getItem(k));
    });
    try {
      var a = JSON.parse(localStorage.getItem('ucm-streak-days') || '[]');
      var b = JSON.parse(localStorage.getItem('v40b:ucm-streak-days') || '[]');
      if (b.length) localStorage.setItem('ucm-streak-days', JSON.stringify(Array.from(new Set(a.concat(b))).sort()));
    } catch (e) {}
    if (localStorage.getItem('ucm-palette') === null && localStorage.getItem('v40b:ucm-palette')) localStorage.setItem('ucm-palette', localStorage.getItem('v40b:ucm-palette'));
    localStorage.setItem('v40-keys-migrated', '1');
  } catch (e) {}
})();
</script>
"""


def build_oficial(base):
    s = common(base, 'oficial', 'v40/')
    s = sub_once(s, "window.V40_MODE = 'oficial';\n", "window.V40_MODE = 'oficial';\n", 'mode check')
    s = sub_once(s, '</script>\n', '</script>\n' + OFICIAL_MIGRATE, 'migrate shim')
    s = re.sub(r"const APP_VERSION = '[^']+';", f"const APP_VERSION = '{VERSION}';", s, count=1)
    return s


def build_beta(base):
    s = common(base, 'beta', '../v40/')
    s = sub_once(s, '<title>Cronologia UCM — Watchlist</title>', '<title>UCM beta</title>', 'title')
    s = re.sub(r"<script>\n// Registra o service worker.*?</script>\n", BETA_SHIM, s, count=1, flags=re.S)
    if '__v40real' not in s:
        print('ERRO: shim da beta', file=sys.stderr); sys.exit(1)
    s = re.sub(r'<script src="https://www\.gstatic\.com/firebasejs/[^"]+"></script>\n', '', s)
    s = s.replace('href="icon-192.png"', 'href="../icon-192.png"')
    s = sub_once(s, '<meta name="apple-mobile-web-app-title" content="UCM Watchlist">',
                 '<meta name="apple-mobile-web-app-title" content="UCM beta">', 'apple title')
    s = sub_once(s, '<body>\n', '<body>\n' + BETA_BANNER, 'ribbon')
    s = sub_once(s, '<h1>ORDEM CRONOLÓGICA UCM</h1>', '<h1>ORDEM CRONOLÓGICA UCM <span class="v40-h1-tag">BETA</span></h1>', 'h1')
    s = sub_once(s,
                 '  <div style="margin-top:14px;padding:12px;border:1px solid var(--line);border-radius:10px;">\n    <p style="margin:0 0 8px;font-family:\'Bangers\',cursive;letter-spacing:0.5px;">☁️ Sincronizar entre aparelhos</p>',
                 '  ' + SYNC_NOTICE + '\n    <p style="margin:0 0 8px;font-family:\'Bangers\',cursive;letter-spacing:0.5px;">☁️ Sincronizar entre aparelhos</p>',
                 'sync block')
    s = sub_once(s, '    <p id="syncStatus" style="font-size:0.7rem;color:var(--muted);text-align:center;margin-top:8px;"></p>\n  </div>\n',
                 '    <p id="syncStatus" style="font-size:0.7rem;color:var(--muted);text-align:center;margin-top:8px;"></p>\n  </div>\n  </div>\n',
                 'sync block end')
    s = sub_once(s, 'function pushToCloudNow() {\n', 'function pushToCloudNow() {\n  return; // beta: nunca envia nada pra nuvem do app\n', 'push')
    s = sub_once(s, 'function pullFromCloudNow() {\n', 'function pullFromCloudNow() {\n  return; // beta: nunca puxa nada da nuvem do app\n', 'pull')
    s = sub_once(s, 'initCloudSync();\n\n</script>', '\n</script>', 'init sync')
    s = sub_once(s, 'setTimeout(maybeAutoBackup, 1500);\n', '', 'auto backup')
    s = re.sub(r"const APP_VERSION = '[^']+';", f"const APP_VERSION = '{VERSION} beta';", s, count=1)
    return s


def build_amigo(base):
    flags = sorted(set(re.findall(r"getItem\('(ucm-[a-z0-9-]+)'\) === '1'", base)))
    s = common(base, 'amigo', '../v40/')
    s = sub_once(s, '<title>Cronologia UCM — Watchlist</title>', '<title>Cronologia UCM — Minha lista</title>', 'title')
    s = sub_once(s, '<link rel="manifest" href="manifest.json">', '<link rel="manifest" href="manifest.json">\n' + AMIGO_SHIM.replace('__FLAGS__', json.dumps(flags)), 'amigo shim')
    s = s.replace("navigator.serviceWorker.register('sw.js')", "navigator.serviceWorker.register('../sw.js')")
    s = s.replace('href="icon-192.png"', 'href="../icon-192.png"')
    s = sub_once(s, '<meta name="apple-mobile-web-app-title" content="UCM Watchlist">',
                 '<meta name="apple-mobile-web-app-title" content="Minha lista UCM">', 'apple title')
    m = re.search(r'^const DEFAULT_ITEMS = (\[.*\]);$', s, flags=re.M)
    if not m:
        print('ERRO: DEFAULT_ITEMS', file=sys.stderr); sys.exit(1)
    arr = json.loads(m.group(1))
    star = '⭐️'
    for it in arr:
        it['done'] = False
        it['text'] = re.sub(r'\s*(' + re.escape(star) + r')+\s*$', '', it['text']).rstrip()
        for k in ('watchStart', 'watchEnd', 'watchKind', 'epDates', 'rating', 'ratingAuto', 'epDone', 'epRatings', 'completedAt', 'favorite', 'note'):
            it.pop(k, None)
    s = s[:m.start(1)] + json.dumps(arr, ensure_ascii=False) + s[m.end(1):]
    s = sub_once(s, "    forceAnchor: '2026-09-21', // já começou de verdade nessa data, fora do controle do cronograma",
                 "    forceAnchor: null,", 'anchor')
    s = re.sub(r"const PAUSE_WINDOWS = \[.*?\];", "const PAUSE_WINDOWS = [];", s, count=1, flags=re.S)
    s = re.sub(r"const SLOW_WINDOWS = \[.*?\];", "const SLOW_WINDOWS = [];", s, count=1, flags=re.S)
    s = sub_once(s, "  if (usm && !usm.done && (removed || corrected || needRate || usm.watchStart !== '2026-09-21')) {\n    recomputeSchedule(usm.id, '2026-09-21');",
                 "  if (false) {\n    recomputeSchedule(usm.id, AMIGO_START);", 'enforce anchor')
    s = sub_once(s, '<span class="badge start">INÍCIO 04/08/2026</span>', '<span class="badge start" id="badgeStart">INÍCIO —</span>', 'badge')
    s = sub_once(s, '\nload();\npopulateMoveSelects();', '\nload();\n' + AMIGO_FIRST_RUN + 'populateMoveSelects();', 'first run')
    s = re.sub(r"const APP_VERSION = '[^']+';", f"const APP_VERSION = '{VERSION}';", s, count=1)
    man = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
    man['name'] = 'Cronologia UCM - Minha lista'
    man['short_name'] = 'Minha lista UCM'
    for ic in man.get('icons', []):
        ic['src'] = '../' + ic['src']
    for sc in man.get('shortcuts', []):
        for ic in sc.get('icons', []):
            ic['src'] = '../' + ic['src']
    (ROOT / 'amigo' / 'manifest.json').write_text(json.dumps(man, ensure_ascii=False, indent=2), encoding='utf-8')
    return s, len(flags)


def main():
    base = SRC.read_text(encoding='utf-8')
    (ROOT / 'principal.html').write_text(build_oficial(base), encoding='utf-8')
    (ROOT / 'beta' / 'index.html').write_text(build_beta(base), encoding='utf-8')
    amigo, nflags = build_amigo(base)
    (ROOT / 'amigo' / 'index.html').write_text(amigo, encoding='utf-8')
    print(f'ok: principal.html, beta/index.html, amigo/index.html ({nflags} flags) — build {BUILD}')


if __name__ == '__main__':
    main()
