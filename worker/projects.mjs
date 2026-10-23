// X2 Outdoor Lab: проекты посетителей. Адрес по ГАР/ФИАС (DaData, только с сервера), телефон по SMS-коду, закрытая карточка клиента, защищённая ссылка «только просмотр».
// Принципы: ничего не считается подтверждённым без проверки сервером; персональные данные и фото не попадают в публичные каналы, ссылки и логи;
// пока не заданы секреты и провайдеры (см. ops/outdoor/PROJECTS-SETUP.md), функция честно выключена (GET /api/projects/status → enabled: false), а не имитируется.
import { productMap } from '../src/catalog.mjs';
import { normalizePhone, sendTelegram, clean } from './quote-lead.mjs';
import { SCENES } from '../site/shared/outdoor/scenes.mjs';
import { ZONE_TYPES, MOUNT_BY_ID, JOINT_BY_ID, LAYOUT_BY_ID, DIRECTION_BY_ID } from '../site/shared/outdoor/options.mjs';

const enc = new TextEncoder();
const hex = bytes => [...bytes].map(x => x.toString(16).padStart(2, '0')).join('');
const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const randomBytes = n => crypto.getRandomValues(new Uint8Array(n));
const sha256 = async text => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))));
const hmacKey = secret => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const hmac = async (secret, data) => b64u(new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data))));
const safeEqual = (a, b) => { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
const now = env => (env.now ? env.now() : Date.now());

const LIMITS = { otpTtl: 5 * 60e3, otpResend: 60e3, otpPerHour: 5, otpPerDay: 10, otpGlobalHour: 400, attempts: 5, sessionTtl: 30 * 86400e3, tokenTtl: 2 * 3600e3, photoMax: 3_500_000, resultMax: 1_800_000, stateMax: 80_000, shareDaysMax: 365, shareDaysDefault: 30, projectsPerPhone: 30, photoTtlDays: 180 };
export const LIMITS_FOR_TESTS = LIMITS;
const ADDRESS_LEVELS = { house: 8, plot: 75 };            // уровни ФИАС: дом и земельный участок
const CITY_LEVELS = new Set([4, 6]);                       // город и населённый пункт

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer', ...headers } });
const fail = (message, status = 400, extra = {}) => json({ error: message, ...extra }, status);

/** Настройки функции. Включена только если заданы секрет, закрытое хранилище и SMS-провайдер: без подтверждения телефона проект сохранять нельзя. */
export function projectsConfig(env) {
  const sms = String(env.SMS_PROVIDER || '').toLowerCase();
  const smsReady = (sms === 'smsru' && !!env.SMS_API_KEY) || (sms === 'smsc' && !!env.SMS_LOGIN && !!env.SMS_PASSWORD) || (sms === 'mock' && env.ALLOW_MOCK_SMS === '1');
  const secret = String(env.PROJECTS_SECRET || '');
  return {
    secret, sms, smsReady, storage: env.PROJECT_FILES || null, dadataKey: env.DADATA_API_KEY || '', manager: String(env.MANAGER_TOKEN || ''),
    enabled: secret.length >= 32 && !!env.PROJECT_FILES && smsReady, address: !!env.DADATA_API_KEY, origin: env.APP_ORIGIN || '',
    fetch: env.fetch || fetch, sent: env.sentSms || null,
  };
}

// ------------------------------------------------------------------ SMS и DaData
async function sendSms(cfg, env, phone, text) {
  const to = phone.replace(/\D/g, '');
  if (cfg.sms === 'mock') { cfg.sent?.push({ phone, text }); return true; }
  const signal = AbortSignal.timeout(10000);
  if (cfg.sms === 'smsru') {
    const url = `${(env.SMS_API_BASE || 'https://sms.ru').replace(/\/+$/, '')}/sms/send?api_id=${encodeURIComponent(env.SMS_API_KEY)}&to=${to}&msg=${encodeURIComponent(text)}&json=1${env.SMS_SENDER ? `&from=${encodeURIComponent(env.SMS_SENDER)}` : ''}`;
    const r = await cfg.fetch(url, { signal }); const j = await r.json().catch(() => ({}));
    return r.ok && Number(j.status_code) === 100 && Object.values(j.sms || {}).every(x => Number(x.status_code) === 100);
  }
  if (cfg.sms === 'smsc') {
    const url = `${(env.SMS_API_BASE || 'https://smsc.ru').replace(/\/+$/, '')}/sys/send.php?login=${encodeURIComponent(env.SMS_LOGIN)}&psw=${encodeURIComponent(env.SMS_PASSWORD)}&phones=${to}&mes=${encodeURIComponent(text)}&fmt=3&charset=utf-8${env.SMS_SENDER ? `&sender=${encodeURIComponent(env.SMS_SENDER)}` : ''}`;
    const r = await cfg.fetch(url, { signal }); const j = await r.json().catch(() => ({}));
    return r.ok && !j.error && Number(j.cnt) >= 1;
  }
  return false;
}
async function dadata(cfg, env, body) {
  const base = (env.DADATA_API_BASE || 'https://suggestions.dadata.ru').replace(/\/+$/, '');
  const r = await cfg.fetch(`${base}/suggestions/api/4_1/rs/suggest/address`, { method: 'POST', signal: AbortSignal.timeout(5000), headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Token ${cfg.dadataKey}` }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('dadata ' + r.status);
  return (await r.json()).suggestions || [];
}
/** Подсказка DaData → подписанный токен: клиент не может подставить свой «адрес с идентификатором», проверка — на сервере. */
async function signSuggestion(cfg, env, s) {
  const d = s.data || {}, payload = { v: clean(s.value, 250), fid: String(d.fias_id || ''), lvl: Number(d.fias_level), reg: clean(d.region_with_type || d.region || '', 80), city: clean(d.city || d.settlement || '', 80), cf: String(d.city_fias_id || d.settlement_fias_id || (CITY_LEVELS.has(Number(d.fias_level)) ? d.fias_id : '') || ''), st: clean(d.street || '', 80), h: clean(d.house || '', 20), lat: d.geo_lat ? Number(d.geo_lat) : null, lon: d.geo_lon ? Number(d.geo_lon) : null, exp: now(env) + LIMITS.tokenTtl };
  const body = b64u(enc.encode(JSON.stringify(payload)));
  return { token: `${body}.${await hmac(cfg.secret, body)}`, payload };
}
export async function verifyToken(cfg, env, token) {
  const [body, sig] = String(token || '').split('.'); if (!body || !sig) return null;
  if (!safeEqual(await hmac(cfg.secret, body), sig)) return null;
  try { const p = JSON.parse(new TextDecoder().decode(unb64u(body))); return p.exp > now(env) && /^[0-9a-f-]{36}$/i.test(p.fid) ? p : null; } catch { return null; }
}

// ------------------------------------------------------------------ проверка данных проекта
const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const pt = (p, w, h) => Array.isArray(p) && p.length === 2 && num(p[0], -w * 0.05, w * 1.05) && num(p[1], -h * 0.05, h * 1.05);
const ring = (r, w, h, min = 3) => Array.isArray(r) && r.length >= min && r.length <= 120 && r.every(p => pt(p, w, h));
function settingsOf(z) {
  const p = productMap.get(String(z?.code)); if (!p || p.section !== 'x2') return null;
  if (!MOUNT_BY_ID[z.mount] || !LAYOUT_BY_ID[z.layout] || !DIRECTION_BY_ID[z.direction] || !JOINT_BY_ID[z.joint]) return null;
  return { code: p.code, mount: z.mount, layout: z.layout, direction: z.direction, joint: z.joint };
}
/** Состояние проекта → безопасная копия только из известных полей. null — данные не годятся. Фото в состояние не входит никогда. */
export function validateState(kind, state) {
  if (!state || typeof state !== 'object' || JSON.stringify(state).length > LIMITS.stateMax) return null;
  const areas = {}; for (const [k, v] of Object.entries(state.areas || {})) if (/^[a-z0-9-]{1,24}$/.test(k) && num(v, 0, 5000)) areas[k] = Math.round(v * 10) / 10;
  if (kind === 'scene') {
    const scene = SCENES.find(s => s.id === state.scene); if (!scene) return null;
    const zones = {}; for (const z of scene.zones) { if (state.zones?.[z.id]) { const s = settingsOf(state.zones[z.id]); if (!s) return null; zones[z.id] = s; } }
    if (!Object.keys(zones).length) return null;
    return { scene: scene.id, zone: scene.zones.some(z => z.id === state.zone) ? state.zone : scene.zones[0].id, zones, areas };
  }
  if (kind === 'plot') {
    const w = Number(state.w), h = Number(state.h); if (!Number.isInteger(w) || !Number.isInteger(h) || w < 200 || h < 200 || w > 4096 || h > 4096) return null;
    if (!Array.isArray(state.surfaces) || state.surfaces.length < 1 || state.surfaces.length > 4) return null;
    const surfaces = [], zones = {};
    for (const s of state.surfaces) {
      if (!/^s\d{1,3}$/.test(s?.id) || !ZONE_TYPES[s.type] || !ring(s.ring, w, h) || !Array.isArray(s.holes || []) || (s.holes || []).length > 8 || !(s.holes || []).every(r => ring(r, w, h))) return null;
      const settings = settingsOf(state.zones?.[s.id]); if (!settings) return null; zones[s.id] = settings;
      surfaces.push({ id: s.id, label: clean(s.label, 40), type: s.type, ring: s.ring.map(p => p.map(v => Math.round(v * 10) / 10)), holes: (s.holes || []).map(r => r.map(p => p.map(v => Math.round(v * 10) / 10))),
        mode: s.mode === 'horizon' ? 'horizon' : 'quad', quad: Array.isArray(s.quad) && s.quad.length === 4 && s.quad.every(p => pt(p, w, h)) ? s.quad : null,
        dims: { w: num(s.dims?.w, 0.3, 200) ? s.dims.w : 4, l: num(s.dims?.l, 0.3, 200) ? s.dims.l : 6, touched: !!s.dims?.touched },
        horizon: { y: num(s.horizon?.y, -0.6, 0.95) ? s.horizon.y : 0.38, yaw: num(s.horizon?.yaw, -75, 75) ? s.horizon.yaw : 0, height: num(s.horizon?.height, 0.4, 12) ? s.horizon.height : 1.6, fov: [45, 62, 75].includes(s.horizon?.fov) ? s.horizon.fov : 62, touched: !!s.horizon?.touched },
        known: s.known && pt(s.known.a, w, h) && pt(s.known.b, w, h) && num(s.known.m, 0.05, 200) ? { a: s.known.a, b: s.known.b, m: s.known.m } : null });
    }
    return { w, h, surfaces, zones, areas, exposure: num(state.exposure, 0.5, 1.6) ? state.exposure : 1 };
  }
  return null;
}
const SUSPICIOUS = /(.)\1{4,}|^[^\p{L}]+$/u;
export function manualAddressOk(text) {
  const t = String(text || '').trim();
  return t.length >= 10 && t.length <= 200 && /[А-Яа-яЁё]/.test(t) && t.split(/[\s,]+/).filter(Boolean).length >= 2 && !SUSPICIOUS.test(t);
}

// ------------------------------------------------------------------ JPEG: проверка и удаление метаданных (EXIF, GPS, XMP, комментарии)
export function sanitizeJpeg(bytes, maxBytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 100 || bytes.length > maxBytes || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const out = [bytes.subarray(0, 2)]; let i = 2, sof = false;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return null;
    let m = bytes[i + 1]; while (m === 0xff && i + 2 < bytes.length) { i++; m = bytes[i + 1]; }
    if (m === 0xda) { out.push(bytes.subarray(i)); if (!sof) return null; break; }                          // сжатые данные копируем как есть
    if (m === 0xd9) { out.push(bytes.subarray(i, i + 2)); break; }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) { out.push(bytes.subarray(i, i + 2)); i += 2; continue; }
    const len = (bytes[i + 2] << 8) | bytes[i + 3]; if (len < 2 || i + 2 + len > bytes.length) return null;
    const seg = bytes.subarray(i, i + 2 + len);
    if (m === 0xc0 || m === 0xc1 || m === 0xc2) { const h = (seg[5] << 8) | seg[6], w = (seg[7] << 8) | seg[8]; if (!w || !h || w > 8000 || h > 8000) return null; sof = true; }
    const keep = !(m >= 0xe1 && m <= 0xef) && m !== 0xfe;                                                  // APP1…APP15 и комментарии — убираем; APP0 (JFIF), таблицы и кадр оставляем
    if (keep) out.push(seg);
    i += 2 + len;
  }
  if (!sof) return null;
  const total = out.reduce((s, p) => s + p.length, 0), res = new Uint8Array(total); let o = 0; for (const p of out) { res.set(p, o); o += p.length; }
  return res;
}

// ------------------------------------------------------------------ вспомогательные
const originOk = (request, url) => request.headers.get('Origin') === url.origin && request.headers.get('Sec-Fetch-Site') !== 'cross-site';
const cookieName = url => url.protocol === 'https:' ? '__Host-italon_owner' : 'italon_owner_preview';
const getCookie = (request, name) => (request.headers.get('Cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1);
const maskPhone = p => p.replace(/^(\+7)(\d{3})(\d{3})(\d{2})(\d{2})$/, '$1 $2 ***-**-$5');
const mobileRu = p => /^\+79\d{9}$/.test(p || '');
const projectId = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return 'OUT-' + [...randomBytes(8)].map(b => A[b % A.length]).join(''); };
async function history(env, id, event, data = '') { await env.DB.prepare('INSERT INTO outdoor_history (project_id, at, event, data) VALUES (?, ?, ?, ?)').bind(id, now(env), event, String(data).slice(0, 300)).run(); }
const buckets = new Map();
function limited(key, max, windowMs, t) {
  const arr = (buckets.get(key) || []).filter(x => t - x < windowMs); if (arr.length >= max) { buckets.set(key, arr); return true; }
  arr.push(t); buckets.set(key, arr); if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.length || t - v[v.length - 1] > 3600e3) buckets.delete(k); return false;
}
async function readJson(request, max = 120_000) { const text = await request.text(); if (text.length > max) return null; try { return JSON.parse(text); } catch { return null; } }
async function session(request, env, url) {
  const token = getCookie(request, cookieName(url)); if (!/^[a-f0-9]{64}$/.test(token || '')) return null;
  const row = await env.DB.prepare('SELECT phone, expires_at FROM outdoor_sessions WHERE token_hash = ?').bind(await sha256(token)).first();
  return row && row.expires_at > now(env) ? row.phone : null;
}
const managerOk = (request, cfg) => { const t = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''); return cfg.manager.length >= 24 && safeEqual(t, cfg.manager); };
const ownerProject = (env, id, phone) => env.DB.prepare('SELECT * FROM outdoor_projects WHERE id = ? AND phone = ? AND deleted_at IS NULL').bind(id, phone).first();
const itemsOf = (kind, state) => { const zones = kind === 'scene' ? Object.fromEntries((SCENES.find(s => s.id === state.scene)?.zones || []).map(z => [z.id, z.label])) : Object.fromEntries((state.surfaces || []).map(s => [s.id, s.label]));
  return Object.entries(state.zones || {}).map(([zid, z]) => { const p = productMap.get(z.code); return { zone: zones[zid] || zid, code: z.code, name: p?.name || '', format: p?.format || '', area: state.areas?.[zid] || null, mount: z.mount, layout: z.layout, joint: z.joint }; }); };

async function purge(env, cfg) {
  const t = now(env); if (buckets.get('purge')?.[0] > t - 600e3) return; buckets.set('purge', [t]);
  const old = t - LIMITS.photoTtlDays * 86400e3;
  const photos = (await env.DB.prepare('SELECT id FROM outdoor_projects WHERE has_photo = 1 AND updated_at < ?').bind(old).all()).results;
  for (const { id } of photos) { await cfg.storage.delete(`${id}.photo.jpg`); await env.DB.prepare('UPDATE outdoor_projects SET has_photo = 0 WHERE id = ?').bind(id).run(); await history(env, id, 'photo_expired'); }
  await env.DB.prepare('DELETE FROM outdoor_otp WHERE created_at < ?').bind(t - 86400e3).run();
  await env.DB.prepare('DELETE FROM outdoor_sessions WHERE expires_at < ?').bind(t).run();
  await env.DB.prepare('DELETE FROM outdoor_shares WHERE expires_at < ?').bind(t - 30 * 86400e3).run();
}

// ------------------------------------------------------------------ маршруты
export async function handleProjects(request, env, url) {
  const path = url.pathname;
  if (!(path.startsWith('/api/projects') || path.startsWith('/api/p/') || path.startsWith('/api/manager/'))) return null;
  const cfg = projectsConfig(env);
  if (path === '/api/projects/status' && request.method === 'GET') return json({ enabled: cfg.enabled, address: cfg.address && cfg.enabled, sms: cfg.smsReady, photoDays: LIMITS.photoTtlDays });
  if (!cfg.enabled) return fail('Сохранение проектов пока не подключено.', 503);
  const method = request.method, t = now(env);
  if (method !== 'GET' && !originOk(request, url)) return fail('Запрос отклонён.', 403);
  try {
    purge(env, cfg).catch(e => console.error('projects_purge', e.message));

    // ---- публичный просмотр по токену
    if (path === '/api/p/open' || path === '/api/p/image') {
      if (method !== 'POST') return fail('Метод не поддерживается.', 405);
      const body = await readJson(request, 400); const token = String(body?.token || '');
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return fail('Ссылка недействительна.', 404);
      const client = request.headers.get('X-Client-Bucket') || 'anon';
      if (limited('view:' + client, 60, 60e3, t) || limited('view:all', 600, 60e3, t)) return fail('Слишком много запросов. Подождите минуту.', 429);
      const share = await env.DB.prepare('SELECT s.share_id, s.expires_at, s.revoked_at, p.* FROM outdoor_shares s JOIN outdoor_projects p ON p.id = s.project_id WHERE s.token_hash = ? AND p.deleted_at IS NULL').bind(await sha256(token)).first();
      if (!share || share.revoked_at || share.expires_at < t) return fail('Ссылка недействительна или срок её действия закончился.', 404);
      if (path === '/api/p/image') {
        const bytes = share.has_result ? await cfg.storage.get(`${share.id}.result.jpg`) : null; if (!bytes) return fail('Изображение недоступно.', 404);
        return new Response(bytes, { status: 200, headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } });
      }
      await env.DB.prepare('UPDATE outdoor_shares SET views = views + 1, last_view_at = ? WHERE token_hash = ?').bind(t, await sha256(token)).run();
      await env.DB.prepare('UPDATE outdoor_projects SET last_view_at = ? WHERE id = ?').bind(t, share.id).run();
      const state = JSON.parse(share.state_json), address = JSON.parse(share.address_json || '{}');
      return json({ title: share.title, kind: share.kind, city: address.city || share.city || '', scene: share.kind === 'scene' ? state.scene : null, items: itemsOf(share.kind, state), hasImage: !!share.has_result, expiresAt: share.expires_at });   // без телефона, улицы, дома, координат и фото
    }

    // ---- менеджер (закрытая карточка)
    if (path.startsWith('/api/manager/')) {
      if (!managerOk(request, cfg)) return fail('Нет доступа.', 401);
      if (limited('mgr', 120, 60e3, t)) return fail('Слишком много запросов.', 429);
      const m = path.match(/^\/api\/manager\/projects\/(OUT-[A-Z2-9]{8})(\/photo|\/result|\/review)?$/); if (!m) return fail('Адрес не найден.', 404);
      const p = await env.DB.prepare('SELECT * FROM outdoor_projects WHERE id = ?').bind(m[1]).first(); if (!p || p.deleted_at) return fail('Проект не найден.', 404);
      if (m[2] === '/photo' || m[2] === '/result') { const bytes = await cfg.storage.get(`${p.id}.${m[2] === '/photo' ? 'photo' : 'result'}.jpg`); if (!bytes) return fail('Файла нет.', 404); await history(env, p.id, 'manager_opened_' + m[2].slice(1)); return new Response(bytes, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } }); }
      if (m[2] === '/review') {
        if (method !== 'POST') return fail('Метод не поддерживается.', 405);
        const b = await readJson(request, 2000); const status = b?.status === 'verified' ? 'verified_by_manager' : b?.status === 'rejected' ? 'rejected' : null; if (!status) return fail('Укажите решение.');
        await env.DB.prepare('UPDATE outdoor_projects SET address_status = ?, updated_at = ? WHERE id = ?').bind(status, t, p.id).run(); await history(env, p.id, 'address_review', `${status}: ${clean(b.note, 200)}`); return json({ ok: true, status });
      }
      const hist = (await env.DB.prepare('SELECT at, event, data FROM outdoor_history WHERE project_id = ? ORDER BY at DESC LIMIT 60').bind(p.id).all()).results;
      const shares = (await env.DB.prepare('SELECT share_id, created_at, expires_at, revoked_at, views, last_view_at FROM outdoor_shares WHERE project_id = ?').bind(p.id).all()).results;
      await history(env, p.id, 'manager_opened');
      return json({ id: p.id, title: p.title, kind: p.kind, phone: p.phone, phoneVerified: true, addressStatus: p.address_status, address: JSON.parse(p.address_json), city: p.city, state: JSON.parse(p.state_json), items: itemsOf(p.kind, JSON.parse(p.state_json)), hasPhoto: !!p.has_photo, hasResult: !!p.has_result, marketingConsent: !!p.marketing_consent, createdAt: p.created_at, updatedAt: p.updated_at, lastViewAt: p.last_view_at, history: hist, shares });
    }

    // ---- адресные подсказки (только с сервера, ключ DaData наружу не уходит)
    if (path === '/api/projects/address/suggest') {
      if (method !== 'POST') return fail('Метод не поддерживается.', 405);
      if (!cfg.address) return fail('Проверка адреса сейчас недоступна. Можно указать адрес вручную: менеджер проверит его.', 503, { manual: true });
      const b = await readJson(request, 2000); const q = clean(b?.query, 120); if (q.length < 2) return json({ items: [] });
      const bucket = (await session(request, env, url)) || getCookie(request, 'italon_cart_preview') || getCookie(request, '__Host-italon_cart') || 'anon';
      if (limited('sug:' + (await sha256(String(bucket))).slice(0, 16), 40, 60e3, t) || limited('sug:all', 600, 60e3, t)) return fail('Слишком часто. Подождите немного.', 429);
      const mode = b.mode === 'city' ? 'city' : b.mode === 'plot' ? 'plot' : 'house', city = b.cityToken ? await verifyToken(cfg, env, b.cityToken) : null;
      const body = mode === 'city' ? { query: q, count: 6, from_bound: { value: 'city' }, to_bound: { value: 'settlement' } } : { query: q, count: 8, to_bound: { value: 'house' }, ...(city?.cf ? { locations: [{ [city.lvl === 6 ? 'settlement_fias_id' : 'city_fias_id']: city.cf }] } : {}) };
      let list; try { list = await dadata(cfg, env, body); } catch (e) { console.error('dadata_error', e.message); return fail('Подсказки адресов временно недоступны. Можно указать адрес вручную.', 503, { manual: true }); }
      const want = mode === 'city' ? (l => CITY_LEVELS.has(l)) : (l => l === ADDRESS_LEVELS[mode]);
      const items = []; for (const s of list) { const lvl = Number(s.data?.fias_level); if (!want(lvl) || !s.data?.fias_id) continue; const { token, payload } = await signSuggestion(cfg, env, s); items.push({ label: payload.v, level: lvl, token }); }
      return json({ items });
    }

    // ---- вход по SMS
    if (path === '/api/projects/otp/send') {
      if (method !== 'POST') return fail('Метод не поддерживается.', 405);
      const b = await readJson(request, 1000); const phone = normalizePhone(b?.phone);
      if (!mobileRu(phone)) return fail('Укажите российский мобильный номер, например +7 918 123-45-67.');
      if (b.consentPd !== true) return fail('Нужно согласие на обработку персональных данных.');
      const rows = (await env.DB.prepare('SELECT created_at FROM outdoor_otp WHERE phone = ? AND created_at > ? ORDER BY created_at DESC').bind(phone, t - 86400e3).all()).results;
      if (rows[0] && t - rows[0].created_at < LIMITS.otpResend) return fail('Код уже отправлен. Повторить можно через минуту.', 429, { retryAfter: Math.ceil((LIMITS.otpResend - (t - rows[0].created_at)) / 1000) });
      if (rows.filter(r => t - r.created_at < 3600e3).length >= LIMITS.otpPerHour || rows.length >= LIMITS.otpPerDay) return fail('Слишком много запросов кода для этого номера. Попробуйте позже.', 429);
      if (limited('otp:all', LIMITS.otpGlobalHour, 3600e3, t)) return fail('Сервис подтверждения перегружен. Попробуйте позже.', 503);
      const code = String(100000 + (new DataView(randomBytes(4).buffer).getUint32(0) % 900000));
      await env.DB.prepare('INSERT INTO outdoor_otp (phone, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(phone, await hmac(cfg.secret, `${phone}:${code}`), t, t + LIMITS.otpTtl).run();
      let ok = false; try { ok = await sendSms(cfg, env, phone, `Italon X2: код подтверждения ${code}. Никому его не сообщайте.`); } catch (e) { console.error('sms_error', e.message); }
      if (!ok) return fail('Не удалось отправить SMS. Проверьте номер или попробуйте позже.', 502);
      return json({ ok: true, retryAfter: 60, ttl: 300, phone: maskPhone(phone) });
    }
    if (path === '/api/projects/otp/verify') {
      if (method !== 'POST') return fail('Метод не поддерживается.', 405);
      const b = await readJson(request, 1000); const phone = normalizePhone(b?.phone), code = String(b?.code || '').replace(/\D/g, '');
      if (!mobileRu(phone) || code.length !== 6) return fail('Введите шестизначный код из SMS.');
      const row = await env.DB.prepare('SELECT rowid, code_hash, expires_at, attempts, used_at FROM outdoor_otp WHERE phone = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1').bind(phone).first();
      if (!row || row.expires_at < t) return fail('Код не найден или устарел. Запросите новый.', 400);
      if (row.attempts >= LIMITS.attempts) return fail('Слишком много неверных попыток. Запросите новый код.', 429);
      await env.DB.prepare('UPDATE outdoor_otp SET attempts = attempts + 1 WHERE rowid = ?').bind(row.rowid).run();
      if (!safeEqual(await hmac(cfg.secret, `${phone}:${code}`), row.code_hash)) return fail('Неверный код.', 400, { attemptsLeft: Math.max(0, LIMITS.attempts - row.attempts - 1) });
      await env.DB.prepare('UPDATE outdoor_otp SET used_at = ? WHERE rowid = ?').bind(t, row.rowid).run();
      const token = hex(randomBytes(32)), secure = url.protocol === 'https:';
      await env.DB.prepare('INSERT INTO outdoor_sessions (token_hash, phone, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256(token), phone, t, t + LIMITS.sessionTtl).run();
      return json({ ok: true, phone: maskPhone(phone) }, 200, { 'Set-Cookie': `${cookieName(url)}=${token}; Path=/; Max-Age=${LIMITS.sessionTtl / 1000}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}` });
    }
    if (path === '/api/projects/logout') {
      const token = getCookie(request, cookieName(url)); if (token) await env.DB.prepare('DELETE FROM outdoor_sessions WHERE token_hash = ?').bind(await sha256(token)).run();
      return json({ ok: true }, 200, { 'Set-Cookie': `${cookieName(url)}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${url.protocol === 'https:' ? '; Secure' : ''}` });
    }

    // ---- всё остальное — только владелец проекта
    const phone = await session(request, env, url);
    if (!phone) return fail('Подтвердите телефон по SMS, чтобы продолжить.', 401);
    if (path === '/api/projects/me' && method === 'GET') {
      const list = (await env.DB.prepare('SELECT id, title, kind, city, address_status, has_photo, has_result, created_at, updated_at, last_view_at FROM outdoor_projects WHERE phone = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 50').bind(phone).all()).results;
      return json({ phone: maskPhone(phone), projects: list.map(p => ({ id: p.id, title: p.title, kind: p.kind, city: p.city, addressStatus: p.address_status, hasPhoto: !!p.has_photo, hasResult: !!p.has_result, createdAt: p.created_at, updatedAt: p.updated_at, lastViewAt: p.last_view_at })) });
    }
    if (path === '/api/projects' && method === 'POST') {
      const b = await readJson(request, 160_000); if (!b) return fail('Некорректный запрос.');
      if (b.consentPd !== true) return fail('Нужно согласие на обработку персональных данных.');
      const kind = b.kind === 'plot' ? 'plot' : 'scene', state = validateState(kind, b.state); if (!state) return fail('Проверьте выбранные материалы и параметры: данные проекта не прошли проверку.');
      const title = clean(b.title, 80); if (title.length < 2) return fail('Укажите название проекта.');
      // адрес: только выбранный из справочника (подписанный сервером) либо ручной ввод со статусом «ждёт проверки менеджером»
      let status, address;
      if (b.address?.token) {
        const a = await verifyToken(cfg, env, b.address.token), c = b.address.cityToken ? await verifyToken(cfg, env, b.address.cityToken) : null;
        if (!a || ![ADDRESS_LEVELS.house, ADDRESS_LEVELS.plot].includes(a.lvl)) return fail('Выберите адрес из списка подсказок: дом или земельный участок.');
        if (c && a.cf && c.cf && a.cf !== c.cf) return fail('Адрес не относится к выбранному городу.');
        status = 'verified'; address = { source: 'dadata', label: a.v, fiasId: a.fid, level: a.lvl, region: a.reg, city: a.city, street: a.st, house: a.h, lat: a.lat, lon: a.lon, verifiedAt: t };
      } else if (b.address?.manual) {
        const m = b.address.manual; if (!manualAddressOk(m.text)) return fail('Опишите адрес подробнее: населённый пункт, улицу или СНТ, участок. Короткий или случайный текст не принимается.');
        const lat = Number(m.lat), lon = Number(m.lon), c = b.address.cityToken ? await verifyToken(cfg, env, b.address.cityToken) : null;
        status = 'pending_address_review'; address = { source: 'manual', label: clean(m.text, 200), city: c?.city || clean(m.city, 80), cityFiasId: c?.fid || '', lat: Number.isFinite(lat) && Math.abs(lat) <= 90 ? lat : null, lon: Number.isFinite(lon) && Math.abs(lon) <= 180 ? lon : null, submittedAt: t };
        if (!address.city) return fail('Укажите город или населённый пункт.');
      } else return fail('Укажите адрес объекта.');
      const stateJson = JSON.stringify(state);
      let id = b.id ? String(b.id) : '', existing = null;
      if (id) { existing = await ownerProject(env, id, phone); if (!existing) return fail('Проект не найден.', 404); }
      else {
        const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM outdoor_projects WHERE phone = ? AND deleted_at IS NULL').bind(phone).first()).n;
        if (n >= LIMITS.projectsPerPhone) return fail('Достигнут лимит проектов. Удалите ненужные, чтобы сохранить новый.', 409);
        id = projectId();
      }
      const photoConsent = b.photoConsent === true ? 1 : 0;
      if (existing) {
        await env.DB.prepare('UPDATE outdoor_projects SET title = ?, kind = ?, city = ?, address_status = ?, address_json = ?, state_json = ?, photo_consent = ?, marketing_consent = ?, updated_at = ? WHERE id = ?').bind(title, kind, address.city || '', status, JSON.stringify(address), stateJson, photoConsent, b.marketing === true ? 1 : 0, t, id).run();
        if (!photoConsent && existing.has_photo) { await cfg.storage.delete(`${id}.photo.jpg`); await env.DB.prepare('UPDATE outdoor_projects SET has_photo = 0 WHERE id = ?').bind(id).run(); }
        await history(env, id, 'updated');
      } else {
        await env.DB.prepare('INSERT INTO outdoor_projects (id, phone, title, kind, city, address_status, address_json, state_json, photo_consent, pd_consent_at, marketing_consent, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, phone, title, kind, address.city || '', status, JSON.stringify(address), stateJson, photoConsent, t, b.marketing === true ? 1 : 0, t, t).run();
        await history(env, id, 'created', `${kind}, адрес: ${status}`);
      }
      let lead = false;
      const row = await env.DB.prepare('SELECT lead_sent_at FROM outdoor_projects WHERE id = ?').bind(id).first();
      if (!row.lead_sent_at) {                                                 // одна заявка на проект: правки не создают новых
        const claim = await env.DB.prepare('UPDATE outdoor_projects SET lead_sent_at = ? WHERE id = ? AND lead_sent_at IS NULL').bind(t, id).run();
        if (claim.meta.changes === 1) {
          const items = itemsOf(kind, state), label = status === 'verified' ? 'выбран из справочника ГАР/ФИАС' : 'ждёт проверки менеджером';
          const text = ['🏠 <b>Новый проект Outdoor Lab</b>', `ID: <code>${id}</code>`, `Тип: ${kind === 'scene' ? `готовая сцена «${SCENES.find(s => s.id === state.scene)?.short}»` : 'фото клиента'}`, 'Телефон подтверждён SMS: да', `Адрес: ${label}`, '', ...items.map(i => `• ${i.zone}: <code>${i.code}</code>${i.area ? ` — ${i.area} м²` : ''}`), '', `Закрытая карточка: ${cfg.origin ? cfg.origin + '/manager/#' + id : '/manager/#' + id}`, 'Телефон и адрес в этом сообщении не указываются.'].join('\n');
          try { lead = await sendTelegram(env, text, null, null, cfg.fetch); } catch (e) { console.error('telegram_error', e.message); }
          await history(env, id, lead ? 'lead_sent' : 'lead_failed');
          if (!lead) await env.DB.prepare('UPDATE outdoor_projects SET lead_sent_at = NULL WHERE id = ?').bind(id).run();
        }
      }
      return json({ ok: true, id, addressStatus: status, lead });
    }
    const pm = path.match(/^\/api\/projects\/(OUT-[A-Z2-9]{8})(\/photo|\/result|\/shares(?:\/([0-9a-f]{8}))?)?$/);
    if (pm) {
      const id = pm[1], sub = pm[2] || '', p = await ownerProject(env, id, phone); if (!p) return fail('Проект не найден.', 404);
      if (sub === '' && method === 'GET') return json({ id: p.id, title: p.title, kind: p.kind, city: p.city, addressStatus: p.address_status, address: JSON.parse(p.address_json), state: JSON.parse(p.state_json), hasPhoto: !!p.has_photo, hasResult: !!p.has_result, photoConsent: !!p.photo_consent, updatedAt: p.updated_at });
      if (sub === '' && method === 'DELETE') {
        await cfg.storage.delete(`${id}.photo.jpg`); await cfg.storage.delete(`${id}.result.jpg`);
        await env.DB.prepare("UPDATE outdoor_shares SET revoked_at = ? WHERE project_id = ? AND revoked_at IS NULL").bind(t, id).run();
        await env.DB.prepare("UPDATE outdoor_projects SET phone = '', title = '', city = '', address_json = '{}', state_json = '{}', has_photo = 0, has_result = 0, deleted_at = ? WHERE id = ?").bind(t, id).run();
        await history(env, id, 'deleted_by_owner'); return json({ ok: true });
      }
      if ((sub === '/photo' || sub === '/result') && method === 'PUT') {
        if (sub === '/photo' && !p.photo_consent) return fail('Нет согласия на хранение фото. Отметьте его при сохранении проекта.', 403);
        if (!request.headers.get('Content-Type')?.startsWith('image/jpeg')) return fail('Нужен файл JPEG.', 415);
        const raw = new Uint8Array(await request.arrayBuffer()), clean_ = sanitizeJpeg(raw, sub === '/photo' ? LIMITS.photoMax : LIMITS.resultMax);
        if (!clean_) return fail('Файл не принят: нужен корректный JPEG не больше ' + (sub === '/photo' ? '3,5' : '1,8') + ' МБ.', 400);
        await cfg.storage.put(`${id}.${sub === '/photo' ? 'photo' : 'result'}.jpg`, clean_);
        await env.DB.prepare(`UPDATE outdoor_projects SET ${sub === '/photo' ? 'has_photo' : 'has_result'} = 1, updated_at = ? WHERE id = ?`).bind(t, id).run(); await history(env, id, sub === '/photo' ? 'photo_uploaded' : 'result_uploaded', clean_.length);
        return json({ ok: true, bytes: clean_.length });
      }
      if (sub === '/photo' && method === 'GET') { const bytes = p.has_photo ? await cfg.storage.get(`${id}.photo.jpg`) : null; if (!bytes) return fail('Фото нет.', 404); return new Response(bytes, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } }); }
      if (sub.startsWith('/shares')) {
        if (method === 'GET' && !pm[3]) return json({ shares: (await env.DB.prepare('SELECT share_id, created_at, expires_at, revoked_at, views, last_view_at FROM outdoor_shares WHERE project_id = ? ORDER BY created_at DESC').bind(id).all()).results.map(s => ({ id: s.share_id, createdAt: s.created_at, expiresAt: s.expires_at, revokedAt: s.revoked_at, views: s.views, lastViewAt: s.last_view_at })) });
        if (method === 'POST' && !pm[3]) {
          const b = await readJson(request, 500) || {}, days = Math.min(LIMITS.shareDaysMax, Math.max(1, Math.round(Number(b.days) || LIMITS.shareDaysDefault)));
          const active = (await env.DB.prepare('SELECT COUNT(*) AS n FROM outdoor_shares WHERE project_id = ? AND revoked_at IS NULL AND expires_at > ?').bind(id, t).first()).n; if (active >= 10) return fail('Слишком много активных ссылок. Отзовите ненужные.', 409);
          const token = b64u(randomBytes(32)), shareId = hex(randomBytes(4));
          await env.DB.prepare('INSERT INTO outdoor_shares (token_hash, share_id, project_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').bind(await sha256(token), shareId, id, t, t + days * 86400e3).run(); await history(env, id, 'share_created', `${shareId}, дней: ${days}`);
          return json({ ok: true, id: shareId, token, url: `${cfg.origin}/p/#${token}`, expiresAt: t + days * 86400e3 });   // токен показывается один раз: в базе хранится только его хеш
        }
        if (method === 'DELETE' && pm[3]) { const r = await env.DB.prepare('UPDATE outdoor_shares SET revoked_at = ? WHERE project_id = ? AND share_id = ? AND revoked_at IS NULL').bind(t, id, pm[3]).run(); if (r.meta.changes !== 1) return fail('Ссылка не найдена.', 404); await history(env, id, 'share_revoked', pm[3]); return json({ ok: true }); }
      }
      return fail('Метод не поддерживается.', 405);
    }
    return fail('Адрес не найден.', 404);
  } catch (e) {
    console.error('projects_error', e.message);
    return fail('Сервис проектов временно недоступен. Попробуйте ещё раз.', 503);
  }
}
