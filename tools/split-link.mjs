// Ссылки из постов — в первый комментарий (Антон 24.11.2026: «если в обычном посте ссылка, пиздец как режет»).
// splitLink(text) → { body: текст без ссылок, links: [найденные ссылки] }.
// Ссылкой считается http(s)://… и «голый» адрес вида domain.tld/путь (так release-posts пишет qwemort.github.io/...).
const RE = /(?:https?:\/\/|\b(?:[a-z0-9-]+\.)+(?:io|com|dev|app|net|org)\/)[^\s]*/gi;
export function splitLink(text) {
  const links = [];
  const body = String(text || '').split('\n').map((line) => line.replace(RE, (m) => { links.push(m.replace(/[),.!?]+$/, '')); return ''; }).replace(/[ \t]*(👇|⬇️|->|→|:)\s*$/u, '').trimEnd())
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { body, links: [...new Set(links)].map((l) => (/^https?:\/\//i.test(l) ? l : 'https://' + l)) };
}
