import { WORLD } from './config.js';

export const STEP = 0.55; // max ledge height a character walks up without jumping
const _a = [];
const _b = [];
const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);

// World collision: a heightfield plus a set of static axis-aligned boxes.
export class Physics {
  constructor(heightFn) {
    this.h = heightFn;
    this.boxes = [];
    this.grid = new Map();
    this.cs = 8;
    this.stamp = 0;
    this.hit = { d: 0, nx: 0, ny: 1, nz: 0, kind: 0 }; // kind: 0 none, 1 box, 2 ground
  }

  addBox(x0, y0, z0, x1, y1, z1) {
    const b = { x0, y0, z0, x1, y1, z1, s: 0 };
    this.boxes.push(b);
    const cs = this.cs;
    for (let i = Math.floor(x0 / cs); i <= Math.floor(x1 / cs); i++)
      for (let j = Math.floor(z0 / cs); j <= Math.floor(z1 / cs); j++) {
        const k = i * 4096 + j;
        let a = this.grid.get(k);
        if (!a) this.grid.set(k, (a = []));
        a.push(b);
      }
    return b;
  }

  near(x, z, r, out) {
    out.length = 0;
    const cs = this.cs, st = ++this.stamp;
    const i1 = Math.floor((x + r) / cs), j1 = Math.floor((z + r) / cs);
    for (let i = Math.floor((x - r) / cs); i <= i1; i++)
      for (let j = Math.floor((z - r) / cs); j <= j1; j++) {
        const a = this.grid.get(i * 4096 + j);
        if (!a) continue;
        for (let k = 0; k < a.length; k++) {
          const b = a[k];
          if (b.s !== st) {
            b.s = st;
            out.push(b);
          }
        }
      }
    return out;
  }

  // Highest walkable surface under (x,z) that is no more than STEP above `feet`.
  ground(x, z, feet, list) {
    let g = this.h(x, z);
    const L = list || this.near(x, z, 0.6, _b);
    for (let i = 0; i < L.length; i++) {
      const b = L[i];
      if (b.y1 > g && b.y1 <= feet + STEP + 0.01 && x >= b.x0 - 0.1 && x <= b.x1 + 0.1 && z >= b.z0 - 0.1 && z <= b.z1 + 0.1) g = b.y1;
    }
    return g;
  }

  // Is a standing volume (circle r, from y to y+h) intersecting any box?
  blocked(x, y, z, r, h) {
    const L = this.near(x, z, r + 0.1, _b);
    for (let i = 0; i < L.length; i++) {
      const b = L[i];
      if (b.y1 <= y + 0.05 || b.y0 >= y + h) continue;
      const cx = clampN(x, b.x0, b.x1), cz = clampN(z, b.z0, b.z1);
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  pointSolid(x, y, z) {
    if (y < this.h(x, z)) return true;
    const L = this.near(x, z, 0.1, _b);
    for (let i = 0; i < L.length; i++) {
      const b = L[i];
      if (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1 && z > b.z0 && z < b.z1) return true;
    }
    return false;
  }

  // Move a character (pos, vel, r, h, onGround, grav) with slide + step-up collision.
  move(c, dt) {
    const p = c.pos, v = c.vel;
    c.hitWall = false;
    c.landed = 0;
    const dist = Math.hypot(v.x, v.z) * dt;
    const n = Math.max(1, Math.ceil(dist / 0.3));
    const sdt = dt / n;
    for (let s = 0; s < n; s++) {
      p.x += v.x * sdt;
      p.z += v.z * sdt;
      const L = this.near(p.x, p.z, c.r + 0.3, _a);
      for (let it = 0; it < 2; it++) {
        for (let i = 0; i < L.length; i++) {
          const b = L[i];
          if (b.y1 <= p.y + STEP || b.y0 >= p.y + c.h) continue;
          const cx = clampN(p.x, b.x0, b.x1), cz = clampN(p.z, b.z0, b.z1);
          const dx = p.x - cx, dz = p.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= c.r * c.r) continue;
          if (d2 > 1e-9) {
            const d = Math.sqrt(d2), push = (c.r - d) / d;
            p.x += dx * push;
            p.z += dz * push;
          } else {
            const l = p.x - b.x0, r = b.x1 - p.x, f = p.z - b.z0, k = b.z1 - p.z;
            const m = Math.min(l, r, f, k);
            if (m === l) p.x = b.x0 - c.r;
            else if (m === r) p.x = b.x1 + c.r;
            else if (m === f) p.z = b.z0 - c.r;
            else p.z = b.z1 + c.r;
          }
          c.hitWall = true;
        }
      }
    }
    const rr = Math.hypot(p.x, p.z);
    if (rr > WORLD.boundR) {
      p.x *= WORLD.boundR / rr;
      p.z *= WORLD.boundR / rr;
      c.hitWall = true;
    }

    // vertical
    v.y -= (c.grav ?? 24) * dt;
    if (v.y < -55) v.y = -55;
    const oldY = p.y;
    p.y += v.y * dt;
    const L = this.near(p.x, p.z, c.r + 0.3, _a);
    if (v.y > 0) {
      const rr2 = c.r * c.r * 0.8;
      for (let i = 0; i < L.length; i++) {
        const b = L[i];
        if (b.y0 < oldY + c.h - 0.02 || b.y0 >= p.y + c.h) continue;
        const cx = clampN(p.x, b.x0, b.x1), cz = clampN(p.z, b.z0, b.z1);
        const dx = p.x - cx, dz = p.z - cz;
        if (dx * dx + dz * dz < rr2) {
          p.y = b.y0 - c.h;
          v.y = 0;
        }
      }
    }
    const g = this.ground(p.x, p.z, Math.max(oldY, p.y), L);
    if (p.y <= g) {
      if (!c.onGround) c.landed = -v.y;
      p.y = g;
      v.y = 0;
      c.onGround = true;
    } else if (c.onGround && v.y <= 0 && p.y - g < STEP + 0.1) {
      p.y = g;
      v.y = 0;
    } else {
      c.onGround = false;
    }
  }

  // Ray against boxes + terrain. Returns the shared hit record (copy what you need).
  ray(ox, oy, oz, dx, dy, dz, max) {
    const H = this.hit;
    let best = max;
    H.kind = 0;
    H.nx = 0;
    H.ny = 1;
    H.nz = 0;
    if (dx === 0) dx = 1e-9;
    if (dy === 0) dy = 1e-9;
    if (dz === 0) dz = 1e-9;
    const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
    const B = this.boxes;
    for (let i = 0, n = B.length; i < n; i++) {
      const b = B[i];
      let t1 = (b.x0 - ox) * ix, t2 = (b.x1 - ox) * ix;
      let tn = t1 < t2 ? t1 : t2, tf = t1 < t2 ? t2 : t1, ax = 0;
      if (tn >= best || tf < 0) continue;
      t1 = (b.z0 - oz) * iz;
      t2 = (b.z1 - oz) * iz;
      let a = t1 < t2 ? t1 : t2, f = t1 < t2 ? t2 : t1;
      if (a > tn) {
        tn = a;
        ax = 2;
      }
      if (f < tf) tf = f;
      if (tn > tf || tn >= best) continue;
      t1 = (b.y0 - oy) * iy;
      t2 = (b.y1 - oy) * iy;
      a = t1 < t2 ? t1 : t2;
      f = t1 < t2 ? t2 : t1;
      if (a > tn) {
        tn = a;
        ax = 1;
      }
      if (f < tf) tf = f;
      if (tn > tf || tf < 0 || tn < 0 || tn >= best) continue;
      best = tn;
      H.kind = 1;
      H.nx = ax === 0 ? (dx > 0 ? -1 : 1) : 0;
      H.ny = ax === 1 ? (dy > 0 ? -1 : 1) : 0;
      H.nz = ax === 2 ? (dz > 0 ? -1 : 1) : 0;
    }
    // terrain: adaptive march, then bisect
    let t = 0, prev = 0;
    const h = this.h;
    while (t < best) {
      const y = oy + dy * t;
      const hh = h(ox + dx * t, oz + dz * t);
      if (y < hh) {
        let lo = prev, hi = t;
        for (let k = 0; k < 6; k++) {
          const mid = (lo + hi) * 0.5;
          if (oy + dy * mid < h(ox + dx * mid, oz + dz * mid)) hi = mid;
          else lo = mid;
        }
        best = hi;
        H.kind = 2;
        H.nx = 0;
        H.ny = 1;
        H.nz = 0;
        break;
      }
      prev = t;
      t += clampN((y - hh) * 0.5, 0.5, 8);
    }
    H.d = best;
    return H;
  }

  // Clear line of sight between two points?
  los(ax, ay, az, bx, by, bz) {
    let dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    dx /= d;
    dy /= d;
    dz /= d;
    return this.ray(ax, ay, az, dx, dy, dz, d - 0.2).kind === 0;
  }
}
