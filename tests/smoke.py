# Browser smoke test: python3 tests/smoke.py http://localhost:8123/  (needs playwright + chromium)
import sys, time, json
from playwright.sync_api import sync_playwright
url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8123/"
fails = []
def check(name, ok, info=''):
    print(('PASS ' if ok else 'FAIL ') + name, info)
    if not ok: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist","--enable-webgl"])
    pg = b.new_page(viewport={'width':960,'height':540})
    errors = []
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(url + ('    pg.goto(url)' if '?' in url else '?') + 'q=0')   # LOW quality: software GL is far too slow for HIGH/ULTRA
    t0 = time.time()
    while time.time() - t0 < 120 and not pg.evaluate("!!window.__mxReady"): time.sleep(0.3)
    check('game loads', pg.evaluate("!!window.__mxReady"), f'{time.time()-t0:.1f}s')
    check('start screen shown', not pg.evaluate("document.getElementById('start').classList.contains('hide')"))
    pg.click('#go'); time.sleep(0.5)
    check('ride button starts the game', pg.evaluate("window.__mx.running"))
    st = lambda: pg.evaluate("(()=>{const b=window.__mx.bike;return {x:b.pos[0],z:b.pos[2],v:Math.hypot(...b.v)*3.6,state:b.state}})()")
    z0 = st()['z']
    pg.keyboard.down('w'); t1 = time.time(); s1 = st()
    while time.time() - t1 < 25 and not (s1['v'] > 8 and abs(s1['z'] - z0) > 1.5): time.sleep(0.5); s1 = st()   # software GL runs the sim slower than real time
    pg.keyboard.up('w')
    check('throttle moves the bike', s1['v'] > 8 and abs(s1['z'] - z0) > 1.5, f"{s1['v']:.0f} km/h")
    pg.keyboard.down('s'); time.sleep(3); pg.keyboard.up('s')
    check('brakes slow the bike', st()['v'] < s1['v'], f"{st()['v']:.0f} km/h")
    names = []
    for _ in range(4):
        pg.keyboard.press('c'); time.sleep(0.3); names.append(pg.evaluate("window.__mx.camera.name"))
    check('camera cycles through 4 modes', len(set(names)) == 4, ','.join(names))
    pg.keyboard.press('m'); time.sleep(0.5)
    check('map opens', pg.evaluate("window.__mx.hud.mapOpen"))
    pg.keyboard.press('3'); time.sleep(0.8)
    check('fast travel (key 3) teleports to the jump zone', pg.evaluate("window.__mx.T.zoneAt(window.__mx.bike.pos[0],window.__mx.bike.pos[2])?.id") == 'jump' and not pg.evaluate("window.__mx.hud.mapOpen"))
    pg.keyboard.press('Escape'); time.sleep(0.4)
    check('pause menu opens', not pg.evaluate("document.getElementById('pause').classList.contains('hide')"))
    pg.keyboard.press('Escape'); time.sleep(0.4)
    check('pause menu closes', pg.evaluate("document.getElementById('pause').classList.contains('hide')"))
    pg.keyboard.press('r'); time.sleep(0.5)
    check('respawn works', st()['state'] == 'ok')
    # crash into the lake via fast travel + ride
    pg.evaluate("(()=>{const m=window.__mx,T=m.T; const [x,z]=T.toWorld(640,1060); m.bike.teleport(x,z,Math.PI/2);})()")
    pg.keyboard.down('w'); time.sleep(6); pg.keyboard.up('w')
    check('no console errors', not errors, '; '.join(errors[:3]))
    pg.screenshot(path='/tmp/smoke.png')
    b.close()
print('\nFAILED: ' + ', '.join(fails) if fails else '\nall passed')
sys.exit(1 if fails else 0)
