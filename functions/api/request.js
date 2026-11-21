// Cloudflare Pages Function: форма /request/ -> Telegram Антону. Секреты в настройках Pages:
// TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TURNSTILE_SECRET (без него проверка Turnstile пропускается).
export async function onRequestPost({ request, env }) {
  const wantsJson = (request.headers.get('Accept') || '').includes('application/json');
  const back = (ok) => wantsJson ? new Response(JSON.stringify({ ok }), { status: ok ? 200 : 400, headers: { 'content-type': 'application/json' } })
    : Response.redirect(new URL(`/request/?${ok ? 'ok' : 'err'}=1`, request.url).toString(), 303);
  let f;
  try { f = await request.formData(); } catch { return back(false); }
  if (f.get('website')) return back(true);                       // ловушка для ботов
  const title = String(f.get('title') || '').trim().slice(0, 120);
  if (!title) return back(false);
  if (env.TURNSTILE_SECRET) {
    const body = new FormData();
    body.append('secret', env.TURNSTILE_SECRET);
    body.append('response', String(f.get('cf-turnstile-response') || ''));
    body.append('remoteip', request.headers.get('CF-Connecting-IP') || '');
    const v = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body }).then((r) => r.json()).catch(() => ({}));
    if (!v.success) return back(false);
  }
  const kind = { add: 'Добавить тайтл', date: 'Неверная дата', spoiler: 'Спойлер в списке' }[f.get('kind')] || 'Заявка';
  const text = `mutespoilers · ${kind}\n${title}\n${String(f.get('message') || '').trim().slice(0, 1000)}\nязык: ${f.get('lang') || '?'}`;
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return back(false);
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
  }).catch(() => null);
  return back(!!(r && r.ok));
}
