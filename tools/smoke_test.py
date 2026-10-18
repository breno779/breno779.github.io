#!/usr/bin/env python3
"""Teste automático do app (v40.6): abre as 3 listas num navegador de verdade, passa por todas
as abas, marca/desmarca um título, joga partidas da Liga e confere que não deu nenhum erro.

Uso (da raiz do repositório):  python3 tools/smoke_test.py
Roda sozinho no GitHub a cada atualização (.github/workflows/teste.yml).
"""
import http.server
import socketserver
import sys
import threading
from functools import partial
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PAGES = ['principal.html', 'doomsday.html', 'doomsday-essenciais.html', 'amigo/index.html', 'beta/index.html']
TABS = ['tabInicio', 'tabLista', 'tabEstatisticas', 'tabConquistas', 'tabLiga', 'tabPedidos', 'tabConfig']
LIGA = ['titulos', 'jogos', 'mata', 'numeros', 'herois', 'fases', 'duelo', 'historico']


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    handler = partial(QuietHandler, directory=str(ROOT))
    httpd = socketserver.TCPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main():
    httpd = serve()
    port = httpd.server_address[1]
    failures = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        for page in PAGES:
            ctx = b.new_context(viewport={'width': 400, 'height': 860})
            ctx.route('**/*', lambda r: r.continue_() if r.request.url.startswith(f'http://127.0.0.1:{port}') else r.abort())
            pg = ctx.new_page()
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('dialog', lambda d: d.accept())
            pg.add_init_script("localStorage.setItem('v40-tour-done','1');localStorage.setItem('v40-fresh-handled','1')")
            pg.goto(f'http://127.0.0.1:{port}/{page}')
            pg.wait_for_timeout(1500)
            close = "try{closeModal()}catch(e){}"
            pg.evaluate(close)
            n0 = pg.evaluate("items.length")
            for t in TABS:
                pg.evaluate(f"switchTab('{t}')"); pg.wait_for_timeout(120)
            for t in LIGA:
                pg.evaluate(f"V40.ligaTab='{t}';switchTab('tabLiga')"); pg.wait_for_timeout(100)
            # marca e desmarca o primeiro pendente
            pg.evaluate(close)
            pg.evaluate("switchTab('tabLista')"); pg.wait_for_timeout(150)
            pid = pg.evaluate("(items.find(i=>!i.done)||{}).id")
            if pid is not None:
                pg.evaluate(f"toggleDone({pid}, document.querySelector('.item[data-id=\"{pid}\"] .check'))"); pg.wait_for_timeout(200)
                if not pg.evaluate(f"items.find(i=>i.id=={pid}).done"): failures.append(f'{page}: não marcou o item {pid}')
                pg.evaluate(f"toggleDone({pid}, document.querySelector('.item[data-id=\"{pid}\"] .check'))"); pg.wait_for_timeout(200)
                if pg.evaluate(f"items.find(i=>i.id=={pid}).done"): failures.append(f'{page}: não desmarcou o item {pid}')
            # liga: 3 jogos
            pg.evaluate(close)
            pg.evaluate("V40.ligaTab='jogos';switchTab('tabLiga')"); pg.wait_for_timeout(150)
            for k in range(3):
                btn = pg.locator('[data-l4="a"]')
                if not btn.count(): break
                pg.evaluate(close); btn.first.click(); pg.wait_for_timeout(80)
            # modais principais
            for fn in ['V40.openTimeline()', 'V40.openWeekendMarathon()', 'V40.openMonthRecap()', 'V40.openShortcuts()', 'V40.openNews()', 'V40.openCinema()']:
                pg.evaluate(f"try{{{fn}}}catch(e){{window.__err=String(e)}}"); pg.wait_for_timeout(120)
                pg.evaluate("try{closeModal()}catch(e){}; const c=document.getElementById('v40Cinema'); if(c){c.remove();document.body.classList.remove('v40-cinema-on')}")
            if pg.evaluate("window.__err||null"): failures.append(f'{page}: {pg.evaluate("window.__err")}')
            if pg.evaluate("items.length") != n0: failures.append(f'{page}: número de itens mudou ({n0} → {pg.evaluate("items.length")})')
            if errs: failures.append(f'{page}: erros: ' + ' | '.join(errs[:3]))
            print(('OK   ' if not [f for f in failures if f.startswith(page)] else 'FALHA') + ' ' + page)
            ctx.close()
        b.close()
    httpd.shutdown()
    if failures:
        print('\n'.join(failures))
        sys.exit(1)
    print('Tudo certo ✅')


if __name__ == '__main__':
    main()
