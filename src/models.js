import * as THREE from 'three';
import { RARITY } from './config.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();

// Matrix from position / euler rotation / scale.
export const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));

// Matrix that stretches a unit Y-aligned shape (height 1, centered) between two points.
export const segM = (ax, ay, az, bx, by, bz, r) => {
  _d.set(bx - ax, by - ay, bz - az);
  const len = _d.length();
  _q.setFromUnitVectors(_up, _d.normalize());
  return new THREE.Matrix4().compose(_v.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, _s.set(r, len, r));
};

// Merge geometries into one non-indexed geometry with baked transforms and per-part vertex colors.
export function mergeGeoms(list) {
  let n = 0;
  const parts = list.map((o) => {
    const g = o.g.index ? o.g.toNonIndexed() : o.g.clone();
    if (o.m) g.applyMatrix4(o.m);
    n += g.attributes.position.count;
    return [g, o.c];
  });
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3);
  let k = 0;
  for (const [g, c] of parts) {
    const cnt = g.attributes.position.count;
    P.set(g.attributes.position.array, k * 3);
    N.set(g.attributes.normal.array, k * 3);
    for (let i = 0; i < cnt; i++) {
      C[(k + i) * 3] = c ? c.r : 1;
      C[(k + i) * 3 + 1] = c ? c.g : 1;
      C[(k + i) * 3 + 2] = c ? c.b : 1;
    }
    k += cnt;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  return out;
}

export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cylZ: new THREE.CylinderGeometry(1, 1, 1, 12).rotateX(Math.PI / 2),
  cylY: new THREE.CylinderGeometry(1, 1, 1, 12),
  sphere: new THREE.SphereGeometry(1, 16, 12),
  ico: new THREE.IcosahedronGeometry(1, 0),
  octa: new THREE.OctahedronGeometry(1, 0),
};

// Cel-shading ramp shared by characters, weapons and pickups.
const ramp = new THREE.DataTexture(new Uint8Array([80, 150, 215, 255]), 4, 1, THREE.RedFormat);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
ramp.needsUpdate = true;
export const toonMat = () => new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp });
export const SHARED_TOON = toonMat();
export const GLOW_MAT = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
export const AURA_MAT = new THREE.MeshBasicMaterial({
  vertexColors: true, toneMapped: false, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
});

// Collects colored primitives and bakes them into at most two meshes (lit + emissive).
export class Parts {
  constructor() {
    this.lit = [];
    this.glow = [];
  }
  add(g, color, m, glow = 0) {
    const c = new THREE.Color(color);
    if (glow) c.multiplyScalar(glow);
    (glow ? this.glow : this.lit).push({ g, m, c });
    return this;
  }
  box(sx, sy, sz, x, y, z, color, o = {}) {
    return this.add(GEO.box, color, M(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, sx, sy, sz), o.glow || 0);
  }
  cylZ(r, len, x, y, z, color, o = {}) {
    return this.add(GEO.cylZ, color, M(x, y, z, 0, 0, 0, r, r, len), o.glow || 0);
  }
  cylY(r, h, x, y, z, color, o = {}) {
    return this.add(GEO.cylY, color, M(x, y, z, 0, 0, 0, r, h, r), o.glow || 0);
  }
  ball(rx, ry, rz, x, y, z, color, o = {}) {
    return this.add(GEO.sphere, color, M(x, y, z, 0, 0, 0, rx, ry, rz), o.glow || 0);
  }
  limb(ax, ay, az, bx, by, bz, r, color) {
    return this.add(GEO.cylY, color, segM(ax, ay, az, bx, by, bz, r));
  }
  build(litMat = SHARED_TOON, shadows = true) {
    const grp = new THREE.Group();
    if (this.lit.length) {
      const m = new THREE.Mesh(mergeGeoms(this.lit), litMat);
      m.castShadow = shadows;
      grp.add(m);
      grp.userData.lit = m;
    }
    if (this.glow.length) {
      const m = new THREE.Mesh(mergeGeoms(this.glow), GLOW_MAT);
      grp.add(m);
      grp.userData.glow = m;
    }
    return grp;
  }
}

export function disposeGroup(grp) {
  grp.traverse((o) => {
    if (o.isMesh && o.geometry && !Object.values(GEO).includes(o.geometry)) o.geometry.dispose();
  });
  grp.removeFromParent();
}

// ---------------------------------------------------------------- weapons
// [shape, role, a, b, c, x, y, z, rx]  shape: b = box(sx,sy,sz)  c = cylinder along barrel (radius, length)
// roles: b base, a accent, d dark, g glow.  Barrel points down -Z, origin sits at the grip.
const GUNS = {
  carbine: {
    muzzle: [0, 0.035, -0.64], sight: 0.108, fore: [0, -0.03, -0.36],
    parts: [
      ['b', 'b', 0.07, 0.1, 0.44, 0, 0.02, -0.08], ['c', 'd', 0.017, 0.26, 0, 0, 0.035, -0.45],
      ['b', 'a', 0.062, 0.075, 0.2, 0, 0.03, -0.37], ['b', 'g', 0.074, 0.014, 0.3, 0, 0.05, -0.1],
      ['b', 'a', 0.045, 0.17, 0.075, 0, -0.105, -0.13, 0.15], ['b', 'd', 0.045, 0.12, 0.055, 0, -0.075, 0.09, -0.25],
      ['b', 'b', 0.05, 0.085, 0.2, 0, 0.005, 0.22], ['b', 'd', 0.022, 0.045, 0.07, 0, 0.09, -0.08],
      ['b', 'g', 0.012, 0.012, 0.012, 0, 0.108, -0.08], ['b', 'd', 0.032, 0.032, 0.05, 0, 0.035, -0.6],
      ['b', 'a', 0.052, 0.02, 0.1, 0, 0.055, 0.22],
    ],
  },
  smg: {
    muzzle: [0, 0.035, -0.36], sight: 0.103, fore: [0, -0.04, -0.2],
    parts: [
      ['b', 'b', 0.065, 0.11, 0.3, 0, 0.02, -0.05], ['c', 'd', 0.02, 0.14, 0, 0, 0.035, -0.27],
      ['b', 'a', 0.05, 0.05, 0.12, 0, 0.035, -0.22], ['b', 'g', 0.069, 0.02, 0.16, 0, 0.03, -0.05],
      ['b', 'a', 0.04, 0.2, 0.05, 0, -0.12, -0.06], ['b', 'd', 0.045, 0.11, 0.05, 0, -0.07, 0.08, -0.2],
      ['b', 'd', 0.02, 0.02, 0.16, 0, 0.05, 0.17], ['b', 'd', 0.02, 0.08, 0.02, 0, 0.02, 0.25],
      ['b', 'd', 0.02, 0.035, 0.05, 0, 0.088, -0.04], ['b', 'a', 0.03, 0.03, 0.03, 0, 0.035, -0.345],
    ],
  },
  shotgun: {
    muzzle: [0, 0.045, -0.64], sight: 0.09, fore: [0, -0.03, -0.36],
    parts: [
      ['b', 'b', 0.075, 0.09, 0.4, 0, 0.02, -0.05], ['c', 'd', 0.026, 0.42, 0, 0, 0.045, -0.42],
      ['c', 'd', 0.02, 0.34, 0, 0, 0.0, -0.38], ['b', 'a', 0.07, 0.06, 0.16, 0, 0.0, -0.36],
      ['b', 'g', 0.079, 0.012, 0.2, 0, 0.04, -0.02], ['b', 'a', 0.05, 0.09, 0.24, 0, -0.01, 0.25, 0.12],
      ['b', 'd', 0.045, 0.11, 0.05, 0, -0.07, 0.1, -0.3], ['b', 'g', 0.012, 0.012, 0.012, 0, 0.078, -0.6],
    ],
  },
  sniper: {
    muzzle: [0, 0.035, -0.91], sight: 0.105, fore: [0, -0.03, -0.42],
    parts: [
      ['b', 'b', 0.06, 0.085, 0.55, 0, 0.02, -0.1], ['c', 'd', 0.014, 0.5, 0, 0, 0.035, -0.6],
      ['b', 'a', 0.05, 0.06, 0.25, 0, 0.02, -0.42], ['c', 'd', 0.032, 0.26, 0, 0, 0.105, -0.08],
      ['c', 'g', 0.027, 0.012, 0, 0, 0.105, -0.212], ['b', 'd', 0.02, 0.04, 0.03, 0, 0.07, -0.02],
      ['b', 'd', 0.02, 0.04, 0.03, 0, 0.07, -0.14], ['b', 'g', 0.064, 0.012, 0.3, 0, 0.04, -0.1],
      ['b', 'a', 0.04, 0.1, 0.07, 0, -0.07, -0.1], ['b', 'd', 0.045, 0.11, 0.05, 0, -0.07, 0.1, -0.3],
      ['b', 'b', 0.05, 0.1, 0.26, 0, 0.0, 0.3], ['b', 'a', 0.052, 0.03, 0.2, 0, 0.06, 0.3],
      ['b', 'd', 0.04, 0.04, 0.07, 0, 0.035, -0.87],
    ],
  },
  launcher: {
    muzzle: [0, 0.05, -0.52], sight: 0.17, fore: [0, -0.04, -0.2],
    parts: [
      ['c', 'b', 0.055, 0.56, 0, 0, 0.05, -0.19], ['c', 'a', 0.07, 0.12, 0, 0, 0.05, -0.44],
      ['c', 'a', 0.064, 0.08, 0, 0, 0.05, 0.1], ['c', 'g', 0.059, 0.03, 0, 0, 0.05, -0.26],
      ['c', 'g', 0.059, 0.03, 0, 0, 0.05, -0.06], ['b', 'd', 0.045, 0.12, 0.05, 0, -0.06, 0.02, -0.2],
      ['b', 'd', 0.04, 0.1, 0.04, 0, -0.05, -0.2], ['b', 'd', 0.02, 0.06, 0.08, 0, 0.14, -0.1],
      ['b', 'g', 0.012, 0.012, 0.012, 0, 0.17, -0.1],
    ],
  },
  sidearm: {
    muzzle: [0, 0.05, -0.2], sight: 0.098, fore: null,
    parts: [
      ['b', 'b', 0.05, 0.07, 0.24, 0, 0.03, -0.06], ['b', 'a', 0.052, 0.03, 0.24, 0, 0.07, -0.06],
      ['b', 'g', 0.054, 0.01, 0.12, 0, 0.05, -0.06], ['b', 'd', 0.045, 0.13, 0.055, 0, -0.055, 0.03, -0.2],
      ['b', 'd', 0.015, 0.02, 0.02, 0, 0.092, 0.04], ['b', 'd', 0.015, 0.02, 0.015, 0, 0.092, -0.16],
    ],
  },
};
export const gunSpec = (id) => GUNS[id];

export function buildGun(id, colors, o = {}) {
  const spec = GUNS[id];
  const P = new Parts();
  const col = { b: colors.base, a: colors.accent, d: 0x1b1d2e, g: colors.glow };
  for (const p of spec.parts) {
    const [shape, role, a, b, c, x, y, z, rx] = p;
    const opt = { rx: rx || 0, glow: role === 'g' ? o.glowK ?? 2.4 : 0 };
    if (shape === 'b') P.box(a, b, c, x, y, z, col[role], opt);
    else P.cylZ(a, b, x, y, z, col[role], opt);
  }
  if (o.hands) {
    // stylised gloves + forearms for the first-person view
    const glove = 0x23263d, cuff = colors.accent;
    P.box(0.062, 0.075, 0.085, 0.004, -0.085, 0.095, glove, { rx: -0.25 });
    P.limb(0.02, -0.11, 0.13, 0.13, -0.26, 0.5, 0.042, glove);
    P.limb(0.045, -0.145, 0.21, 0.07, -0.18, 0.29, 0.05, cuff);
    if (spec.fore) {
      const [fx, fy, fz] = spec.fore;
      P.box(0.07, 0.06, 0.09, fx - 0.012, fy - 0.01, fz, glove);
      P.limb(fx - 0.03, fy - 0.03, fz + 0.03, fx - 0.3, fy - 0.2, fz + 0.5, 0.042, glove);
      P.limb(fx - 0.085, fy - 0.065, fz + 0.12, fx - 0.13, fy - 0.1, fz + 0.21, 0.05, cuff);
    } else {
      P.box(0.06, 0.07, 0.08, -0.03, -0.1, 0.085, glove, { rx: -0.25 });
      P.limb(-0.05, -0.12, 0.12, -0.26, -0.28, 0.5, 0.042, glove);
    }
  }
  const group = P.build(o.mat || SHARED_TOON, !o.hands);
  group.userData.muzzle = new THREE.Vector3(...spec.muzzle);
  group.userData.sight = spec.sight;
  return group;
}

// ---------------------------------------------------------------- characters
export function buildBot(pal) {
  const mat = toonMat();
  const dark = 0x1b1d2e, skin = 0xf4f1ff;
  const root = new THREE.Group();

  const leg = () => {
    const P = new Parts();
    P.add(new THREE.CapsuleGeometry(0.095, 0.42, 3, 8), pal.b, M(0, -0.36, 0));
    P.box(0.17, 0.11, 0.28, 0, -0.745, -0.04, pal.a);
    return P.build(mat);
  };
  const legL = leg(), legR = leg();
  legL.position.set(-0.14, 0.8, 0);
  legR.position.set(0.14, 0.8, 0);

  const U = new Parts();
  U.add(new THREE.CapsuleGeometry(0.25, 0.14, 4, 12), pal.a, M(0, 0.3, 0, 0, 0, 0, 1, 1, 0.82));
  U.cylY(0.245, 0.07, 0, 0.05, 0, dark);
  U.box(0.16, 0.05, 0.03, 0, 0.42, -0.2, pal.g, { glow: 2.2 });
  U.box(0.3, 0.32, 0.16, 0, 0.34, 0.25, pal.b);
  U.box(0.12, 0.05, 0.02, 0, 0.42, 0.335, pal.g, { glow: 2.2 });
  U.ball(0.25, 0.24, 0.25, 0, 0.78, 0, skin);
  U.box(0.36, 0.13, 0.2, 0, 0.79, -0.15, dark);
  U.box(0.28, 0.05, 0.03, 0, 0.79, -0.255, pal.g, { glow: 2.6 });
  U.cylY(0.012, 0.2, 0.13, 1.08, 0, dark);
  U.ball(0.04, 0.04, 0.04, 0.13, 1.2, 0, pal.g, { glow: 2.6 });
  U.ball(0.1, 0.1, 0.1, -0.31, 0.5, 0, pal.b);
  U.ball(0.1, 0.1, 0.1, 0.31, 0.5, 0, pal.b);
  U.limb(0.31, 0.5, 0, 0.13, 0.36, -0.36, 0.07, pal.a);
  U.ball(0.085, 0.085, 0.085, 0.13, 0.36, -0.37, dark);
  U.limb(-0.31, 0.5, 0, 0.06, 0.39, -0.62, 0.07, pal.a);
  U.ball(0.085, 0.085, 0.085, 0.06, 0.39, -0.63, dark);
  const upper = U.build(mat);
  upper.position.set(0, 0.8, 0);

  const gunHolder = new THREE.Group();
  gunHolder.position.set(0.13, 0.41, -0.36);
  gunHolder.scale.setScalar(1.3);
  upper.add(gunHolder);

  root.add(legL, legR, upper);
  return { root, upper, legL, legR, gunHolder, mat };
}

// ---------------------------------------------------------------- pickups
const auraCache = new Map();
export function auraMesh(colorHex, k = 1.3) {
  let g = auraCache.get(colorHex);
  if (!g) {
    const c = new THREE.Color(colorHex).multiplyScalar(k);
    g = mergeGeoms([
      { g: new THREE.RingGeometry(0.5, 0.78, 28).rotateX(-Math.PI / 2), m: M(0, 0.07, 0), c },
      { g: new THREE.CylinderGeometry(0.08, 0.08, 5, 8, 1, true), m: M(0, 2.5, 0), c },
    ]);
    const P = g.attributes.position, C = g.attributes.color;
    for (let i = 0; i < P.count; i++) {
      const y = P.getY(i);
      const f = y < 0.2 ? 1 : Math.pow(1 - y / 5, 2) * 0.7;
      C.setXYZ(i, C.getX(i) * f, C.getY(i) * f, C.getZ(i) * f);
    }
    auraCache.set(colorHex, g);
  }
  return new THREE.Mesh(g, AURA_MAT);
}

const tplCache = new Map();
export const PICKUP_COLORS = { ammo: 0xb6ff4a, med: 0xff5f8f, shield: 0x4fb8ff, nade: 0xff9a3c };
export function pickupModel(kind, weaponId, rarity) {
  const key = kind === 'weapon' ? weaponId + rarity : kind;
  let tpl = tplCache.get(key);
  if (!tpl) {
    if (kind === 'weapon') {
      tpl = buildGun(weaponId, { base: 0x3a3f5c, accent: 0xe8ecf5, glow: RARITY[rarity].color });
      tpl.scale.setScalar(1.7);
    } else {
      const P = new Parts();
      if (kind === 'ammo') {
        P.box(0.5, 0.3, 0.34, 0, 0, 0, 0x2f6b4f).box(0.52, 0.06, 0.36, 0, 0.13, 0, 0x1b1d2e);
        P.box(0.51, 0.07, 0.35, 0, -0.02, 0, PICKUP_COLORS.ammo, { glow: 2 });
      } else if (kind === 'med') {
        P.box(0.44, 0.44, 0.2, 0, 0, 0, 0xf4f1ff);
        P.box(0.3, 0.1, 0.22, 0, 0, 0, PICKUP_COLORS.med, { glow: 2.2 }).box(0.1, 0.3, 0.22, 0, 0, 0, PICKUP_COLORS.med, { glow: 2.2 });
      } else if (kind === 'shield') {
        P.add(GEO.octa, PICKUP_COLORS.shield, M(0, 0, 0, 0, 0, 0, 0.2, 0.32, 0.2), 2.2);
        P.cylY(0.26, 0.05, 0, -0.3, 0, 0x1b1d2e).cylY(0.26, 0.05, 0, 0.3, 0, 0x1b1d2e);
      } else {
        P.ball(0.17, 0.17, 0.17, 0, 0, 0, 0x2a2d45).cylY(0.175, 0.05, 0, 0, 0, PICKUP_COLORS.nade, { glow: 2.4 });
        P.cylY(0.05, 0.1, 0, 0.19, 0, 0x8a8fa8);
      }
      tpl = P.build();
    }
    tplCache.set(key, tpl);
  }
  return tpl.clone();
}

// soft radial star used for muzzle flashes
export function flashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  const rg = g.createRadialGradient(0, 0, 0, 0, 0, 60);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.25, 'rgba(255,230,170,0.85)');
  rg.addColorStop(1, 'rgba(255,140,60,0)');
  g.fillStyle = rg;
  for (let i = 0; i < 6; i++) {
    g.rotate(Math.PI / 3);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(-9, 22);
    g.lineTo(0, i % 2 ? 62 : 44);
    g.lineTo(9, 22);
    g.closePath();
    g.fill();
  }
  g.beginPath();
  g.arc(0, 0, 22, 0, 7);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
