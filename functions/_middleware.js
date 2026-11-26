// Переезд 26.11.2026: старый адрес mutespoilers.pages.dev и www ведут на mutespoilers.com (301, путь и параметры сохраняются).
// Служебные адреса сборок (<хеш>.mutespoilers.pages.dev) не трогаем.
const OLD = new Set(['mutespoilers.pages.dev', 'www.mutespoilers.com']);

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (OLD.has(url.hostname)) {
    url.hostname = 'mutespoilers.com';
    url.protocol = 'https:';
    url.port = '';
    return Response.redirect(url.toString(), 301);
  }
  return context.next();
}
