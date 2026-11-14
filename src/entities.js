import * as THREE from 'three';
import { G } from './ctx.js';
import { WEAPONS, RARITY } from './config.js';

export const HEAD_K = 0.875; // head centre as a fraction of character height
export const HEAD_R = 0.27;
const BODY_HALF = 0.36;

export const mkWeapon = (id, rarity = 0) => {
  const def = WEAPONS[id];
  return { id, def, rarity, ammo: def.mag, reserve: def.reserve };
};

export class Character {
  constructor(name, isPlayer) {
    this.name = name;
    this.isPlayer = isPlayer;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.r = 0.4;
    this.h = 1.8;
    this.grav = 24;
    this.onGround = false;
    this.health = 100;
    this.shield = 0;
    this.alive = true;
    this.kills = 0;
    this.deaths = 0;
    this.weapons = [];
    this.cur = 0;
    this.cool = 0;
    this.reloadT = 0;
    this.spawnProt = 0;
    this.lastHitBy = null;
    this.lastHitT = -99;
    this.pingT = -99;
    this.color = 0x6ef3ff;
    this.tracer = 0xffc27a;
  }
  get weapon() {
    return this.weapons[this.cur];
  }
  center(out) {
    return out.set(this.pos.x, this.pos.y + this.h * 0.55, this.pos.z);
  }
}

// ------------------------------------------------------------ shooting
const _r = new THREE.Vector3(), _u = new THREE.Vector3(), _sd = new THREE.Vector3(), _end = new THREE.Vector3(), _n = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
let _head = false;

export function spreadDir(dir, spread, out) {
  _r.crossVectors(dir, UP).normalize();
  _u.crossVectors(_r, dir);
  const a = Math.random() * Math.PI * 2, r = spread * Math.sqrt(Math.random());
  return out.copy(dir).addScaledVector(_r, Math.cos(a) * r).addScaledVector(_u, Math.sin(a) * r).normalize();
}

// Ray vs character (head sphere + body box). Returns distance or -1; sets _head.
function rayChar(o, d, c) {
  const px = c.pos.x - o.x, pz = c.pos.z - o.z;
  // quick reject using distance from the character axis to the ray (in XZ + rough Y)
  const along = px * d.x + (c.pos.y + c.h * 0.5 - o.y) * d.y + pz * d.z;
  if (along < -1) return -1;
  let tHead = -1, tBody = -1;
  const hy = c.pos.y + c.h * HEAD_K - o.y;
  const tca = px * d.x + hy * d.y + pz * d.z;
  if (tca > 0) {
    const d2 = px * px + hy * hy + pz * pz - tca * tca;
    if (d2 < HEAD_R * HEAD_R) tHead = tca - Math.sqrt(HEAD_R * HEAD_R - d2);
  }
  const ix = 1 / (d.x || 1e-9), iy = 1 / (d.y || 1e-9), iz = 1 / (d.z || 1e-9);
  let t1 = (px - BODY_HALF) * ix, t2 = (px + BODY_HALF) * ix;
  let tn = Math.min(t1, t2), tf = Math.max(t1, t2);
  t1 = (pz - BODY_HALF) * iz;
  t2 = (pz + BODY_HALF) * iz;
  tn = Math.max(tn, Math.min(t1, t2));
  tf = Math.min(tf, Math.max(t1, t2));
  t1 = (c.pos.y - o.y) * iy;
  t2 = (c.pos.y + c.h * 0.76 - o.y) * iy;
  tn = Math.max(tn, Math.min(t1, t2));
  tf = Math.min(tf, Math.max(t1, t2));
  if (tn <= tf && tf > 0) tBody = Math.max(tn, 0.001);
  if (tHead > 0 && (tBody < 0 || tHead < tBody + 0.2)) {
    _head = true;
    return tHead;
  }
  _head = false;
  return tBody;
}

function hitscan(shooter, o, d, w, visualOrigin) {
  const M = G.match, def = w.def;
  const H = G.phys.ray(o.x, o.y, o.z, d.x, d.y, d.z, 380);
  let best = H.d, victim = null, head = false;
  const kind = H.kind;
  _n.set(H.nx, H.ny, H.nz);
  for (const c of M.chars) {
    if (c === shooter || !c.alive) continue;
    const t = rayChar(o, d, c);
    if (t > 0 && t < best) {
      best = t;
      victim = c;
      head = _head;
    }
  }
  _end.copy(o).addScaledVector(d, best);
  G.fx.tracer(visualOrigin || o, _end, shooter.tracer, shooter.isPlayer ? 0.034 : 0.028);
  if (victim) {
    const [fs, fe, fm] = def.falloff;
    const fall = best <= fs ? 1 : best >= fe ? fm : 1 + ((fm - 1) * (best - fs)) / (fe - fs);
    let dmg = def.dmg * RARITY[w.rarity].mult * fall * (head ? def.head : 1);
    if (!shooter.isPlayer) dmg *= (victim.isPlayer ? M.diff.dmg : M.botDmg) * (def.scope ? 0.7 : 1);
    G.fx.burst(_end, victim.color, { n: head ? 9 : 5, speed: 4, life: 0.35, size: 0.09, grav: 6 });
    M.damage(victim, dmg, shooter, { head, point: _end, weapon: w });
  } else if (kind) {
    G.fx.impact(_end, _n, kind === 2 ? 0xc9ffe0 : 0xffd9a0, !!def.scope);
  }
  return victim;
}

// Fire the shooter's current weapon once. Returns true if anything was hit.
export function fire(shooter, o, d, spread, visualOrigin) {
  const w = shooter.weapon, def = w.def, M = G.match;
  w.ammo--;
  shooter.cool = 60 / def.rpm;
  shooter.pingT = M.time;
  G.audio.play(w.id, shooter.isPlayer ? null : shooter.pos, shooter.isPlayer ? 1 : 0.85);
  if (def.kind === 'rocket') {
    M.spawnRocket(shooter, o, spreadDir(d, spread, _sd), w);
    return false;
  }
  let any = false;
  const n = def.pellets || 1;
  for (let i = 0; i < n; i++) if (hitscan(shooter, o, spreadDir(d, spread, _sd), w, visualOrigin)) any = true;
  return any;
}
