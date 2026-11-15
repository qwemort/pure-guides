#!/usr/bin/env python3
"""Блок «Открой на компьютере» для телефонов: расширение на телефон не ставится, поэтому даём
ссылку себе на почту, «Скопировать» и «Поделиться». Без cookies, без сети, без аналитики: ссылка на магазин
берётся из data/facts.json с меткой utm_medium=mobile. Видно только на экранах без мыши (CSS, JS для показа не нужен,
поэтому страница не прыгает). Вставляется после первого </h1> на страницах, где есть ссылка на магазин Chrome.
Повторный запуск заменяет блок (смена текста или ссылки подхватывается).
  python3 tools/mobile-handoff.py          вставить/обновить
  python3 tools/mobile-handoff.py --check  только проверить (код выхода 1, если где-то нет или устарел)"""
import sys, re, json, html, pathlib, urllib.parse
ROOT = pathlib.Path(__file__).resolve().parent.parent
FACTS = json.loads((ROOT / 'data' / 'facts.json').read_text(encoding='utf-8'))
URL = FACTS['links']['chrome'] + '?utm_source=pureguides&utm_medium=mobile'
SKIP = ('s', 'design', 'media', 'img', 'devto', 'queue', 'data', 'fonts', 'i18n', 'tools', 'templates', 'node_modules', '.git', 'ext')
A, B = '<!-- mobile-handoff -->', '<!-- /mobile-handoff -->'
# заголовок, пояснение, «на почту», «скопировать», «поделиться», «скопировано», тема письма, начало письма
T = {
 'en': ('Open this on your computer', 'Pure Spoiler Blocker is a desktop browser extension, so it will not install on a phone. Send yourself the link and add it on your computer.', 'Email myself the link', 'Copy link', 'Share', 'Copied', 'Pure Spoiler Blocker for Chrome', 'Add it on your computer:'),
 'ru': ('Открой это на компьютере', 'Pure Spoiler Blocker ставится в браузер на компьютере, на телефон он не встанет. Отправь ссылку себе и установи там.', 'Отправить ссылку на почту', 'Скопировать ссылку', 'Поделиться', 'Скопировано', 'Pure Spoiler Blocker для Chrome', 'Установи на компьютере:'),
 'uk': ('Відкрий це на комп\'ютері', 'Pure Spoiler Blocker ставиться в браузер на комп\'ютері, на телефон він не встане. Надішли посилання собі та встанови там.', 'Надіслати посилання на пошту', 'Скопіювати посилання', 'Поділитися', 'Скопійовано', 'Pure Spoiler Blocker для Chrome', 'Встанови на комп\'ютері:'),
 'pl': ('Otwórz to na komputerze', 'Pure Spoiler Blocker to rozszerzenie przeglądarki na komputer, na telefonie się nie zainstaluje. Wyślij sobie link i dodaj je tam.', 'Wyślij sobie link mailem', 'Skopiuj link', 'Udostępnij', 'Skopiowano', 'Pure Spoiler Blocker do Chrome', 'Zainstaluj na komputerze:'),
 'de': ('Öffne das am Computer', 'Pure Spoiler Blocker ist eine Browser-Erweiterung für den Computer und lässt sich nicht aufs Handy installieren. Schick dir den Link und installiere sie dort.', 'Link per E-Mail an mich', 'Link kopieren', 'Teilen', 'Kopiert', 'Pure Spoiler Blocker für Chrome', 'Am Computer installieren:'),
 'fr': ('Ouvre ça sur ton ordinateur', 'Pure Spoiler Blocker est une extension de navigateur pour ordinateur, elle ne s\'installe pas sur un téléphone. Envoie-toi le lien et ajoute-la là-bas.', 'M\'envoyer le lien par e-mail', 'Copier le lien', 'Partager', 'Copié', 'Pure Spoiler Blocker pour Chrome', 'À installer sur l\'ordinateur :'),
 'es': ('Ábrelo en tu ordenador', 'Pure Spoiler Blocker es una extensión de navegador de escritorio, no se instala en el móvil. Envíate el enlace y añádela allí.', 'Enviarme el enlace por correo', 'Copiar enlace', 'Compartir', 'Copiado', 'Pure Spoiler Blocker para Chrome', 'Instálalo en el ordenador:'),
 'it': ('Aprilo sul computer', 'Pure Spoiler Blocker è un\'estensione per il browser del computer, non si installa sul telefono. Mandati il link e aggiungila lì.', 'Mandami il link per e-mail', 'Copia link', 'Condividi', 'Copiato', 'Pure Spoiler Blocker per Chrome', 'Installalo sul computer:'),
 'pt': ('Abra isto no computador', 'O Pure Spoiler Blocker é uma extensão de navegador para computador e não instala no celular. Envie o link para você e adicione lá.', 'Enviar o link por e-mail', 'Copiar link', 'Compartilhar', 'Copiado', 'Pure Spoiler Blocker para Chrome', 'Instale no computador:'),
 'tr': ('Bunu bilgisayarında aç', 'Pure Spoiler Blocker bilgisayar tarayıcısı için bir eklentidir, telefona kurulmaz. Bağlantıyı kendine gönder ve orada ekle.', 'Bağlantıyı e-postayla gönder', 'Bağlantıyı kopyala', 'Paylaş', 'Kopyalandı', 'Chrome için Pure Spoiler Blocker', 'Bilgisayarda kur:'),
 'ja': ('パソコンで開いてください', 'Pure Spoiler Blocker はパソコン用のブラウザ拡張機能で、スマホにはインストールできません。リンクを自分に送って、パソコンで追加してください。', 'リンクをメールで自分に送る', 'リンクをコピー', '共有', 'コピーしました', 'Chrome 用 Pure Spoiler Blocker', 'パソコンで追加:'),
 'ko': ('컴퓨터에서 열어 보세요', 'Pure Spoiler Blocker는 컴퓨터용 브라우저 확장 프로그램이라 휴대폰에는 설치되지 않습니다. 링크를 나에게 보내고 컴퓨터에서 추가하세요.', '링크를 이메일로 보내기', '링크 복사', '공유', '복사됨', 'Chrome용 Pure Spoiler Blocker', '컴퓨터에서 설치:'),
 'zh': ('请在电脑上打开', 'Pure Spoiler Blocker 是电脑浏览器扩展，无法安装在手机上。把链接发给自己，在电脑上添加。', '把链接发到我的邮箱', '复制链接', '分享', '已复制', 'Chrome 版 Pure Spoiler Blocker', '请在电脑上安装：'),
}
JS = ("(function(){var d=document.currentScript.parentNode,u=d.getAttribute('data-u'),c=d.querySelector('[data-c]'),s=d.querySelector('[data-s]');"
      "if(navigator.share){s.hidden=false;s.onclick=function(){navigator.share({title:d.getAttribute('data-t'),url:u}).catch(function(){})}}"
      "var ok=function(){var o=c.textContent;c.textContent=d.getAttribute('data-ok');setTimeout(function(){c.textContent=o},1800)},"
      "fb=function(){var i=document.createElement('input');i.value=u;document.body.appendChild(i);i.select();try{document.execCommand('copy');ok()}catch(e){}document.body.removeChild(i)};"
      "c.onclick=function(){if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(u).then(ok,fb)}else{fb()}}})();")

def block(lang):
    l = lang.lower().replace('_', '-')
    t = T.get(l) or T.get(l.split('-')[0]) or T['en']
    h, p, mail, cp, sh, ok, subj, lead = [html.escape(x, quote=True) for x in t]
    href = 'mailto:?subject=' + urllib.parse.quote(t[6]) + '&amp;body=' + urllib.parse.quote(t[7] + '\n' + URL, safe='')
    return (f'{A}<aside class="mh" data-u="{html.escape(URL, quote=True)}" data-t="{subj}" data-ok="{ok}"><strong>{h}</strong><p>{p}</p>'
            f'<div class="mh-row"><a href="{href}">{mail}</a><button type="button" data-c>{cp}</button><button type="button" data-s hidden>{sh}</button></div>'
            f'<script>{JS}</script></aside>{B}')

def targets():
    for f in sorted(ROOT.rglob('*.html')):
        rel = f.relative_to(ROOT)
        if rel.parts[0] in SKIP: continue
        s = f.read_text(encoding='utf-8')
        if '<main' not in s or 'noindex' in s or 'chromewebstore.google.com/detail/aloilpojkoblacapdlknacjiljgjibng' not in s: continue
        m = re.search(r'<html[^>]*\blang="([^"]+)"', s)
        yield f, s, (m.group(1) if m else 'en')

def run(check=False):
    bad = []; n = 0
    for f, s, lang in targets():
        s2 = re.sub(re.escape(A) + r'.*?' + re.escape(B), '', s, flags=re.S)
        i = s2.find('</h1>', s2.find('<main'))
        if i < 0: continue
        i += len('</h1>')
        new = s2[:i] + block(lang) + s2[i:]
        if new != s:
            bad.append(str(f.relative_to(ROOT)))
            if not check: f.write_text(new, encoding='utf-8'); n += 1
    return bad, n

if __name__ == '__main__':
    chk = '--check' in sys.argv
    bad, n = run(chk)
    if chk:
        print(f'mobile-handoff: нет или устарел на {len(bad)} страницах', bad[:5]); sys.exit(1 if bad else 0)
    print(f'mobile-handoff: обновлено {n} страниц')
