// X2 Outdoor Lab: состояние композиции ↔ адрес страницы. Только обезличенные параметры выбора (сцена, артикулы, укладка), никаких фотографий и координат участков.
import { MOUNT_BY_ID, JOINT_BY_ID, LAYOUT_BY_ID, DIRECTION_BY_ID } from './options.mjs';

const CODE = /^\d{6,14}$/;
/**
 * state: { scene, zone, zones: { [zoneId]: { code, mount, layout, direction, joint } } }.
 * В адресе: s=<сцена>&z=<зона>&<зона>=<артикул>.<монтаж>.<раскладка>.<направление>.<шов> (по одной записи на зону).
 */
export function encode(state) {
  const q = new URLSearchParams();
  q.set('s', state.scene); if (state.zone) q.set('z', state.zone);
  for (const [id, z] of Object.entries(state.zones || {})) q.set(`t.${id}`, [z.code, z.mount, z.layout, z.direction, z.joint].join('.'));
  return q.toString();
}
/** Разбор адреса. Принимает только известные значения; всё остальное отбрасывает (нельзя подсунуть что попало через ссылку). */
export function decode(text, { scenes = [], hasCode = () => true } = {}) {
  const q = new URLSearchParams(String(text || '').replace(/^#/, '')), out = { zones: {} };
  const s = q.get('s'); if (s && scenes.some(x => x.id === s)) out.scene = s;
  const scene = scenes.find(x => x.id === out.scene);
  const z = q.get('z'); if (z && scene?.zones.some(x => x.id === z)) out.zone = z;
  for (const zone of scene?.zones || []) {
    const raw = q.get(`t.${zone.id}`); if (!raw) continue;
    const [code, mount, layout, direction, joint] = raw.split('.');
    if (!CODE.test(code || '') || !hasCode(code)) continue;
    out.zones[zone.id] = { code, mount: MOUNT_BY_ID[mount] ? mount : undefined, layout: LAYOUT_BY_ID[layout] ? layout : undefined, direction: DIRECTION_BY_ID[direction] ? direction : undefined, joint: JOINT_BY_ID[joint] ? joint : undefined };
  }
  return out;
}
