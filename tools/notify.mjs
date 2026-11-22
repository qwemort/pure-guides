// Личное уведомление Антону в Telegram. Секреты: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
// Использование: node tools/notify.mjs "текст"   (или текст в stdin)
// Без секретов тихо выходит с кодом 0 — уведомление не должно ломать основной workflow.
import fs from 'node:fs';
const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chat } = process.env;
const text = (process.argv[2] ?? fs.readFileSync(0, 'utf8')).trim().slice(0, 3900);
if (!token || !chat || !text) { console.log('notify: нет секретов или текста, пропуск'); process.exit(0); }
for (let i = 1; i <= 4; i++) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
    }).then((x) => x.json());
    if (r.ok) { console.log('notify: отправлено'); break; }
    console.log(`notify: ошибка Telegram: ${r.description}`);
    if (!/too many|retry|timeout|gateway|internal/i.test(r.description || '')) break;
  } catch (e) { console.log(`notify: сбой сети (попытка ${i}/4)`, String(e.message || e).slice(0, 120)); }
  await new Promise((s) => setTimeout(s, 5000 * i));   // 5, 10, 15 с
}
