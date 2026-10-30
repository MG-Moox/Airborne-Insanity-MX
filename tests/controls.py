# Controls test: rebinding on desktop + touch overlay on an emulated phone.  python3 tests/controls.py http://localhost:8123/
import sys, time
from playwright.sync_api import sync_playwright
url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8123/"
fails = []
def check(n, ok, info=''):
    print(('PASS ' if ok else 'FAIL ') + n, info)
    if not ok: fails.append(n)
ARGS = ["--use-gl=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist","--enable-webgl"]
def wait_ready(pg):
    t0 = time.time()
    while time.time() - t0 < 120 and not pg.evaluate("!!window.__mxReady"): time.sleep(0.3)
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    # ---- desktop: rebinding
    pg = b.new_page(viewport={'width': 1100, 'height': 620}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(url + '?q=0'); wait_ready(pg)
    pg.click('#ctlbtn'); time.sleep(0.3)
    check('controls panel opens', pg.evaluate("!document.getElementById('ctl').classList.contains('hide')"))
    pg.locator('.kbtn').nth(0).click(); time.sleep(0.2)        # throttle slot 1
    pg.keyboard.press('KeyT'); time.sleep(0.2)
    check('rebind throttle to T', pg.evaluate("window.__mx.input.binds.throttle[0]") == 'KeyT')
    pg.locator('.kbtn').nth(2).click(); time.sleep(0.1)        # brake slot 1
    pg.keyboard.press('KeyT'); time.sleep(0.2)
    check('duplicate key moves instead of doubling', pg.evaluate("window.__mx.input.binds.throttle[0]") == '' and pg.evaluate("window.__mx.input.binds.brake[0]") == 'KeyT')
    pg.click('#ctl-reset'); time.sleep(0.2)
    check('reset restores defaults', pg.evaluate("window.__mx.input.binds.throttle[0]") == 'KeyW')
    pg.locator('.tabs button').nth(1).click(); time.sleep(0.2)
    pg.locator('.srow input[type=range]').nth(0).evaluate("e => { e.value = 1.3; e.dispatchEvent(new Event('input')); }")
    check('sensitivity slider saves', abs(pg.evaluate("window.__mx.input.settings.steerSens") - 1.3) < 0.01)
    pg.screenshot(path='/tmp/ctl_panel.png')
    pg.click('#ctl-close'); time.sleep(0.2)
    pg.click('#go'); time.sleep(0.5)
    pg.keyboard.down('t'); time.sleep(0.3); pg.keyboard.up('t')       # T no longer bound -> nothing
    check('no page errors (desktop)', not errs, '; '.join(errs[:2]))
    pg.close()
    # ---- phone: touch controls
    ctx = b.new_context(viewport={'width': 844, 'height': 390}, is_mobile=True, has_touch=True, device_scale_factor=1)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(url + '?q=0'); wait_ready(pg)
    pg.tap('#go'); time.sleep(1.0)
    check('touch overlay visible on phone', pg.evaluate("document.getElementById('touch').classList.contains('show')"))
    z0 = pg.evaluate("window.__mx.bike.pos[2]")
    box = pg.locator('.tc.gas').bounding_box()
    cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
    cdp = ctx.new_cdp_session(pg)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': cx, 'y': cy, 'id': 1}]})
    t1 = time.time(); v = 0
    while time.time() - t1 < 25 and v < 8:
        time.sleep(0.5); v = pg.evaluate("Math.hypot(...window.__mx.bike.v)*3.6")
    check('GAS button moves the bike', v > 8, f'{v:.0f} km/h')
    # stick: drag right -> steer axis positive
    sb = pg.locator('.tc.stick').bounding_box(); sx, sy = sb['x'] + sb['width'] / 2, sb['y'] + sb['height'] / 2
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': cx, 'y': cy, 'id': 1}, {'x': sx, 'y': sy, 'id': 2}]})
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': cx, 'y': cy, 'id': 1}, {'x': sx + sb['width'] * 0.45, 'y': sy, 'id': 2}]})
    time.sleep(0.6)
    check('stick steers right', pg.evaluate("window.__mx.input.touch.sx") > 0.5, str(pg.evaluate("window.__mx.input.touch.sx")))
    pg.screenshot(path='/tmp/touch_play.png')
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    time.sleep(0.3)
    check('release clears inputs', not pg.evaluate("window.__mx.input.touch.gas") and pg.evaluate("window.__mx.input.touch.sx") == 0)
    check('no page errors (phone)', not errs, '; '.join(errs[:2]))
    ctx.close(); b.close()
print('\nFAILED: ' + ', '.join(fails) if fails else '\nall passed')
sys.exit(1 if fails else 0)
