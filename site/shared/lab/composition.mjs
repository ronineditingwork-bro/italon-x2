// Ссылка на композицию: состояние лаборатории → короткая строка в адресе (#...) и обратно. Чистые функции, проверяются в Node.
import { FORMATS, JOINT_COLORS, BONDS, JOINT_MAX_MM } from './layout.mjs';

const MODES = ['day', 'evening', 'side', 'time'];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** state: { code, second, compare, mode, hour, format, turned, jointMm, jointColor, bond, cam:{rot,tilt,ppcm} } */
export function encode(s) {
  const q = new URLSearchParams();
  q.set('m', s.code); if (s.compare && s.second) q.set('b', s.second);
  q.set('l', String(MODES.indexOf(s.mode) < 0 ? 0 : MODES.indexOf(s.mode)));
  if (s.mode === 'time') q.set('h', String(Math.round(((s.hour % 24) + 24) % 24 * 10) / 10));
  q.set('f', s.format + (s.turned ? 'r' : '')); q.set('j', String(s.jointMm)); q.set('c', s.jointColor); q.set('k', s.bond);
  if (s.view === 'slabs') { q.set('w', 's'); q.set('n', String(s.slabs || 2)); }
  if (s.cam) q.set('v', [s.cam.rot, s.cam.tilt, s.cam.ppcm].map(x => Math.round(x * 100) / 100).join(','));
  return q.toString();
}
export function decode(text) {
  const q = new URLSearchParams(String(text || '').replace(/^#/, '')), out = {};
  const code = q.get('m'); if (code && /^\d{6,14}$/.test(code)) out.code = code;
  const b = q.get('b'); if (b && /^\d{6,14}$/.test(b)) { out.second = b; out.compare = true; }
  const l = Number(q.get('l')); if (q.has('l') && Number.isInteger(l) && l >= 0 && l < MODES.length) out.mode = MODES[l];
  const h = Number(q.get('h')); if (q.has('h') && Number.isFinite(h)) out.hour = clamp(h, 0, 24);
  const f = q.get('f') || ''; const fid = f.replace(/r$/, ''); if (FORMATS.some(x => x.id === fid)) { out.format = fid; out.turned = f.endsWith('r'); }
  const j = Number(q.get('j')); if (q.has('j') && Number.isFinite(j)) out.jointMm = clamp(j, 0, JOINT_MAX_MM);
  const c = q.get('c'); if (JOINT_COLORS.some(x => x.id === c)) out.jointColor = c;
  const k = q.get('k'); if (BONDS.some(x => x.id === k)) out.bond = k;
  if (q.get('w') === 's') { out.view = 'slabs'; const n = Math.round(Number(q.get('n'))); out.slabs = Number.isFinite(n) ? clamp(n, 1, 4) : 2; }
  const v = (q.get('v') || '').split(',').map(Number); if (v.length === 3 && v.every(Number.isFinite)) out.cam = { rot: clamp(v[0], -7, 7), tilt: clamp(v[1], 0, 1.08), ppcm: clamp(v[2], 1.2, 40) };
  return out;
}
