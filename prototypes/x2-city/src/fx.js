// Эффекты: искры (одно облако точек), взрывы (набор спрайтов из пула), тряска камеры. Объекты создаются один раз.
import { THREE, glowTex, smokeTex } from './kit.js';

export class Fx {
  constructor(scene, n = 360, reduced = false) {
    this.n = n; this.i = 0; this.reduced = reduced; this.shake = 0; this.stop = 0;
    this.pos = new Float32Array(n * 3).fill(-999); this.col = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.g = new Float32Array(n);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.2, map: glowTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); this.points.frustumCulled = false; scene.add(this.points);
    this.c = new THREE.Color();
    this.booms = Array.from({ length: 8 }, () => { const g = new THREE.Group(); g.visible = false; scene.add(g);
      const fire = [0, 1, 2, 3].map(i => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: i % 2 ? '#ff6a10' : '#ffe9a0', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })); s.position.set((i - 1.5) * 0.5, (i % 2) * 0.6, 0.2); g.add(s); return s; });
      const smk = [0, 1].map(i => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: '#1c1d28', depthWrite: false, transparent: true })); s.position.set(i - 0.5, 0.8, -0.2); g.add(s); return s; });
      return { g, fire, smk, t: 9, s: 1 }; });
    this.bi = 0;
  }
  spark(x, y, z, n, color, speed = 6, life = 0.5, grav = 14) {
    this.c.set(color);
    for (let k = 0; k < n; k++) { const i = this.i = (this.i + 1) % this.n, a = Math.random() * 6.283, s = speed * (0.3 + Math.random() * 0.7), j = i * 3;
      this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z; this.vel[j] = Math.cos(a) * s; this.vel[j + 1] = Math.abs(Math.sin(a)) * s; this.vel[j + 2] = (Math.random() - 0.5) * s * 0.6;
      this.col[j] = this.c.r; this.col[j + 1] = this.c.g; this.col[j + 2] = this.c.b; this.life[i] = life * (0.5 + Math.random()); this.g[i] = grav; }
  }
  boom(x, y, z, s = 1) { const b = this.booms[this.bi = (this.bi + 1) % this.booms.length]; b.g.position.set(x, y, z); b.g.visible = true; b.t = 0; b.s = s; this.spark(x, y, z, 26 * s, '#ffd27a', 9 * s, 0.7); this.addShake(0.12 * s); }
  addShake(a) { if (!this.reduced) this.shake = Math.min(0.5, Math.max(this.shake, a)); }
  hitStop(t) { if (!this.reduced) this.stop = Math.max(this.stop, t); }
  update(dt) {
    this.shake = Math.max(0, this.shake - dt * 1.2);
    for (let i = 0; i < this.n; i++) { if (this.life[i] <= 0) continue; const j = i * 3; this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[j + 1] = -999; continue; }
      this.vel[j + 1] -= this.g[i] * dt; this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < 0.03 && this.g[i] > 0) { this.pos[j + 1] = 0.03; this.vel[j + 1] *= -0.4; } }
    this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.color.needsUpdate = true;
    for (const b of this.booms) { if (!b.g.visible) continue; b.t += dt; const k = b.t / 0.7; if (k >= 1) { b.g.visible = false; continue; }
      b.fire.forEach((s, i) => { const sc = b.s * (1.6 + k * 3 + i * 0.4); s.scale.set(sc, sc, 1); s.material.opacity = (1 - k) * (1 - k) * 0.8; });
      b.smk.forEach((s, i) => { const sc = b.s * (2 + k * 4); s.scale.set(sc, sc, 1); s.position.y = 0.8 + k * 3 * b.s; s.material.opacity = 0.5 * (1 - k); }); }
  }
}
