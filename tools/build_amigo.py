#!/usr/bin/env python3
"""Gera amigo/index.html: a lista pra um amigo usar, começando DO ZERO.

- mesma lista e mesmas funções do app principal (principal.html)
- sem nada do seu progresso: nenhum título visto, nenhuma nota, nenhuma data sua
- cronograma começa no dia em que a pessoa abre pela primeira vez
- sem as suas pausas/períodos lentos pessoais (prova, GTA, viagem…)
- armazenamento próprio (prefixo 'amigo:'), então nem no mesmo aparelho mistura com a sua lista
- correções antigas que só faziam sentido pros seus dados já vêm marcadas como aplicadas

Uso: python3 tools/build_amigo.py   (da raiz do repositório)
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'principal.html'
OUT = ROOT / 'amigo' / 'index.html'


def sub_once(text, old, new, label):
    if old not in text:
        print(f'ERRO: trecho não encontrado: {label}', file=sys.stderr)
        sys.exit(1)
    return text.replace(old, new, 1)


def main():
    s = SRC.read_text(encoding='utf-8')

    # flags de correções antigas (só pros seus dados) -> já vêm aplicadas
    flags = sorted(set(re.findall(r"getItem\('(ucm-[a-z0-9-]+)'\) === '1'", s)))

    shim = """<script>
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
      FLAGS.forEach(function (f) { localStorage.setItem(f, '1'); });
      localStorage.setItem('ucm-last-auto-backup', new Date().toISOString()); // sem backup baixando na 1ª abertura
      window.__amigoFirstRun = true;
    }
  } catch (e) {}
  window.AMIGO_START = (function () { try { return localStorage.getItem('amigo-start'); } catch (e) { return null; } })();
})();
</script>
""".replace('FLAGS', json.dumps(flags))

    s = sub_once(s, '<title>Cronologia UCM — Watchlist</title>', '<title>Cronologia UCM — Minha lista</title>', 'title')
    s = sub_once(s, '<link rel="manifest" href="manifest.json">', '<link rel="manifest" href="manifest.json">\n' + shim, 'manifest+shim')
    s = s.replace("navigator.serviceWorker.register('sw.js')", "navigator.serviceWorker.register('../sw.js')")
    s = s.replace('href="icon-192.png"', 'href="../icon-192.png"')
    s = sub_once(s, '<meta name="apple-mobile-web-app-title" content="UCM Watchlist">',
                 '<meta name="apple-mobile-web-app-title" content="Minha lista UCM">', 'apple title')

    # ---- lista padrão sem nenhum progresso ----
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

    # ---- sem as suas datas pessoais ----
    s = sub_once(s, "    forceAnchor: '2026-09-21', // já começou de verdade nessa data, fora do controle do cronograma",
                 "    forceAnchor: null,", 'anchor')
    s = re.sub(r"const PAUSE_WINDOWS = \[.*?\];", "const PAUSE_WINDOWS = [];", s, count=1, flags=re.S)
    s = re.sub(r"const SLOW_WINDOWS = \[.*?\];", "const SLOW_WINDOWS = [];", s, count=1, flags=re.S)
    # o recálculo "oficial" a partir da dupla em 21/09/2026 era só seu
    s = sub_once(s, "  if (usm && !usm.done && (removed || corrected || needRate || usm.watchStart !== '2026-09-21')) {\n    recomputeSchedule(usm.id, '2026-09-21');",
                 "  if (false) {\n    recomputeSchedule(usm.id, AMIGO_START);", 'enforce anchor')
    s = sub_once(s, '<span class="badge start">INÍCIO 04/08/2026</span>', '<span class="badge start" id="badgeStart">INÍCIO —</span>', 'badge')

    # ---- primeira abertura: cronograma do zero, a partir de hoje ----
    first_run = """
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
    s = sub_once(s, '\nload();\npopulateMoveSelects();', '\nload();\n' + first_run + 'populateMoveSelects();', 'first run')

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(s, encoding='utf-8')

    # manifest próprio (instalar na tela inicial abre a lista DELE, não a sua)
    man = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
    man['name'] = 'Cronologia UCM - Minha lista'
    man['short_name'] = 'Minha lista UCM'
    for ic in man.get('icons', []):
        ic['src'] = '../' + ic['src']
    for sc in man.get('shortcuts', []):
        for ic in sc.get('icons', []):
            ic['src'] = '../' + ic['src']
    (OUT.parent / 'manifest.json').write_text(json.dumps(man, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'ok: {OUT.relative_to(ROOT)} ({len(arr)} itens, {len(flags)} flags)')


if __name__ == '__main__':
    main()
