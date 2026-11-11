# Картинки для игры /play/: превью ссылки (media/play-og.png) и 9 карточек очереди Threads (media/queue/2026-11-11..19.png).
#   python3 tools/gen-play-cards.py            (нужен python-playwright и Chrome; шрифт Inter)
# Все «спойлеры» на картинках выдуманы и закрашены. Чужих логотипов и кадров нет.
import asyncio, json, os, html
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'qwemort.github.io/pure-guides/play/'
CSS = '''*{box-sizing:border-box}body{margin:0;background:#F4F5F3;color:#2A2D32;font-family:system-ui,"DejaVu Sans",sans-serif}
.w{width:1080px;height:1350px;padding:70px 64px;display:flex;flex-direction:column;position:relative;overflow:hidden}
.w:before{content:"";position:absolute;left:-200px;top:-260px;width:700px;height:700px;border-radius:50%;background:none}
.w:after{content:"";position:absolute;right:-240px;bottom:-280px;width:760px;height:760px;border-radius:50%;background:none}
.k{font-size:30px;color:#666B66;font-weight:600;position:relative;z-index:1}.k b{color:#3A3E45}
.cap{font-size:112px;line-height:1.02;font-weight:800;letter-spacing:-.03em;margin:26px 0 8px;position:relative;z-index:1}.cap b{color:#3A3E45}.cap i{font-style:normal;color:#3A3E45}
.sub{font-size:40px;color:#666B66;position:relative;z-index:1;line-height:1.25}
.feed{margin-top:auto;display:flex;flex-direction:column;gap:18px;position:relative;z-index:1}
.c{display:flex;gap:22px;align-items:center;background:#FFFFFF;border:2px solid #E2E4E0;border-radius:26px;padding:18px;position:relative;height:150px}
.th{width:190px;height:112px;border-radius:16px;flex:none}.t{font-size:34px;font-weight:650;line-height:1.2}.m{font-size:24px;color:#666B66;margin-top:6px}
.c.b .th,.c.b .x{filter:blur(16px);opacity:.5}.c.b:after{content:attr(data-h);position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800;color:#3A3E45;letter-spacing:.05em}
.c.r{border-color:#B38F00}
.u{font-size:30px;color:#666B66;margin-top:30px;position:relative;z-index:1}
.sq{display:flex;flex-wrap:wrap;gap:14px;width:760px;margin-top:auto;position:relative;z-index:1}.sq span{width:80px;height:80px;border-radius:14px}
.og .w{width:1200px;height:630px;padding:54px 60px}.og .cap{font-size:104px;margin-top:14px}.og .feed{flex-direction:row}.og .c{flex:1;height:130px}.og .th{width:120px;height:90px}.og .t{font-size:26px}'''
G = ['#C9CCC6,#B8BCB5', '#D5D7D2,#C2C6BF', '#CDD0C9,#B5B9B2', '#C6CAC3,#AEB3AB', '#D0D3CC,#BCC0B9', '#C9CCC6,#B0B4AD']
def card(i, title, blur=False, red=False, hid='СПОЙЛЕР СХОВАНО'):
    return f'<div class="c{" b" if blur else ""}{" r" if red else ""}" data-h="{hid}"><div class="th" style="background:linear-gradient(135deg,{G[i % len(G)]})"></div><div class="x"><div class="t">{html.escape(title)}</div><div class="m">якийсь канал · {7 + i * 9} хв тому</div></div></div>'
SP = ['ПОЯСНЕННЯ КІНЦІВКИ: ████ був ████', 'хто ████ у фінальній місії', 'чому ████ зраджує ████', 'злив: остання катсцена ████']
OK = ['кіт ігнорує мене 10 хвилин', 'дата виходу на пк: досі нічого', 'як зварити борщ', 'розпаковка коробки']
def feed(spec):  # spec: список (тип, индекс): s = спойлер, b = размытый, r = пропущенный, o = обычное видео
    out = []
    for n, (k, i) in enumerate(spec):
        out.append(card(n, OK[i]) if k == 'o' else card(n, SP[i], blur=(k == 'b'), red=(k == 'r')))
    return '<div class="feed">' + ''.join(out) + '</div>'
def squares(seq):
    col = {'b': '#3A3E45', 'r': '#B38F00', 'w': '#2A2D32'}
    return '<div class="sq">' + ''.join(f'<span style="background:{col[c]}"></span>' for c in seq) + '</div>'
K = '<div class="k">заблюр або <b>лови спойлер</b></div>'
CARDS = {
 '2026-11-11': K + '<div class="cap">попрацюй <b>розширенням</b></div><div class="sub">стрічка летить. спойлери блюриш руками</div>' + feed([('o', 0), ('b', 1), ('s', 2), ('o', 3)]),
 '2026-11-12': K + '<div class="cap">як ван піс,<br>тільки <i>30 секунд</i></div>' + feed([('s', 0), ('s', 1), ('s', 2), ('s', 3)]),
 '2026-11-13': K + '<div class="cap">пройду років <b>через п\'ять</b></div><div class="sub">гра про спойлери готова вже зараз</div>' + feed([('b', 0), ('o', 1), ('b', 3)]),
 '2026-11-14': K + '<div class="cap"><i>0</i> справжніх спойлерів</div><div class="sub">усе закреслено чорним</div>' + feed([('s', 0), ('s', 2), ('s', 3)]),
 '2026-11-15': K + '<div class="cap">відкрити<br>на <b>свій ризик</b></div>' + feed([('o', 2), ('b', 0), ('b', 1)]),
 '2026-11-16': K + '<div class="cap">результат квадратиками</div><div class="sub">синій заблюрив. червоний зловив</div>' + squares('bbbbbrbbbbwbbrbbbbbbrbbr'),
 '2026-11-17': K + '<div class="cap"><b>00:40</b></div><div class="sub">далі стрічка летить швидше, ніж ти читаєш</div>' + feed([('r', 1), ('b', 0), ('r', 2), ('s', 3)]),
 '2026-11-18': K + '<div class="cap">завтра</div><div class="sub">останній день, коли ця гра ще вигадка</div>' + feed([('o', 1), ('s', 0), ('o', 0)]),
 '2026-11-19': K + '<div class="cap">вже <b>не вигадка</b></div><div class="sub">гта 6 вийшла</div>' + feed([('b', 0), ('b', 1), ('b', 2), ('b', 3)]),
}
OG = '<div class="k">Pure guides · a 40-second game</div><div class="cap">Blur or <b>be spoiled</b></div><div class="sub">The feed after GTA 6. You are the spoiler blocker.</div><div class="feed">' + card(0, 'who ████ in the final mission', blur=True, hid='SPOILER HIDDEN') + card(1, 'why ████ betrays ████') + '</div>'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--no-sandbox'])
        async def shot(body, path, w, h, cls=''):
            pg = await b.new_page(viewport={'width': w, 'height': h})
            await pg.set_content(f'<!doctype html><meta charset="utf-8"><style>{CSS}</style><body class="{cls}"><div class="w">{body}</div>')
            await pg.wait_for_timeout(250); await pg.screenshot(path=path); await pg.close()
        os.makedirs(os.path.join(ROOT, 'media', 'queue'), exist_ok=True)
        for d, body in CARDS.items():
            await shot(body + f'<div class="u">{URL}</div>', os.path.join(ROOT, 'media', 'queue', d + '.png'), 1080, 1350)
        await shot(OG, os.path.join(ROOT, 'media', 'play-og.png'), 1200, 630, 'og')
        await b.close()
asyncio.run(main())
