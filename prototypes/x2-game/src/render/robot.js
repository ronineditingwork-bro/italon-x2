// Робот X2 из геометрии: куб-голова с экраном и голубыми глазами, тонкие шарнирные руки и ноги, коробка X2 на спине
// с подающим механизмом снизу. Движение вперёд — по оси −Z, коробка на стороне +Z (к камере).
import * as THREE from '../../vendor/three.module.js';
import { RoundedBoxGeometry } from '../../vendor/RoundedBoxGeometry.js';
import { kraftTexture, glowTexture } from './textures.js';

const rbox = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 3, r);

export function createRobot() {
  const M = {
    white: new THREE.MeshStandardMaterial({ color: 0xece5d9, roughness: 0.6, metalness: 0.04 }),
    limb: new THREE.MeshStandardMaterial({ color: 0xd9d3c7, roughness: 0.45, metalness: 0.35 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x22262d, roughness: 0.5, metalness: 0.45 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xf08a24, roughness: 0.42, metalness: 0.1 }),
    face: new THREE.MeshStandardMaterial({ color: 0x0a1220, roughness: 0.18, metalness: 0.2 }),
    eye: new THREE.MeshBasicMaterial({ color: 0x66ecff, toneMapped: false }),
    kraft: new THREE.MeshStandardMaterial({ map: kraftTexture(), roughness: 0.92 }),
    kraftPlain: new THREE.MeshStandardMaterial({ map: kraftTexture({ label: false }), roughness: 0.92 }),
    slab: new THREE.MeshStandardMaterial({ color: 0xe6dccb, roughness: 0.55 }),
  };
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = false; return m; };
  const cyl = (r, h, mat, x = 0, y = 0, z = 0) => mesh(new THREE.CylinderGeometry(r, r, h, 10), mat, x, y, z);
  const ball = (r, mat) => mesh(new THREE.SphereGeometry(r, 12, 10), mat);

  const root = new THREE.Group();      // положение на мире
  const body = new THREE.Group();      // подпрыгивание и наклон
  root.add(body);

  // --- ноги ---
  const HIP_Y = 0.74;
  const legs = [-1, 1].map(side => {
    const hip = new THREE.Group(); hip.position.set(side * 0.13, HIP_Y, 0.02);
    hip.add(ball(0.065, M.dark));
    hip.add(cyl(0.04, 0.36, M.limb, 0, -0.18, 0));
    const knee = new THREE.Group(); knee.position.y = -0.36; hip.add(knee);
    knee.add(ball(0.062, M.orange));
    knee.add(cyl(0.034, 0.34, M.limb, 0, -0.17, 0));
    const ankle = new THREE.Group(); ankle.position.y = -0.34; knee.add(ankle);
    ankle.add(ball(0.05, M.dark));
    const foot = mesh(rbox(0.13, 0.08, 0.3, 0.035), M.white, 0, -0.05, -0.07);
    foot.rotation.x = 0.1;                                   // клиновидная ступня
    ankle.add(foot);
    ankle.add(mesh(rbox(0.11, 0.025, 0.28, 0.01), M.dark, 0, -0.095, -0.07));
    ankle.add(mesh(rbox(0.1, 0.05, 0.08, 0.02), M.orange, 0, -0.05, -0.2));
    body.add(hip);
    return { hip, knee, ankle };
  });

  // --- таз и корпус ---
  body.add(mesh(rbox(0.32, 0.14, 0.24, 0.05), M.dark, 0, HIP_Y + 0.06, 0.02));
  const torso = new THREE.Group(); torso.position.set(0, HIP_Y + 0.1, 0.02); body.add(torso);
  torso.add(mesh(rbox(0.44, 0.4, 0.32, 0.1), M.white, 0, 0.22, 0));
  torso.add(mesh(rbox(0.26, 0.1, 0.02, 0.01), M.dark, 0, 0.3, -0.165));     // панель на груди
  torso.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.07, 10), M.dark, 0, 0.45, 0));  // шея

  // --- голова ---
  const head = new THREE.Group(); head.position.set(0, 0.74, -0.01); torso.add(head);
  head.add(mesh(rbox(0.6, 0.47, 0.54, 0.13), M.white, 0, 0, 0));
  head.add(mesh(rbox(0.46, 0.3, 0.03, 0.05), M.face, 0, 0.0, -0.268));      // экран лица
  const eyes = [-1, 1].map(s => { const e = mesh(rbox(0.07, 0.15, 0.02, 0.025), M.eye, s * 0.1, 0.01, -0.285); e.castShadow = false; head.add(e); return e; });
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(130,240,255,0.9)', 'rgba(60,200,255,0.35)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  glow.scale.set(0.5, 0.3, 1); glow.position.set(0, 0.01, -0.3); head.add(glow);
  for (const s of [-1, 1]) {                                              // «уши»
    const ear = cyl(0.095, 0.06, M.dark, s * 0.32, 0, 0); ear.rotation.z = Math.PI / 2; head.add(ear);
    const cap = cyl(0.06, 0.07, M.orange, s * 0.345, 0, 0); cap.rotation.z = Math.PI / 2; head.add(cap);
  }
  head.add(mesh(rbox(0.5, 0.03, 0.4, 0.015), M.limb, 0, 0.245, 0));         // верхняя накладка

  // --- руки ---
  const arms = [-1, 1].map(side => {
    const shoulder = new THREE.Group(); shoulder.position.set(side * 0.285, 0.36, 0); torso.add(shoulder);
    shoulder.add(ball(0.065, M.orange));
    shoulder.add(cyl(0.032, 0.27, M.limb, 0, -0.135, 0));
    const elbow = new THREE.Group(); elbow.position.y = -0.27; shoulder.add(elbow);
    elbow.add(ball(0.05, M.dark));
    elbow.add(cyl(0.028, 0.25, M.limb, 0, -0.125, 0));
    const wrist = new THREE.Group(); wrist.position.y = -0.25; elbow.add(wrist);
    wrist.add(mesh(rbox(0.07, 0.07, 0.09, 0.02), M.dark, 0, -0.03, 0));
    for (const f of [-1, 1]) wrist.add(mesh(rbox(0.018, 0.08, 0.02, 0.006), M.dark, f * 0.03, -0.1, -0.02));  // «пальцы»
    return { shoulder, elbow, wrist };
  });

  // --- коробка на спине (сторона +Z) ---
  const pack = new THREE.Group(); pack.position.set(0, 0.26, 0.4); torso.add(pack);
  const boxMats = [M.kraft, M.kraft, M.kraftPlain, M.kraftPlain, M.kraft, M.kraft]; // +x, -x, +y, -y, +z, -z
  const box = new THREE.Mesh(rbox(0.8, 0.66, 0.5, 0.03), boxMats); box.castShadow = true; pack.add(box);
  for (const s of [-1, 1]) {                                                // ремни
    pack.add(mesh(rbox(0.07, 0.7, 0.54, 0.015), M.dark, s * 0.2, 0, 0));
    pack.add(mesh(rbox(0.05, 0.06, 0.04, 0.01), M.limb, s * 0.2, -0.18, 0.28));
  }
  pack.add(mesh(rbox(0.84, 0.05, 0.54, 0.015), M.dark, 0, 0.18, 0));        // обвязка
  const feeder = new THREE.Group(); feeder.position.set(0, -0.37, 0); pack.add(feeder);
  feeder.add(mesh(rbox(0.66, 0.1, 0.46, 0.02), M.dark, 0, 0, 0));
  feeder.add(mesh(rbox(0.5, 0.025, 0.04, 0.008), M.orange, 0, -0.03, 0.235));  // щель подачи
  const feedSlab = mesh(rbox(0.5, 0.045, 0.42, 0.012), M.slab, 0, -0.06, 0.0);   // плита в механизме
  feeder.add(feedSlab);

  const blinkState = { t: 0, next: 2.5 };
  const state = { phase: 0, feed: 0, pose: 0, yaw: Math.PI, targetYaw: Math.PI, bob: 0 };
  let tmp = 0;

  /**
   * dt — секунды; ctx: { running, y, vx, invuln, showcase }.
   * showcase: робот стоит лицом к камере (меню).
   */
  function update(dt, ctx) {
    const running = !!ctx.running;
    state.phase += dt * (running ? 12.6 : 0);
    const air = ctx.y > 0.02 ? 1 : 0;
    state.pose += (air - state.pose) * Math.min(1, dt * 14);                // 0 — бег, 1 — прыжок
    const p = state.phase, s = Math.sin(p), c = Math.cos(p);
    state.targetYaw = ctx.showcase ? Math.PI : 0;
    state.yaw += (state.targetYaw - state.yaw) * Math.min(1, dt * 5);
    const turn = THREE.MathUtils.clamp(-(ctx.vx || 0) * 0.045, -0.5, 0.5);
    root.rotation.y = state.yaw + (running ? turn : 0);
    body.rotation.z = running ? THREE.MathUtils.clamp(-(ctx.vx || 0) * 0.025, -0.25, 0.25) : 0;

    const run = running ? 1 : 0;
    const bob = (running ? Math.abs(c) * 0.07 * (1 - state.pose) : Math.sin(performance.now() / 600) * 0.012);
    body.position.y = bob;
    torso.rotation.x = -0.14 * run - state.pose * 0.08;
    torso.rotation.z = running ? s * 0.035 : 0;
    head.rotation.z = running ? -s * 0.03 : Math.sin(performance.now() / 1300) * 0.04;
    head.rotation.x = running ? 0.03 : 0;

    legs.forEach((leg, i) => {
      const ph = p + (i ? Math.PI : 0);
      const sw = Math.sin(ph);
      const hipRun = sw * 0.95;
      const kneeRun = Math.max(0, -Math.sin(ph + 0.9)) * 1.35 + 0.1;
      const ankleRun = -hipRun * 0.25 + 0.2;
      const hip = running ? THREE.MathUtils.lerp(hipRun, i ? 0.35 : 0.75, state.pose) : 0;
      const knee = running ? THREE.MathUtils.lerp(kneeRun, i ? 1.2 : 0.7, state.pose) : 0.02;
      leg.hip.rotation.x = hip;
      leg.knee.rotation.x = -knee;
      leg.ankle.rotation.x = running ? THREE.MathUtils.lerp(ankleRun, 0.2, state.pose) : 0;
    });
    arms.forEach((arm, i) => {
      const sw = Math.sin(p + (i ? 0 : Math.PI));
      const a = running ? THREE.MathUtils.lerp(sw * 0.95, i ? -0.9 : 0.5, state.pose) : (i ? -0.05 : 0.05) + Math.sin(performance.now() / 900 + i) * 0.03;
      arm.shoulder.rotation.x = a;
      arm.shoulder.rotation.z = (i ? -1 : 1) * (0.1 + state.pose * 0.35);
      arm.elbow.rotation.x = running ? -0.8 - Math.max(0, -sw) * 0.3 : -0.12;
    });

    // коробка слегка покачивается, подача плиты отдаёт в корпус
    state.feed = Math.max(0, state.feed - dt * 7);
    pack.rotation.z = running ? Math.sin(p * 0.5) * 0.03 : 0;
    pack.rotation.x = running ? c * 0.025 + state.feed * 0.04 : 0;
    pack.position.y = 0.26 + (running ? Math.sin(p * 2) * 0.012 : 0);
    feedSlab.position.z = state.feed * 0.34;                                 // плита выезжает назад
    feedSlab.position.y = -0.06 - state.feed * 0.03;

    // моргание
    blinkState.t += dt;
    let k = 1;
    if (blinkState.t > blinkState.next) { const b = (blinkState.t - blinkState.next) / 0.14; k = b < 1 ? Math.abs(1 - b * 2) * 0.9 + 0.1 : 1; if (b >= 1) { blinkState.t = 0; blinkState.next = 2 + Math.random() * 3; } }
    eyes.forEach(e => { e.scale.y = k; });

    // мигание при защите после столкновения
    root.visible = !(ctx.invuln > 0 && Math.floor(performance.now() / 90) % 2 === 0);
    tmp += dt;
  }

  return {
    root,
    box: pack,
    /** Мировая точка выхода плит (под коробкой). */
    feedWorld(out = new THREE.Vector3()) { return feeder.getWorldPosition(out); },
    kick() { state.feed = 1; },
    update,
    setYawImmediate(v) { state.yaw = v; },
  };
}
