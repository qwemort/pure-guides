// Личное уведомление Антону в Telegram. Секреты: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
// Использование: node tools/notify.mjs "текст"   (или текст в stdin)
// Без секретов тихо выходит с кодом 0 — уведомление не должно ломать основной workflow.
import fs from 'node:fs';
const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chat } = process.env;
const text = (process.argv[2] ?? fs.readFileSync(0, 'utf8')).trim().slice(0, 3900);
if (!token || !chat || !text) { console.log('notify: нет секретов или текста, пропуск'); process.exit(0); }
try {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
  }).then((x) => x.json());
  console.log(r.ok ? 'notify: отправлено' : `notify: ошибка Telegram: ${r.description}`);
} catch (e) { console.log('notify: сбой сети', String(e.message || e).slice(0, 120)); }
