// Map expansion: road network props, six extra combat districts, and the dystopian backdrop
// (megacity skyline, searchlights, holo-billboards, patrol drones, burning wrecks).
import * as THREE from 'three';
import { G } from './ctx.js';

const DARK = 0x23204d, STEEL = 0x3b3f7a, CONC = 0x9d97cf, SLAB = 0x4b4785, TAN = 0xd8b78a, BURNT = 0x2a2438;
const PAINT = [0xff4f8b, 0x29d3c9, 0xffb52e, 0x7c5cff, 0x3fa9ff, 0xf4efff, 0xff7043];
const NEON = [0x4ff3ff, 0xff4fd8, 0xffe14a, 0x9dff3c];
const TAU = Math.PI * 2;

// ------------------------------------------------------------ vehicles + small props
function car(W, cx, cz, ax, color, o = {}) {
  const g = o.base ?? W.height(cx, cz), L = 4.4, Wd = 2.0, hx = ax ? L / 2 : Wd / 2, hz = ax ? Wd / 2 : L / 2;
  const col = o.burnt ? BURNT : color;
  W.box(cx - hx, g + 0.3, cz - hz, cx + hx, g + 1.05, cz + hz, col);
  const ix = ax ? L * 0.24 : Wd / 2 - 0.12, iz = ax ? Wd / 2 - 0.12 : L * 0.24;
  const ox = ax ? -0.3 : 0, oz = ax ? 0 : -0.3;
  W.box(cx - ix + ox, g + 1.05, cz - iz + oz, cx + ix + ox, g + 1.75, cz + iz + oz, 0x1b1d2e);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const wx = cx + sx * (ax ? L * 0.32 : Wd / 2 - 0.1), wz = cz + sz * (ax ? Wd / 2 - 0.1 : L * 0.32);
      W.box(wx - 0.36, g - 0.05, wz - 0.36, wx + 0.36, g + 0.62, wz + 0.36, 0x15131f, false);
    }
  if (o.burnt) {
    W.glow(cx - 0.55, g + 1.0, cz - 0.55, cx + 0.55, g + 1.12, cz + 0.55, 0xff7a2a, 2.8);
    W.fires.push({ x: cx, y: g + 1.3, z: cz });
  } else if (ax) {
    W.glow(cx + hx - 0.02, g + 0.68, cz - hz + 0.15, cx + hx + 0.05, g + 0.9, cz - hz + 0.6, 0xfff3c2, 2.2);
    W.glow(cx + hx - 0.02, g + 0.68, cz + hz - 0.6, cx + hx + 0.05, g + 0.9, cz + hz - 0.15, 0xfff3c2, 2.2);
    W.glow(cx - hx - 0.05, g + 0.74, cz - hz + 0.15, cx - hx + 0.02, g + 0.9, cz + hz - 0.15, 0xff3050, 1.9);
  } else {
    W.glow(cx - hx + 0.15, g + 0.68, cz + hz - 0.02, cx - hx + 0.6, g + 0.9, cz + hz + 0.05, 0xfff3c2, 2.2);
    W.glow(cx + hx - 0.6, g + 0.68, cz + hz - 0.02, cx + hx - 0.15, g + 0.9, cz + hz + 0.05, 0xfff3c2, 2.2);
    W.glow(cx - hx + 0.15, g + 0.74, cz - hz - 0.05, cx + hx - 0.15, g + 0.9, cz - hz + 0.02, 0xff3050, 1.9);
  }
}

function bus(W, cx, cz, ax, color, o = {}) {
  const g = o.base ?? W.height(cx, cz), L = 10, Wd = 2.7, hx = ax ? L / 2 : Wd / 2, hz = ax ? Wd / 2 : L / 2;
  W.box(cx - hx, g + 0.45, cz - hz, cx + hx, g + 3.1, cz + hz, o.burnt ? BURNT : color);
  W.box(cx - hx - 0.04, g + 0.45, cz - hz - 0.04, cx + hx + 0.04, g + 0.9, cz + hz + 0.04, 0x1b1d2e, false);
  const wc = o.burnt ? 0xff7a2a : 0x8ff8ff, k = o.burnt ? 2.2 : 1.3;
  if (ax) {
    W.glow(cx - hx + 0.6, g + 1.8, cz - hz - 0.05, cx + hx - 0.6, g + 2.5, cz - hz + 0.02, wc, k);
    W.glow(cx - hx + 0.6, g + 1.8, cz + hz - 0.02, cx + hx - 0.6, g + 2.5, cz + hz + 0.05, wc, k);
  } else {
    W.glow(cx - hx - 0.05, g + 1.8, cz - hz + 0.6, cx - hx + 0.02, g + 2.5, cz + hz - 0.6, wc, k);
    W.glow(cx + hx - 0.02, g + 1.8, cz - hz + 0.6, cx + hx + 0.05, g + 2.5, cz + hz - 0.6, wc, k);
  }
  for (const s of [-1, 1])
    for (const e of [-1, 1]) {
      const wx = cx + (ax ? e * L * 0.33 : s * (Wd / 2 - 0.1)), wz = cz + (ax ? s * (Wd / 2 - 0.1) : e * L * 0.33);
      W.box(wx - 0.45, g - 0.05, wz - 0.45, wx + 0.45, g + 0.8, wz + 0.45, 0x15131f, false);
    }
  if (o.burnt) W.fires.push({ x: cx, y: g + 3.2, z: cz });
}

function truck(W, cx, cz, ax, color) {
  const g = W.height(cx, cz), s = ax ? 1 : 0, t = ax ? 0 : 1;
  // cab at the +axis end, flatbed with a container behind it
  W.box(cx + s * 2.6 - (s ? 1.3 : 1.35), g + 0.5, cz + t * 2.6 - (t ? 1.3 : 1.35), cx + s * 2.6 + (s ? 1.3 : 1.35), g + 3.0, cz + t * 2.6 + (t ? 1.3 : 1.35), color);
  W.box(cx - s * 2.9 - (s ? 3.4 : 1.3), g + 0.7, cz - t * 2.9 - (t ? 3.4 : 1.3), cx - s * 2.9 + (s ? 3.4 : 1.3), g + 1.15, cz - t * 2.9 + (t ? 3.4 : 1.3), 0x1b1d2e);
  W.box(cx - s * 2.9 - (s ? 3.2 : 1.25), g + 1.15, cz - t * 2.9 - (t ? 3.2 : 1.25), cx - s * 2.9 + (s ? 3.2 : 1.25), g + 3.6, cz - t * 2.9 + (t ? 3.2 : 1.25), W.pickC(PAINT));
  W.glow(cx + s * 3.9 - (s ? 0.02 : 1.0), g + 1.0, cz + t * 3.9 - (t ? 0.02 : 1.0), cx + s * 3.9 + (s ? 0.05 : 1.0), g + 1.25, cz + t * 3.9 + (t ? 0.05 : 1.0), 0xfff3c2, 2);
}

function sandbags(W, cx, cz, len, ax) {
  const g = W.height(cx, cz), hx = ax ? len / 2 : 0.45, hz = ax ? 0.45 : len / 2;
  W.box(cx - hx, g - 0.4, cz - hz, cx + hx, g + 0.75, cz + hz, TAN);
  W.box(cx - hx * (ax ? 0.92 : 0.8), g + 0.75, cz - hz * (ax ? 0.8 : 0.92), cx + hx * (ax ? 0.92 : 0.8), g + 1.2, cz + hz * (ax ? 0.8 : 0.92), 0xc4a274);
}

function jersey(W, cx, cz, len, ax) {
  const g = W.height(cx, cz), hx = ax ? len / 2 : 0.35, hz = ax ? 0.35 : len / 2;
  W.box(cx - hx, g - 0.4, cz - hz, cx + hx, g + 1.1, cz + hz, CONC);
  W.glow(cx - hx * 0.9, g + 0.5, cz - hz - 0.03, cx + hx * 0.9, g + 0.62, cz + hz + 0.03, 0xffb52e, 1.6);
}

function barrelFire(W, x, z) {
  const g = W.height(x, z);
  W.box(x - 0.4, g - 0.2, z - 0.4, x + 0.4, g + 1.0, z + 0.4, 0x3a2d4a);
  W.glow(x - 0.3, g + 0.98, z - 0.3, x + 0.3, g + 1.08, z + 0.3, 0xff8a2a, 3);
  W.fires.push({ x, y: g + 1.2, z });
}

// ------------------------------------------------------------ holographic billboards
const PLANE = new THREE.PlaneGeometry(1, 1);
function signTexture(text, sub, color) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d'), hex = '#' + color.toString(16).padStart(6, '0');
  g.fillStyle = '#0b0820';
  g.fillRect(0, 0, 512, 256);
  const gr = g.createLinearGradient(0, 0, 512, 256);
  gr.addColorStop(0, hex + '55');
  gr.addColorStop(1, '#00000000');
  g.fillStyle = gr;
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = hex;
  g.lineWidth = 8;
  g.strokeRect(10, 10, 492, 236);
  g.fillStyle = hex;
  for (let i = 0; i < 9; i++) g.fillRect(26 + i * 16, 26, 9, 9);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let fs = 110;
  do {
    fs -= 4;
    g.font = `italic 900 ${fs}px "Arial Black", Impact, sans-serif`;
  } while (g.measureText(text).width > 440 && fs > 30);
  g.shadowColor = hex;
  g.shadowBlur = 22;
  g.fillStyle = '#ffffff';
  g.fillText(text, 256, sub ? 116 : 132);
  g.shadowBlur = 0;
  if (sub) {
    g.font = 'italic 900 26px "Arial Black", Impact, sans-serif';
    g.fillStyle = hex;
    g.fillText(sub, 256, 200);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function billboard(W, x, z, ax, text, sub, color, hgt = 7, w = 9, h = 4.4) {
  if (W.phys.blocked(x, W.height(x, z), z, 1.2, 3)) return;
  const g = W.height(x, z), px = ax ? w * 0.36 : 0, pz = ax ? 0 : w * 0.36;
  for (const s of [-1, 1]) W.box(x + s * px - 0.25, g - 1, z + s * pz - 0.25, x + s * px + 0.25, g + hgt + 0.2, z + s * pz + 0.25, DARK);
  const fx = ax ? w / 2 + 0.25 : 0.16, fz = ax ? 0.16 : w / 2 + 0.25;
  W.box(x - fx, g + hgt - 0.25, z - fz, x + fx, g + hgt + h + 0.25, z + fz, 0x15131f, false);
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: signTexture(text, sub, color) }, time: W.uT, seed: { value: W.R() * 40 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform float time,seed; varying vec2 vUv;
      void main(){ vec2 uv=vUv; float gl=step(0.985,fract(sin(floor(time*9.0+seed)*91.7)*43758.5));
        uv.x+=gl*0.035*sin(uv.y*46.0+time*30.0);
        vec3 c=texture2D(map,uv).rgb; float scan=0.8+0.2*sin(uv.y*190.0-time*7.0);
        float fl=0.88+0.12*sin(time*23.0+seed*7.0);
        gl_FragColor=vec4(c*scan*fl*2.1,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(PLANE, mat);
    m.scale.set(w, h, 1);
    m.position.set(x + (ax ? 0 : s * 0.19), g + hgt + h / 2, z + (ax ? s * 0.19 : 0));
    m.rotation.y = ax ? (s > 0 ? 0 : Math.PI) : s > 0 ? Math.PI / 2 : -Math.PI / 2;
    W.scene.add(m);
  }
}

// ------------------------------------------------------------ larger structures
// Bombed-out shell: broken perimeter walls, half an upper floor, a stair up to it.
function ruin(W, cx, cz, w, d, h) {
  const g = W.height(cx, cz), yb = g - 1.2, t = 0.6, seg = 2.2, R = W.R;
  const wallC = W.pickC([0xcfc8f0, 0xbdb4e6, 0xe2d6ee, 0xd8c2e4]);
  const side = (ax, fixed, a0, a1, doorway) => {
    for (let a = a0; a < a1 - 0.1; a += seg) {
      const e = Math.min(a1, a + seg), r = R();
      if (r < 0.22 || (doorway && a < cz + 1.7 && e > cz - 1.7)) continue; // keep the stair foot open
      const hh = r < 0.45 ? 1.0 + R() * 0.8 : r < 0.75 ? h * 0.45 + R() * 1.6 : h;
      if (ax) W.box(a, yb, fixed - t / 2, e, g + hh, fixed + t / 2, wallC);
      else W.box(fixed - t / 2, yb, a, fixed + t / 2, g + hh, e, wallC);
    }
  };
  side(true, cz - d / 2, cx - w / 2, cx + w / 2);
  side(true, cz + d / 2, cx - w / 2, cx + w / 2);
  side(false, cx - w / 2, cz - d / 2, cz + d / 2);
  side(false, cx + w / 2, cz - d / 2, cz + d / 2, true);
  const fy = g + 3.4;
  W.box(cx - w / 2 + 0.3, fy - 0.35, cz - d / 2 + 0.3, cx + 0.5, fy, cz + d / 2 - 0.3, SLAB);
  for (const pz of [-1, 1]) W.box(cx - w / 4 - 0.3, yb, cz + pz * (d / 2 - 1.2) - 0.3, cx - w / 4 + 0.3, fy - 0.35, cz + pz * (d / 2 - 1.2) + 0.3, STEEL);
  const n = 9, rise = 3.4 / n;
  for (let i = 0; i < n; i++) W.box(cx + 0.5 + (n - 1 - i) * 0.8, yb, cz - 1, cx + 0.5 + (n - i) * 0.8, g + (i + 1) * rise, cz + 1, i % 2 ? SLAB : STEEL);
  W.glow(cx - w / 2 + 0.5, fy - 0.42, cz - 0.15, cx + 0.3, fy - 0.36, cz + 0.15, W.pickC(NEON), 2);
  for (let i = 0; i < 6; i++) {
    const s = 0.5 + R() * 0.9, x = cx + (R() - 0.5) * (w + 5), z = cz + (R() - 0.5) * (d + 5);
    if (W.phys.blocked(x, g, z, s, 2)) continue;
    W.box(x - s / 2, g - 0.3, z - s / 2, x + s / 2, g + s * 0.7, z + s / 2, wallC);
  }
  W.lootSpots.push({ x: cx - w / 4, y: fy, z: cz + 1.5 }, { x: cx - w / 4 + 1, y: g, z: cz - 2 }, { x: cx + w / 4, y: g, z: cz + d / 4 });
}

// Low concrete pillbox with firing slits.
function bunker(W, cx, cz, w, d, door = 's') {
  const g = W.height(cx, cz), yb = g - 1.2, t = 0.7, top = g + 2.7, C = 0x8d87c4;
  const slit = (len, mid) => [{ c: mid, w: len * 0.62, y0: 1.2, y1: 1.78 }], dr = (mid) => [{ c: mid, w: 2.2, y0: 0, y1: 2.3 }];
  W.wall(true, cz - d / 2 + t / 2, cx - w / 2, cx + w / 2, yb, g, top, t, C, door === 'n' ? dr(cx) : slit(w, cx));
  W.wall(true, cz + d / 2 - t / 2, cx - w / 2, cx + w / 2, yb, g, top, t, C, door === 's' ? dr(cx) : slit(w, cx));
  W.wall(false, cx - w / 2 + t / 2, cz - d / 2 + t, cz + d / 2 - t, yb, g, top, t, C, slit(d, cz));
  W.wall(false, cx + w / 2 - t / 2, cz - d / 2 + t, cz + d / 2 - t, yb, g, top, t, C, slit(d, cz));
  W.box(cx - w / 2 - 0.4, top, cz - d / 2 - 0.4, cx + w / 2 + 0.4, top + 0.55, cz + d / 2 + 0.4, 0x5a5796);
  W.glow(cx - 0.6, top - 0.12, cz - 0.12, cx + 0.6, top - 0.04, cz + 0.12, 0xff3050, 2.4);
  W.lootSpots.push({ x: cx, y: g, z: cz });
}

function pylon(W, x, z, ax) {
  const g = W.height(x, z), H = 17;
  W.box(x - 0.3, g - 1, z - 0.3, x + 0.3, g + H, z + 0.3, STEEL);
  const hx = ax ? 2.4 : 0.14, hz = ax ? 0.14 : 2.4;
  W.box(x - hx, g + H - 2, z - hz, x + hx, g + H - 1.7, z + hz, STEEL, false);
  W.glow(x - 0.2, g + H, z - 0.2, x + 0.2, g + H + 0.4, z + 0.2, 0xff3050, 3);
  return [new THREE.Vector3(x - (ax ? 2.2 : 0), g + H - 1.7, z - (ax ? 0 : 2.2)), new THREE.Vector3(x + (ax ? 2.2 : 0), g + H - 1.7, z + (ax ? 0 : 2.2))];
}

// ------------------------------------------------------------ districts
export function buildDistricts(W) {
  const R = W.R, P = (name) => W.pois.find((p) => p.name === name);
  W.fires = [];
  const wires = [];
  const free = (x, z, r) => !W.phys.blocked(x, W.height(x, z), z, r, 3);

  // --- roads: reflective studs, lamp posts, abandoned traffic, power lines
  W.roads.forEach((rd, ri) => {
    const dx = (rd.bx - rd.ax) / rd.len, dz = (rd.bz - rd.az) / rd.len, ax = Math.abs(dx) > Math.abs(dz);
    let prev = null;
    for (let s = 4; s < rd.len - 4; s += 5) {
      const x = rd.ax + dx * s, z = rd.az + dz * s;
      const poi = W.inPOI(x, z, 0.82);
      if (poi) continue;
      for (const o of [-3.1, 3.1]) {
        const sx = x - dz * o, sz = z + dx * o, y = W.height(sx, sz);
        if (y > 0.2) W.glow(sx - 0.15, y + 0.01, sz - 0.15, sx + 0.15, y + 0.1, sz + 0.15, 0xffb52e, 2.6);
      }
      const k = Math.round(s / 5);
      if (k % 5 === 2) {
        const side = k % 10 === 2 ? 4.6 : -4.6, lx = x - dz * side, lz = z + dx * side;
        if (W.height(lx, lz) > 0.6 && free(lx, lz, 0.6)) W.lamp(lx, lz, ri % 2 ? 0x4ff3ff : 0xff4fd8);
      }
      if (k % 4 === 1) {
        const r = R(), side = (R() < 0.5 ? -1 : 1) * (0.9 + R() * 0.8), vx = x - dz * side, vz = z + dx * side;
        if (W.height(vx, vz) < 0.8 || !free(vx, vz, 3.2)) continue;
        if (r < 0.2) car(W, vx, vz, ax, W.pickC(PAINT));
        else if (r < 0.32) car(W, vx, vz, ax, 0, { burnt: true });
        else if (r < 0.4) jersey(W, vx, vz, 3.6, !ax);
        else if (r < 0.45) truck(W, vx, vz, ax, W.pickC(PAINT));
        if (r < 0.32 && R() < 0.5) W.lootSpots.push({ x: vx - dz * 2.4, y: W.height(vx - dz * 2.4, vz + dx * 2.4), z: vz + dx * 2.4 });
      }
      if ((ri === 1 || ri === 7 || ri === 17) && k % 6 === 3) {
        const tx = x - dz * 7.5, tz = z + dx * 7.5;
        if (W.height(tx, tz) > 0.8 && free(tx, tz, 1) && !W.inPOI(tx, tz, 1)) {
          const tops = pylon(W, tx, tz, !ax);
          if (prev) for (let i = 0; i < 2; i++) wires.push(prev[i].x, prev[i].y, prev[i].z, tops[i].x, tops[i].y, tops[i].z);
          prev = tops;
        }
      }
    }
  });
  if (wires.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: new THREE.Color(0x4ff3ff).multiplyScalar(0.9), transparent: true, opacity: 0.7 }));
    lines.frustumCulled = false;
    W.scene.add(lines);
  }

  // --- SCRAPYARD: stacked wrecks, container walls, a crusher
  {
    const p = P('SCRAPYARD'), g = p.h;
    for (const [ox, oz, ax, n] of [[-9, -8, 1, 3], [-9, -4.6, 1, 2], [-2, -9, 0, 3], [8, -6, 1, 2], [9, 5, 0, 3], [-10, 8, 1, 2], [-3, 9, 1, 1]])
      for (let i = 0; i < n; i++) car(W, p.x + ox, p.z + oz, !!ax, W.pickC(PAINT), { base: g + i * 1.5, burnt: R() < 0.55 });
    W.container(p.x + 12, p.z - 13, true, 0xffb52e);
    W.container(p.x + 12, p.z - 13, true, 0x7c5cff, 1);
    W.container(p.x - 15, p.z + 1, false, 0x29d3c9);
    W.container(p.x + 2, p.z + 15, true, 0xff4f8b);
    // crusher
    W.box(p.x + 1, g - 1, p.z - 2.5, p.x + 6, g + 4.2, p.z + 2.5, STEEL);
    W.box(p.x + 1.4, g + 4.2, p.z - 2.1, p.x + 5.6, g + 5.4, p.z + 2.1, 0xffb52e);
    W.glow(p.x + 0.94, g + 1.2, p.z - 1.6, p.x + 1.0, g + 3.2, p.z + 1.6, 0xff7a2a, 2.2);
    // crane arm
    W.box(p.x - 16.5, g - 1, p.z - 13.5, p.x - 15.5, g + 13, p.z - 12.5, 0xffb52e);
    W.box(p.x - 16.3, g + 12, p.z - 13.3, p.x - 3, g + 12.9, p.z - 12.7, 0xffb52e, false);
    W.box(p.x - 4.4, g + 7.5, p.z - 13.1, p.x - 4.2, g + 12, p.z - 12.9, DARK, false);
    W.box(p.x - 5.4, g + 6.6, p.z - 14, p.x - 3.2, g + 7.5, p.z - 12, BURNT, false);
    bus(W, p.x - 2, p.z + 3, true, 0, { burnt: true });
    barrelFire(W, p.x + 7, p.z + 11);
    barrelFire(W, p.x - 12, p.z - 12);
    for (const [ox, oz, l, ax] of [[0, -17, 12, 1], [17, 2, 10, 0], [-18, -9, 8, 0]]) {
      const hx = ax ? l / 2 : 0.15, hz = ax ? 0.15 : l / 2;
      W.box(p.x + ox - hx, g - 0.5, p.z + oz - hz, p.x + ox + hx, g + 2.7, p.z + oz + hz, 0x5a5796);
    }
    billboard(W, p.x + 15, p.z + 12, false, 'SCRAP', 'PARTS · WRECKS · NO REFUNDS', 0xffb52e, 6.5, 8, 3.8);
    W.pad(p.x - 6, p.z + 14);
    W.lootSpots.push({ x: p.x + 3.5, y: g + 5.4, z: p.z }, { x: p.x - 6, y: g, z: p.z - 1 }, { x: p.x + 12, y: g + 5.4, z: p.z - 13 }, { x: p.x + 9, y: g, z: p.z + 10 }, { x: p.x - 13, y: g, z: p.z + 5 });
  }

  // --- THE RUINS: shelled housing block
  {
    const p = P('THE RUINS');
    ruin(W, p.x - 8, p.z - 7, 17, 11, 6.5);
    ruin(W, p.x + 9, p.z + 8, 16, 10, 5.5);
    for (const [ox, oz] of [[10, -10], [-12, 9], [-1, 2], [15, -3]]) {
      const x = p.x + ox, z = p.z + oz, g = W.height(x, z), hh = 2 + R() * 4;
      if (!free(x, z, 1)) continue;
      W.box(x - 0.6, g - 1, z - 0.6, x + 0.6, g + hh, z + 0.6, 0xcfc8f0);
      W.box(x - 0.8, g + hh, z - 0.8, x + 0.8, g + hh + 0.3, z + 0.8, 0xbdb4e6, false);
    }
    car(W, p.x + 2, p.z - 14, true, 0, { burnt: true });
    car(W, p.x - 16, p.z + 2, false, 0, { burnt: true });
    barrelFire(W, p.x + 1, p.z + 1.5);
    billboard(W, p.x - 15, p.z - 15, true, 'NO EXIT', 'SECTOR SEALED BY ORDER', 0xff3050, 6, 8, 3.8);
    W.pad(p.x + 16, p.z + 15);
  }

  // --- BROKEN HIGHWAY: elevated deck with a collapsed span, ramps at both ends
  {
    const p = P('BROKEN HIGHWAY'), g = p.h, top = g + 6.4, z0 = p.z - 4.6, z1 = p.z + 4.6, x0 = p.x - 18, x1 = p.x + 18, gap = 2.6;
    W.box(x0, top - 0.7, z0, p.x - gap, top, z1, SLAB);
    W.box(p.x + gap, top - 0.7, z0, x1, top, z1, SLAB);
    W.box(p.x - gap, top - 1.5, z0 + 1.2, p.x - gap + 1.1, top - 0.75, z1 - 2.5, SLAB, false);
    W.box(p.x + gap - 0.9, top - 1.9, z0 + 2.4, p.x + gap, top - 0.75, z1 - 1, SLAB, false);
    for (const z of [z0, z1 - 0.3]) {
      W.box(x0, top, z, p.x - gap - 0.4, top + 0.95, z + 0.3, CONC);
      W.box(p.x + gap + 0.4, top, z, x1, top + 0.95, z + 0.3, CONC);
      W.glow(x0, top + 0.95, z + 0.08, p.x - gap - 0.4, top + 1.01, z + 0.22, 0xffb52e, 1.8);
      W.glow(p.x + gap + 0.4, top + 0.95, z + 0.08, x1, top + 1.01, z + 0.22, 0xffb52e, 1.8);
    }
    for (const ox of [-13, -6.5, 6.5, 13]) W.box(p.x + ox - 1, g - 1, p.z - 1.3, p.x + ox + 1, top - 0.7, p.z + 1.3, CONC);
    const n = 16, rise = 6.4 / n, run = 0.8;
    for (let i = 0; i < n; i++) {
      W.box(x0 - (n - i) * run, g - 1, z0, x0 - (n - 1 - i) * run, g + (i + 1) * rise, z1, i % 2 ? SLAB : 0x56528f);
      W.box(x1 + (n - 1 - i) * run, g - 1, z0, x1 + (n - i) * run, g + (i + 1) * rise, z1, i % 2 ? SLAB : 0x56528f);
    }
    car(W, p.x - 10, p.z - 1.6, true, W.pickC(PAINT), { base: top });
    car(W, p.x - 5, p.z + 2.2, true, 0, { base: top, burnt: true });
    bus(W, p.x + 11, p.z + 1.2, true, 0x3fa9ff, { base: top });
    W.box(p.x + 5.2, top, p.z - 3.6, p.x + 5.9, top + 1.1, p.z - 0.4, CONC);
    for (const ox of [-15, 15]) {
      W.box(p.x + ox - 0.1, top, z0 - 0.1, p.x + ox + 0.1, top + 4.4, z0 + 0.1, DARK, false);
      W.glow(p.x + ox - 0.3, top + 4.4, z0 - 0.3, p.x + ox + 0.3, top + 4.8, z0 + 0.3, 0x4ff3ff, 3);
    }
    // cover under the deck + ways up
    W.crate(p.x - 3, p.z + 9, 1.4, 0x7c5cff, true);
    W.crate(p.x + 4, p.z - 9, 1.5, 0xff4f8b, true);
    jersey(W, p.x - 9, p.z + 8, 4, true);
    jersey(W, p.x + 10, p.z - 8, 4, true);
    car(W, p.x + 2, p.z + 12, true, W.pickC(PAINT));
    W.pad(p.x - 1, p.z + 7.5, 19.5);
    W.pad(p.x + 1, p.z - 7.5, 19.5);
    billboard(W, p.x - 12, p.z - 14, true, 'ROUTE 9', 'BRIDGE OUT · TURN BACK', 0x4ff3ff, 7.5);
    W.lootSpots.push({ x: p.x - 14, y: top, z: p.z + 2 }, { x: p.x + 6.8, y: top, z: p.z - 2 }, { x: p.x + 15, y: top, z: p.z - 2 }, { x: p.x - 8, y: g, z: p.z }, { x: p.x + 9, y: g, z: p.z + 2 }, { x: p.x, y: g, z: p.z - 12 });
  }

  // --- BUNKER LINE: pillboxes, sandbag trench, tank traps
  {
    const p = P('BUNKER LINE');
    bunker(W, p.x - 8, p.z - 5, 8, 7, 's');
    bunker(W, p.x + 9, p.z + 2, 7, 8, 'n');
    for (const [ox, oz, l, ax] of [[-1, 6, 9, 1], [-6.5, 9.5, 6, 0], [4.5, 9.5, 6, 0], [-1, 13, 9, 1], [1, -11, 7, 1], [-15, 4, 5, 0], [15, -8, 6, 1]]) {
      if (free(p.x + ox, p.z + oz, 0.5)) sandbags(W, p.x + ox, p.z + oz, l, !!ax);
    }
    for (let i = 0; i < 7; i++) {
      const x = p.x - 14 + i * 4.6, z = p.z - 16 + (i % 2) * 1.6, g = W.height(x, z);
      if (g < 0.8 || !free(x, z, 1)) continue;
      W.box(x - 0.9, g - 0.3, z - 0.22, x + 0.9, g + 0.9, z + 0.22, STEEL);
      W.box(x - 0.22, g - 0.3, z - 0.9, x + 0.22, g + 0.9, z + 0.9, STEEL);
    }
    truck(W, p.x + 1, p.z - 5, true, 0x6a8f5a);
    barrelFire(W, p.x - 2, p.z + 9.5);
    W.watchtower(p.x - 14, p.z + 12);
    W.lootSpots.push({ x: p.x - 1, y: p.h, z: p.z + 9.5 }, { x: p.x + 5, y: p.h, z: p.z - 8 });
  }

  // --- RELAY STATION: comms mast, array panel, generator yard
  {
    const p = P('RELAY STATION'), g = p.h, H = 27;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) W.box(p.x + sx * 1.7 - 0.2, g - 1, p.z + sz * 1.7 - 0.2, p.x + sx * 1.7 + 0.2, g + H, p.z + sz * 1.7 + 0.2, STEEL);
    for (let y = 4; y < H; y += 4.5) W.box(p.x - 1.9, g + y, p.z - 1.9, p.x + 1.9, g + y + 0.2, p.z + 1.9, DARK, false);
    W.box(p.x - 0.12, g + H, p.z - 0.12, p.x + 0.12, g + H + 6, p.z + 0.12, DARK, false);
    W.box(p.x - 3.2, g + 15, p.z + 1.95, p.x + 3.2, g + 19, p.z + 2.3, DARK, false);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) W.glow(p.x - 2.8 + i * 1.45, g + 15.4 + j * 1.2, p.z + 2.3, p.x - 1.7 + i * 1.45, g + 16.2 + j * 1.2, p.z + 2.36, (i + j) % 3 ? 0x4ff3ff : 0xff4fd8, 2);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3050).multiplyScalar(3), toneMapped: false }));
    beacon.position.set(p.x, g + H + 6.2, p.z);
    W.scene.add(beacon);
    W.pulsers.push(beacon);
    W.beam(p.x, g + H + 6, p.z, 0xff3050, 0.5);
    W.building(p.x - 8, p.z + 6, 8, 7, 3.6, { doors: ['n', 'w'], wall: 0xd9f7ff, neon: 0x4ff3ff });
    for (const [ox, oz] of [[7, -6], [9.6, -6], [7, 5]]) {
      W.box(p.x + ox - 1.1, g - 0.3, p.z + oz - 0.9, p.x + ox + 1.1, g + 1.9, p.z + oz + 0.9, 0x2f6b4f);
      W.glow(p.x + ox - 1.13, g + 1.0, p.z + oz - 0.5, p.x + ox - 1.08, g + 1.5, p.z + oz + 0.5, 0x9dff3c, 2.2);
    }
    jersey(W, p.x - 2, p.z - 9, 6, true);
    sandbags(W, p.x + 11, p.z + 1, 5, false);
    W.pad(p.x + 4, p.z + 9, 18);
    billboard(W, p.x - 12, p.z - 9, false, 'RELAY 04', 'ALL SIGNALS MONITORED', 0x9dff3c, 6, 8, 3.8);
    W.lootSpots.push({ x: p.x, y: g, z: p.z - 4 }, { x: p.x + 8.3, y: g + 1.9, z: p.z - 6 }, { x: p.x + 5, y: g, z: p.z + 3 });
  }

  // --- CHECKPOINT: gate across the east road
  {
    const p = P('CHECKPOINT'), g = p.h;
    for (const s of [-1, 1]) W.box(p.x - 0.6, g - 1, p.z + s * 5.4 - 0.6, p.x + 0.6, g + 5.6, p.z + s * 5.4 + 0.6, STEEL);
    W.box(p.x - 0.7, g + 5.6, p.z - 6.2, p.x + 0.7, g + 6.7, p.z + 6.2, DARK);
    W.glow(p.x - 0.72, g + 5.5, p.z - 4.6, p.x + 0.72, g + 5.6, p.z + 4.6, 0xff3050, 2.6);
    W.glow(p.x - 0.1, g + 0.95, p.z - 4.8, p.x + 0.1, g + 1.1, p.z - 0.6, 0xffe14a, 2.2);
    W.box(p.x - 0.12, g + 0.85, p.z - 4.8, p.x + 0.12, g + 1.2, p.z - 0.6, 0xf4efff);
    W.building(p.x - 5, p.z - 9.5, 5, 5, 3.2, { doors: ['s'], wall: 0xd9f7ff, neon: 0xff3050 });
    jersey(W, p.x - 7, p.z + 1.6, 4, false);
    jersey(W, p.x + 6, p.z - 1.6, 4, false);
    jersey(W, p.x + 3, p.z + 8, 5, true);
    sandbags(W, p.x - 3, p.z + 9, 5, true);
    bus(W, p.x + 8, p.z + 3.4, true, 0xffb52e);
    car(W, p.x - 10, p.z - 2.4, true, W.pickC(PAINT));
    barrelFire(W, p.x + 2.5, p.z - 8);
    W.lootSpots.push({ x: p.x + 2, y: g, z: p.z + 5 }, { x: p.x - 8, y: g, z: p.z + 5 });
  }

  // --- Neon Plaza dressing: signage, stalled traffic, a street fire
  {
    const signs = [
      [0, -51, 1, 'PRISMCORP', 'OWNING TOMORROW SINCE 2099', 0xff4fd8], [0, 51, 1, 'OBEY THE STORM', 'STAY INSIDE THE CIRCLE', 0xc26bff],
      [-51, 0, 0, 'VOLT COLA', 'DRINK IT · DROP IN · REPEAT', 0x4ff3ff], [51, 0, 0, 'WINNERS ONLY', 'ONE LEAVES · NINETEEN STAY', 0xffe14a],
    ];
    for (const [x, z, ax, t, s, c] of signs) billboard(W, x, z, !!ax, t, s, c, 8.5, 10, 4.8);
    for (const [x, z, ax, kind] of [[-12, 20, 1, 'bus'], [20, -8, 0, 'car'], [-21, -10, 0, 'burnt'], [8, 21, 1, 'car'], [-42, -24, 0, 'truck'], [40, 26, 0, 'burnt']]) {
      if (!free(x, z, kind === 'bus' || kind === 'truck' ? 5.4 : 2.8)) continue;
      if (kind === 'bus') bus(W, x, z, !!ax, 0xff4f8b);
      else if (kind === 'truck') truck(W, x, z, !!ax, 0x3fa9ff);
      else car(W, x, z, !!ax, W.pickC(PAINT), { burnt: kind === 'burnt' });
    }
  }

  // --- toxic sink: marker pylons on the crater rim
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3, x = W.sink.x + Math.cos(a) * (W.sink.r + 1.5), z = W.sink.z + Math.sin(a) * (W.sink.r + 1.5), g = W.height(x, z);
    W.box(x - 0.18, g - 0.5, z - 0.18, x + 0.18, g + 2.2, z + 0.18, DARK);
    W.glow(x - 0.26, g + 2.2, z - 0.26, x + 0.26, g + 2.7, z + 0.26, 0x9dff3c, 3);
  }
  W.lootSpots.push({ x: W.sink.x + W.sink.r + 3, y: W.height(W.sink.x + W.sink.r + 3, W.sink.z), z: W.sink.z });
}

// ------------------------------------------------------------ backdrop + ambient life
export function buildAtmosphere(W) {
  const R = W.R, scene = W.scene;

  // megacity skyline ringing the horizon
  const N = 170, d = new THREE.Object3D();
  const sky = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.ShaderMaterial({
      fog: false,
      uniforms: { haze: { value: scene.fog.color }, time: W.uT },
      vertexShader: `varying vec3 vW; varying vec3 vL; varying float vSeed;
        void main(){ vL=position; vec4 w=modelMatrix*instanceMatrix*vec4(position,1.0); vW=w.xyz;
          vSeed=instanceMatrix[3].x*0.013+instanceMatrix[3].z*0.007; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform vec3 haze; uniform float time; varying vec3 vW; varying vec3 vL; varying float vSeed;
        float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        void main(){ float hz=smoothstep(230.0,0.0,vW.y);
          vec3 col=mix(vec3(0.17,0.11,0.38),haze,0.3+0.5*hz);
          float u=(abs(vL.x)>0.499?vW.z:vW.x)/7.0, v=vW.y/9.0; vec2 cell=floor(vec2(u,v)), f=fract(vec2(u,v));
          float lit=step(0.7,hash(cell+vSeed))*step(0.2,f.x)*step(f.x,0.8)*step(0.25,f.y)*step(f.y,0.72)*step(abs(vL.y),0.497);
          lit*=0.75+0.25*sin(time*0.7+hash(cell)*40.0);
          vec3 wc=mix(vec3(1.0,0.72,0.38),vec3(0.38,0.95,1.0),step(0.55,hash(cell.yx+3.1)));
          col+=wc*lit*(1.0-hz*0.55)*1.25;
          gl_FragColor=vec4(col,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
    N
  );
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU + R() * 0.05, r = 430 + R() * 250, tall = R() < 0.12;
    const w = 16 + R() * 34, h = tall ? 230 + R() * 150 : 45 + R() * R() * 190;
    d.position.set(Math.cos(a) * r, h / 2 - 6, Math.sin(a) * r);
    d.rotation.y = -a + (R() - 0.5) * 0.5;
    d.scale.set(w, h, w * (0.6 + R() * 0.7));
    d.updateMatrix();
    sky.setMatrixAt(i, d.matrix);
  }
  sky.frustumCulled = false;
  scene.add(sky);

  // sweeping searchlights
  W.searchlights = [];
  const coneG = new THREE.CylinderGeometry(11, 0.5, 300, 20, 1, true).translate(0, 150, 0);
  const lights = W.pois.filter((p) => /WATCH|REACTOR|RELAY/.test(p.name)).map((p) => [p.x, p.h + (p.name === 'THE REACTOR' ? 20 : 12), p.z]);
  lights.forEach(([x, y, z], i) => {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { col: { value: new THREE.Color(i % 2 ? 0xbfe8ff : 0xffd2f0) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 col; varying vec2 vUv; void main(){ float a=pow(1.0-vUv.y,1.5)*0.2; gl_FragColor=vec4(col*a,1.0); }`,
    });
    const pivot = new THREE.Group(), cone = new THREE.Mesh(coneG, mat);
    cone.rotation.z = 0.55 + R() * 0.3;
    cone.frustumCulled = false;
    pivot.add(cone);
    pivot.position.set(x, y, z);
    pivot.rotation.y = R() * TAU;
    scene.add(pivot);
    W.searchlights.push({ pivot, cone, sp: (0.12 + R() * 0.12) * (i % 2 ? 1 : -1), tilt: cone.rotation.z, ph: R() * 6 });
  });

  // patrol drones
  W.drones = [];
  const bodyG = new THREE.OctahedronGeometry(0.6, 0).scale(1.5, 0.35, 1.5);
  const bodyM = new THREE.MeshStandardMaterial({ color: 0x23204d, roughness: 0.5, flatShading: true });
  const eyeG = new THREE.SphereGeometry(0.16, 8, 6);
  W.pois.slice(0, 11).forEach((p, i) => {
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(bodyG, bodyM));
    const eye = new THREE.Mesh(eyeG, new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 2 ? 0xff3050 : 0x4ff3ff).multiplyScalar(3.2), toneMapped: false }));
    eye.position.y = -0.22;
    grp.add(eye);
    scene.add(grp);
    W.drones.push({ grp, cx: p.x, cz: p.z, r: p.r * (0.5 + R() * 0.5), y: p.h + 15 + R() * 10, sp: (0.18 + R() * 0.2) * (i % 2 ? 1 : -1), ph: R() * TAU });
  });
  W.emberT = 0;
}

export function updateAtmosphere(W, dt, cam, t) {
  for (const s of W.searchlights) {
    s.pivot.rotation.y += s.sp * dt;
    s.cone.rotation.z = s.tilt + Math.sin(t * 0.23 + s.ph) * 0.18;
  }
  for (const d of W.drones) {
    const a = t * d.sp + d.ph;
    d.grp.position.set(d.cx + Math.cos(a) * d.r, d.y + Math.sin(t * 0.9 + d.ph) * 1.2, d.cz + Math.sin(a) * d.r);
    d.grp.rotation.y = -a + (d.sp > 0 ? 0 : Math.PI);
  }
  const k = 1 + 0.5 * Math.sin(t * 4);
  for (const m of W.pulsers) m.scale.setScalar(k);
  // embers from burning wrecks near the camera
  const fx = G.fx;
  if (!fx || dt <= 0) return;
  W.emberT += dt;
  if (W.emberT < 0.05) return;
  W.emberT = 0;
  for (const f of W.fires) {
    const dx = f.x - cam.position.x, dz = f.z - cam.position.z;
    if (dx * dx + dz * dz > 85 * 85) continue;
    const j = () => (Math.random() - 0.5) * 0.9;
    fx.spawn(f.x + j(), f.y, f.z + j(), j() * 0.8, 1.6 + Math.random() * 2.4, j() * 0.8, 2.6, 0.95, 0.25, 0.07 + Math.random() * 0.08, 0.8 + Math.random() * 0.9, -0.5, 0.5);
    if (Math.random() < 0.5) fx.spawn(f.x + j() * 0.5, f.y - 0.1, f.z + j() * 0.5, 0, 0.9, 0, 0.9, 0.3, 0.08, 0.7 + Math.random() * 0.4, 0.5, -0.4, 0.4);
  }
}
