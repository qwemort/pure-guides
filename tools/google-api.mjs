// Вход в API Google служебным аккаунтом (без библиотек): JSON-ключ из секрета GOOGLE_SA_JSON → access token.
// Права выдаются только на чтение (chromewebstore.readonly, webmasters.readonly).
import crypto from 'node:crypto';
const b64u = (b) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
export async function googleToken(scopes) {
  const raw = process.env.GOOGLE_SA_JSON;
  if (!raw) return '';
  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({ iss: sa.client_email, scope: scopes.join(' '), aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3300 }));
  const sig = b64u(crypto.createSign('RSA-SHA256').update(`${head}.${body}`).sign(sa.private_key));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${sig}` }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`Google не выдал доступ: ${j.error || r.status} ${j.error_description || ''}`.trim());
  return j.access_token;
}
export async function gget(url, token) {
  const r = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`);
  return JSON.parse(t || '{}');
}
export async function gpost(url, token, body) {
  const r = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`);
  return JSON.parse(t || '{}');
}
