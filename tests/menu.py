# Menu / garage / map-teleport UI test.  python3 tests/menu.py http://localhost:8123/
import sys, time
from playwright.sync_api import sync_playwright
url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8123/"
fails = []
def check(n, ok, info=''):
    print(('PASS ' if ok else 'FAIL ') + n, info)
    if not ok: fails.append(n)
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist","--enable-webgl"])
    pg = b.new_page(viewport={'width': 1200, 'height': 680}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(url + '?q=0'); t0 = time.time()
    while time.time() - t0 < 120 and not pg.evaluate("!!window.__mxReady"): time.sleep(0.3)
    time.sleep(2.5)
    check('main menu visible', pg.evaluate("!document.getElementById('start').classList.contains('hide')"))
    pg.screenshot(path='/tmp/m_menu.png')
    # garage
    pg.click('#garagebtn'); time.sleep(1.5)
    check('garage opens, menu hides', pg.evaluate("!document.getElementById('garage').classList.contains('hide') && document.getElementById('start').classList.contains('hide')"))
    p0 = pg.evaluate("({M: window.__mx.P.M, v: window.__mx.P.VTOP})")
    pg.locator('.cbtn').nth(3).click(); time.sleep(1.0)          # 450 4-stroke
    p1 = pg.evaluate("({M: window.__mx.P.M, v: window.__mx.P.VTOP})")
    check('picking 450 4T changes physics', p1['M'] > p0['M'] and p1['v'] > p0['v'], f"{p0} -> {p1}")
    pg.locator('.swatches').nth(0).locator('.sw').nth(3).click(); time.sleep(0.8)   # blue bike
    check('colour saved', pg.evaluate("JSON.parse(localStorage.getItem('aimx-garage')).colour") == 3)
    pg.screenshot(path='/tmp/m_garage.png')
    pg.click('#garage .go'); time.sleep(0.6)
    check('garage closes back to menu', pg.evaluate("document.getElementById('garage').classList.contains('hide') && !document.getElementById('start').classList.contains('hide')"))
    # start spot picker
    pg.click('#spotbtn'); time.sleep(1.0)
    check('map opens from menu', pg.evaluate("window.__mx.hud.mapOpen"))
    n = pg.locator('.srow2').count()
    pg.locator('.stabs button', has_text='JUMPS').click(); time.sleep(0.3)
    n2 = pg.locator('.srow2').count()
    check('teleport categories list different spots', n == 8 and n2 > 8, f'zones={n} jumps={n2}')
    pg.screenshot(path='/tmp/m_map.png')
    z0 = pg.evaluate("[window.__mx.bike.pos[0], window.__mx.bike.pos[2]]")
    pg.locator('.srow2').nth(2).click(); time.sleep(0.6)
    z1 = pg.evaluate("[window.__mx.bike.pos[0], window.__mx.bike.pos[2]]")
    check('clicking a spot teleports the bike', abs(z0[0]-z1[0]) + abs(z0[1]-z1[1]) > 50 and not pg.evaluate("window.__mx.hud.mapOpen"))
    check('start spot label updates', 'KICKER' in pg.evaluate("document.getElementById('spotname').textContent"))
    pg.click('#go'); time.sleep(1.0)
    check('free ride starts', pg.evaluate("window.__mx.running"))
    pg.keyboard.press('Escape'); time.sleep(0.4)
    check('pause shows garage + map buttons', pg.evaluate("!!document.getElementById('garagebtn2') && !!document.getElementById('mapbtn2')"))
    pg.click('#garagebtn2'); time.sleep(0.8)
    check('garage opens from pause', pg.evaluate("!document.getElementById('garage').classList.contains('hide')"))
    pg.click('#garage .go'); time.sleep(0.5)
    check('back to pause', pg.evaluate("!document.getElementById('pause').classList.contains('hide')"))
    check('no page errors', not errs, '; '.join(errs[:3]))
    b.close()
print('\nFAILED: ' + ', '.join(fails) if fails else '\nall passed')
sys.exit(1 if fails else 0)
