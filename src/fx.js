import * as THREE from 'three';
import { G } from './ctx.js';
import { rand } from './utils.js';

const MAXP = 4500;
const _c = new THREE.Color();
const _z = new THREE.Vector3(0, 0, 1);
const _d = new THREE.Vector3();

// Pooled particles, tracers, shockwaves and flash lights.
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.uScale = { value: 800 };

    // ---- particles
    this.n = 0;
    this.pos = new Float32Array(MAXP * 3);
    this.col = new Float32Array(MAXP * 3);
    this.siz = new Float32Array(MAXP);
    this.vel = new Float32Array(MAXP * 3);
    this.base = new Float32Array(MAXP * 3);
    this.bsz = new Float32Array(MAXP);
    this.life = new Float32Array(MAXP);
    this.max = new Float32Array(MAXP);
    this.grav = new Float32Array(MAXP);
    this.drag = new Float32Array(MAXP);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.siz, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.points = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        uniforms: { uScale: this.uScale },
        vertexShader: `attribute vec3 aColor; attribute float aSize; uniform float uScale; varying vec3 vC;
          void main(){ vC=aColor; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=min(aSize*uScale/max(0.1,-mv.z), 220.0); gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `varying vec3 vC; void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard; float a=smoothstep(0.5,0.05,d); gl_FragColor=vec4(vC*a,1.0); }`,
        blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      })
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);

    // ---- ambient motes that wrap around the camera
    const MN = 500, seeds = new Float32Array(MN * 3);
    for (let i = 0; i < MN * 3; i++) seeds[i] = Math.random();
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
    this.moteU = { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uScale: this.uScale };
    this.motes = new THREE.Points(
      mg,
      new THREE.ShaderMaterial({
        uniforms: this.moteU,
        vertexShader: `uniform vec3 uCam; uniform float uTime, uScale; varying float vA; varying vec3 vC;
          void main(){ vec3 box=vec3(80.0,28.0,80.0); vec3 s=position; vec3 p=s*box;
            p.y+=sin(uTime*0.4+s.x*40.0)*1.5; p.x+=uTime*0.7*(s.z-0.3); p.z+=uTime*0.3*(s.x-0.5);
            p=mod(p-uCam,box)-box*0.5+uCam;
            vec4 mv=viewMatrix*vec4(p,1.0);
            vA=(0.45+0.55*sin(uTime*2.0+s.y*50.0))*smoothstep(40.0,22.0,length(mv.xyz))*smoothstep(0.5,3.0,-mv.z);
            vC=mix(vec3(1.0,0.75,0.45),vec3(0.5,1.0,0.95),step(0.5,fract(s.x*7.0)));
            gl_PointSize=(0.05+s.z*0.09)*uScale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `varying float vA; varying vec3 vC; void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard; gl_FragColor=vec4(vC*vA*smoothstep(0.5,0.0,d)*1.6,1.0); }`,
        blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      })
    );
    this.motes.frustumCulled = false;
    scene.add(this.motes);

    // ---- tracers
    this.tracers = [];
    const tg = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.tracers.push({ m, on: false, s: new THREE.Vector3(), d: new THREE.Vector3(), len: 0, head: 0, w: 0.03 });
    }

    // ---- shockwave rings + flash spheres
    this.rings = [];
    const rg = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      m.visible = false;
      scene.add(m);
      this.rings.push({ m, t: 0, life: 0, size: 1 });
    }
    this.balls = [];
    const bg = new THREE.SphereGeometry(1, 16, 10);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
      m.visible = false;
      scene.add(m);
      this.balls.push({ m, t: 0, life: 0, size: 1 });
    }

    this.muzzleLight = new THREE.PointLight(0xffc27a, 0, 16, 1.6);
    this.boomLight = new THREE.PointLight(0xff9a55, 0, 45, 1.4);
    scene.add(this.muzzleLight, this.boomLight);
  }

  spawn(x, y, z, vx, vy, vz, r, g, b, size, life, grav = 0, drag = 0) {
    if (this.n >= MAXP) return;
    const i = this.n++, j = i * 3;
    this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z;
    this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
    this.base[j] = r; this.base[j + 1] = g; this.base[j + 2] = b;
    this.bsz[i] = size;
    this.life[i] = this.max[i] = life;
    this.grav[i] = grav;
    this.drag[i] = drag;
  }

  // Burst of particles. o: n, speed, life, size, grav, drag, dir(Vector3), cone(0..1), k(brightness), up
  burst(p, color, o = {}) {
    const n = o.n ?? 12, sp = o.speed ?? 5, k = o.k ?? 1.6;
    _c.set(color);
    const dir = o.dir;
    for (let i = 0; i < n; i++) {
      let vx = rand(-1, 1), vy = rand(-1, 1), vz = rand(-1, 1);
      const l = Math.hypot(vx, vy, vz) || 1;
      vx /= l; vy /= l; vz /= l;
      if (dir) {
        const c = o.cone ?? 0.6;
        vx = dir.x + vx * c; vy = dir.y + vy * c; vz = dir.z + vz * c;
      }
      const s = sp * rand(0.35, 1);
      const v = rand(0.7, 1.2) * k;
      this.spawn(p.x, p.y, p.z, vx * s, vy * s + (o.up ?? 0), vz * s, _c.r * v, _c.g * v, _c.b * v,
        (o.size ?? 0.12) * rand(0.6, 1.3), (o.life ?? 0.5) * rand(0.6, 1.2), o.grav ?? 9, o.drag ?? 1.5);
    }
  }

  tracer(a, b, color, w = 0.03) {
    const t = this.tracers.find((x) => !x.on);
    if (!t) return;
    t.s.copy(a);
    t.d.subVectors(b, a);
    t.len = t.d.length();
    if (t.len < 1.5) return;
    t.d.divideScalar(t.len);
    t.head = 0;
    t.w = w;
    t.on = true;
    t.m.material.color.set(color).multiplyScalar(2.6);
    t.m.quaternion.setFromUnitVectors(_z, t.d);
    t.m.visible = true;
    this._placeTracer(t, 0.016);
  }

  _placeTracer(t, dt) {
    t.head += 420 * dt;
    const tail = Math.max(0, t.head - 14);
    if (tail >= t.len) {
      t.on = false;
      t.m.visible = false;
      return;
    }
    const head = Math.min(t.head, t.len);
    t.m.position.copy(t.s).addScaledVector(t.d, (head + tail) / 2);
    t.m.scale.set(t.w, t.w, Math.max(0.01, head - tail));
  }

  ring(p, color, size = 6, life = 0.45, tilt) {
    const r = this.rings.find((x) => x.t >= x.life) || this.rings[0];
    r.t = 0;
    r.life = life;
    r.size = size;
    r.m.position.copy(p);
    r.m.material.color.set(color).multiplyScalar(2);
    r.m.rotation.set(tilt ? rand(-0.5, 0.5) : 0, 0, tilt ? rand(-0.5, 0.5) : 0);
    r.m.visible = true;
  }

  ball(p, color, size = 4, life = 0.25) {
    const b = this.balls.find((x) => x.t >= x.life) || this.balls[0];
    b.t = 0;
    b.life = life;
    b.size = size;
    b.m.position.copy(p);
    b.m.material.color.set(color).multiplyScalar(2);
    b.m.visible = true;
  }

  muzzle(p, color = 0xffc27a) {
    this.muzzleLight.position.copy(p);
    this.muzzleLight.color.set(color);
    this.muzzleLight.intensity = 30;
  }

  impact(p, n, color = 0xffd9a0, big = false) {
    this.burst(p, color, { n: big ? 10 : 5, speed: 5, life: 0.3, size: 0.07, dir: n, cone: 0.9, grav: 12 });
    this.burst(p, 0xffffff, { n: 1, speed: 0.2, life: 0.08, size: big ? 0.5 : 0.3, grav: 0, k: 1.2 });
  }

  explosion(p, radius = 6) {
    this.burst(p, 0xffb14a, { n: 46, speed: radius * 2.6, life: 0.7, size: 0.5, grav: 6, drag: 2.5, k: 2 });
    this.burst(p, 0xff4f8b, { n: 26, speed: radius * 1.6, life: 0.9, size: 0.35, grav: -2, drag: 2, k: 1.8 });
    this.burst(p, 0xffffff, { n: 14, speed: radius * 4, life: 0.35, size: 0.14, grav: 14, drag: 0.5 });
    this.ring(p, 0xffc27a, radius * 1.5, 0.4);
    this.ball(p, 0xffa24a, radius * 0.75, 0.22);
    this.boomLight.position.copy(p).y += 1;
    this.boomLight.intensity = 260;
  }

  elimination(p, color) {
    _d.copy(p).y += 1;
    this.burst(_d, color, { n: 46, speed: 6, life: 1.0, size: 0.22, grav: -5, drag: 2.2, k: 2 });
    this.burst(_d, 0xffffff, { n: 16, speed: 9, life: 0.5, size: 0.1, grav: 4 });
    this.ring(p.clone().setY(p.y + 0.15), color, 3.2, 0.5);
    this.ball(_d, color, 1.6, 0.2);
  }

  update(dt, cam) {
    // particles (swap-remove)
    const { pos, vel, col, base, life, max, siz, bsz, grav, drag } = this;
    for (let i = 0; i < this.n; ) {
      life[i] -= dt;
      const j = i * 3;
      if (life[i] <= 0) {
        const l = --this.n, k = l * 3;
        if (l !== i) {
          pos[j] = pos[k]; pos[j + 1] = pos[k + 1]; pos[j + 2] = pos[k + 2];
          vel[j] = vel[k]; vel[j + 1] = vel[k + 1]; vel[j + 2] = vel[k + 2];
          base[j] = base[k]; base[j + 1] = base[k + 1]; base[j + 2] = base[k + 2];
          life[i] = life[l]; max[i] = max[l]; bsz[i] = bsz[l]; grav[i] = grav[l]; drag[i] = drag[l];
        }
        continue;
      }
      const f = 1 - drag[i] * dt;
      vel[j] *= f; vel[j + 1] = vel[j + 1] * f - grav[i] * dt; vel[j + 2] *= f;
      pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
      const a = life[i] / max[i];
      col[j] = base[j] * a; col[j + 1] = base[j + 1] * a; col[j + 2] = base[j + 2] * a;
      siz[i] = bsz[i] * (0.35 + 0.65 * a);
      i++;
    }
    const ga = this.points.geometry;
    ga.setDrawRange(0, this.n);
    if (this.n) {
      ga.attributes.position.needsUpdate = true;
      ga.attributes.aColor.needsUpdate = true;
      ga.attributes.aSize.needsUpdate = true;
    }

    for (const t of this.tracers) if (t.on) this._placeTracer(t, dt);
    for (const r of this.rings) {
      if (r.t >= r.life) continue;
      r.t += dt;
      const a = Math.min(1, r.t / r.life), e = 1 - Math.pow(1 - a, 3);
      r.m.scale.setScalar(0.3 + e * r.size);
      r.m.material.opacity = 1 - a;
      if (a >= 1) r.m.visible = false;
    }
    for (const b of this.balls) {
      if (b.t >= b.life) continue;
      b.t += dt;
      const a = Math.min(1, b.t / b.life);
      b.m.scale.setScalar(b.size * (0.4 + 0.6 * a));
      b.m.material.opacity = (1 - a) * 0.9;
      if (a >= 1) b.m.visible = false;
    }
    this.muzzleLight.intensity *= Math.exp(-38 * dt);
    this.boomLight.intensity *= Math.exp(-9 * dt);

    this.moteU.uTime.value = G.time;
    this.moteU.uCam.value.copy(cam.position);
  }

  resize(h, fovDeg) {
    this.uScale.value = h / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }
}
