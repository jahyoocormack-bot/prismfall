import * as THREE from 'three';
import { G } from './ctx.js';
import { RARITY } from './config.js';
import { clamp, damp, rand, angDiff, gauss, pick } from './utils.js';
import { Character, mkWeapon, fire } from './entities.js';
import { buildBot, buildGun } from './models.js';
import { POIS } from './world.js';

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3(), _m = new THREE.Vector3();
const _pt = {};
const barBg = new THREE.SpriteMaterial({ color: 0x0a0820, opacity: 0.65, transparent: true, fog: false });

export class Bot extends Character {
  constructor(name, pal) {
    super(name, false);
    this.pal = pal;
    this.color = pal.a;
    this.tracer = pal.g;
    this.model = buildBot(pal);
    G.scene.add(this.model.root);

    this.bar = new THREE.Group();
    this.bar.position.y = 2.25;
    const bg = new THREE.Sprite(barBg);
    bg.scale.set(1.08, 0.2, 1);
    this.hpS = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x7dff6a, fog: false }));
    this.hpS.center.set(0, 0.5);
    this.hpS.position.set(-0.5, -0.035, 0);
    this.hpS.scale.set(1, 0.075, 1);
    this.shS = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x4fb8ff, fog: false }));
    this.shS.center.set(0, 0.5);
    this.shS.position.set(-0.5, 0.05, 0);
    this.shS.scale.set(1, 0.055, 1);
    bg.renderOrder = 8;
    this.hpS.renderOrder = this.shS.renderOrder = 9;
    this.bar.add(bg, this.hpS, this.shS);
    this.bar.visible = false;
    this.model.root.add(this.bar);

    this.goal = new THREE.Vector3();
    this.barT = 0;
    this.flash = 0;
    this.walk = Math.random() * 6;
    this.respawnT = 0;
    this.resetAI();
  }

  resetAI() {
    this.think = Math.random() * 0.3;
    this.target = null;
    this.canSee = false;
    this.lostT = 0;
    this.goalT = 0;
    this.strafe = 1;
    this.strafeT = 0;
    this.ex = 0;
    this.ey = 0;
    this.errT = 0;
    this.react = 0;
    this.burst = 4;
    this.pause = 0;
    this.stuckT = 0;
    this.stuckN = 0;
    this.sx = 0;
    this.sz = 0;
    this.avoidT = 0;
    this.avoidDir = 1;
    this.jumpT = rand(1, 4);
  }

  setWeapon(id, rarity) {
    const w = mkWeapon(id, rarity);
    w.reserve = Infinity;
    this.weapons = [w];
    this.cur = 0;
    if (this.gunMesh) {
      this.gunMesh.traverse((o) => o.isMesh && o.geometry.dispose());
      this.gunMesh.removeFromParent();
    }
    this.gunMesh = buildGun(id, { base: 0x3a3f5c, accent: 0xe8ecf5, glow: RARITY[rarity].color }, { mat: this.model.mat });
    this.model.gunHolder.add(this.gunMesh);
  }

  spawn(pt, shield = 0) {
    this.pos.set(pt.x, pt.y, pt.z);
    this.vel.set(0, 0, 0);
    this.health = 100;
    this.shield = shield;
    this.alive = true;
    this.reloadT = 0;
    this.cool = 0.5;
    this.weapon.ammo = this.weapon.def.mag;
    this.yaw = Math.random() * 6.28;
    this.model.root.visible = true;
    this.resetAI();
    this.sx = pt.x;
    this.sz = pt.z;
    this.newGoal();
    this.animate(0);
  }

  onDeath() {
    this.model.root.visible = false;
    this.target = null;
  }

  onDamaged(by) {
    if (by && by !== this && by.alive && (!this.target || !this.canSee)) {
      this.target = by;
      this.lostT = 0;
      this.react = Math.min(this.react, 0.25);
    }
  }

  dispose() {
    this.model.root.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
    this.model.mat.dispose();
    this.hpS.material.dispose();
    this.shS.material.dispose();
    this.model.root.removeFromParent();
  }

  newGoal() {
    const M = G.match, z = M.zone, W = G.world, P = G.player;
    let cx = z.x, cz = z.z, r = Math.max(4, z.r * 0.85);
    if (z.tr < z.r - 1 && Math.random() < 0.65) {
      cx = z.tx;
      cz = z.tz;
      r = Math.max(4, z.tr * 0.9);
    }
    const roll = Math.random();
    if (M.mode === 'royale' && P.alive && !P.dropping && roll < 0.3) {
      cx = P.pos.x;
      cz = P.pos.z;
      r = 38;
    } else if (roll < 0.7) {
      const p = pick(POIS);
      if (Math.hypot(p.x - z.x, p.z - z.z) < z.r * 0.8) {
        cx = p.x;
        cz = p.z;
        r = p.r * 0.8;
      }
    }
    W.freePoint(cx, cz, r, 0, _pt);
    if (Math.hypot(_pt.x - z.x, _pt.z - z.z) > z.r - 4) W.freePoint(z.x, z.z, Math.max(3, z.r * 0.7), 0, _pt);
    this.goal.set(_pt.x, _pt.y, _pt.z);
    this.goalT = rand(8, 16);
  }

  perceive() {
    const M = G.match, D = M.diff;
    if (M.time < M.grace) {
      this.target = null;
      this.canSee = false;
      return;
    }
    const ex = this.pos.x, ey = this.pos.y + 1.5, ez = this.pos.z;
    const cands = [];
    for (const c of M.chars) {
      if (c === this || !c.alive || (c.isPlayer && (c.dropping || M.time < c.safeUntil))) continue;
      const d = Math.hypot(c.pos.x - ex, c.pos.z - ez);
      if (d > D.sight) continue;
      let s = d;
      if (c === this.target) s *= 0.6;
      if (c === this.lastHitBy && M.time - this.lastHitT < 4) s *= 0.5;
      if (c.isPlayer) s *= 0.85;
      cands.push([s, c]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    let best = null;
    for (let i = 0; i < Math.min(3, cands.length); i++) {
      const c = cands[i][1];
      if (G.phys.los(ex, ey, ez, c.pos.x, c.pos.y + c.h * 0.7, c.pos.z)) {
        best = c;
        break;
      }
    }
    if (best) {
      if (best !== this.target || !this.canSee) this.react = Math.max(this.react, D.react * rand(0.7, 1.3));
      this.target = best;
      this.canSee = true;
      this.lostT = 0;
    } else if (this.target) {
      this.canSee = false;
      this.lostT += 0.26;
      if (this.lostT > 1.6 || !this.target.alive) {
        if (this.target.alive) {
          this.goal.copy(this.target.pos);
          this.goalT = 7;
        }
        this.target = null;
      }
    }
  }

  tryFire(dt, dist) {
    const w = this.weapon, def = w.def;
    if (this.reloadT > 0 || this.cool > 0) return;
    if (w.ammo <= 0) {
      this.reloadT = def.reload * 1.15;
      return;
    }
    if (this.pause > 0) {
      this.pause -= dt;
      return;
    }
    if (def.kind === 'rocket' && dist < 7) return;
    const cp = Math.cos(this.pitch);
    _d.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    _o.set(this.pos.x, this.pos.y + 1.45, this.pos.z);
    _m.copy(_o).addScaledVector(_d, 0.9);
    _m.y -= 0.12;
    fire(this, _o, _d, def.pellets ? def.hip : def.hip * 0.4, _m);
    G.fx.burst(_m, this.tracer, { n: 3, speed: 2.5, life: 0.09, size: 0.32, grav: 0, dir: _d, cone: 0.3 });
    if (def.auto) {
      if (--this.burst <= 0) {
        this.burst = 3 + ((Math.random() * 6) | 0);
        this.pause = rand(0.25, 0.7);
      }
    } else this.cool = Math.max(this.cool, rand(0.32, 0.6));
  }

  update(dt) {
    if (!this.alive) return;
    const M = G.match, D = M.diff, w = this.weapon, def = w.def;
    this.cool -= dt;
    this.spawnProt -= dt;
    this.react -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) w.ammo = def.mag;
    }
    this.think -= dt;
    if (this.think <= 0) {
      this.think = 0.2 + Math.random() * 0.12;
      this.perceive();
    }

    const z = M.zone;
    const zx = z.x - this.pos.x, zz = z.z - this.pos.z, zd = Math.hypot(zx, zz) || 0.01;
    const outside = zd > z.r - 5;
    let dx = 0, dz = 0, speed = 5.5 * def.speed, dist = 0;
    const tg = this.target && this.target.alive ? this.target : null;
    if (tg) {
      _t.set(tg.pos.x - this.pos.x, 0, tg.pos.z - this.pos.z);
      dist = _t.length() || 0.01;
      _t.divideScalar(dist);
      const R = def.botRange;
      const radial = dist > R * 1.25 ? 1 : dist < R * 0.55 ? -0.8 : 0.15;
      this.strafeT -= dt;
      if (this.strafeT <= 0) {
        this.strafeT = rand(0.7, 2.2);
        this.strafe = Math.random() < 0.2 ? 0 : Math.random() < 0.5 ? -1 : 1;
      }
      dx = _t.x * radial - _t.z * this.strafe * 0.9;
      dz = _t.z * radial + _t.x * this.strafe * 0.9;
      if (outside) {
        dx += (zx / zd) * 1.6;
        dz += (zz / zd) * 1.6;
      }
    } else {
      this.goalT -= dt;
      const gx = this.goal.x - this.pos.x, gz = this.goal.z - this.pos.z, gd = Math.hypot(gx, gz);
      const goalOut = Math.hypot(this.goal.x - z.x, this.goal.z - z.z) > z.r - 3;
      if (gd < 2.5 || this.goalT <= 0 || (outside && goalOut)) this.newGoal();
      else {
        dx = gx / gd;
        dz = gz / gd;
      }
      if (outside) speed *= 1.15;
    }
    const l = Math.hypot(dx, dz);
    if (l > 1) {
      dx /= l;
      dz /= l;
    }

    // unstick: sidestep + hop when we stop making progress
    this.stuckT += dt;
    if (this.stuckT > 0.5) {
      const moved = Math.hypot(this.pos.x - this.sx, this.pos.z - this.sz);
      if (l > 0.3 && moved < speed * 0.15) {
        this.avoidT = rand(0.5, 1.0);
        this.avoidDir = Math.random() < 0.5 ? -1 : 1;
        if (this.onGround) this.vel.y = 8;
        if (++this.stuckN > 3 && !tg) {
          this.newGoal();
          this.stuckN = 0;
        }
      } else this.stuckN = 0;
      this.stuckT = 0;
      this.sx = this.pos.x;
      this.sz = this.pos.z;
    }
    if (this.avoidT > 0) {
      this.avoidT -= dt;
      const a = this.avoidDir * 1.25, c = Math.cos(a), s = Math.sin(a), nx = dx * c - dz * s;
      dz = dx * s + dz * c;
      dx = nx;
    }
    const k = this.onGround ? 9 : 1.5;
    this.vel.x = damp(this.vel.x, dx * speed, k, dt);
    this.vel.z = damp(this.vel.z, dz * speed, k, dt);
    if (tg && this.onGround) {
      this.jumpT -= dt;
      if (this.jumpT <= 0) {
        this.jumpT = rand(1.5, 5);
        if (Math.random() < 0.5) this.vel.y = 7.8;
      }
    }
    G.phys.move(this, dt);

    // aim + shoot
    if (tg) {
      this.errT -= dt;
      if (this.errT <= 0) {
        this.errT = rand(0.25, 0.5);
        const tv = Math.hypot(tg.vel.x, tg.vel.z);
        const e = D.aimErr * (1 + tv * 0.09) * (def.scope ? 0.5 : 1);
        this.ex = gauss() * e;
        this.ey = gauss() * e * 0.6;
      }
      const tx = tg.pos.x - this.pos.x, tz = tg.pos.z - this.pos.z;
      const ty = tg.pos.y + tg.h * (def.kind === 'rocket' ? 0.1 : 0.62) - (this.pos.y + 1.45);
      const aimYaw = Math.atan2(-tx, -tz) + this.ex;
      const aimPitch = Math.atan2(ty, Math.hypot(tx, tz)) + this.ey;
      const dy = angDiff(this.yaw, aimYaw), maxT = D.turn * dt;
      this.yaw += clamp(dy, -maxT, maxT);
      this.pitch = damp(this.pitch, aimPitch, 10, dt);
      if (this.canSee && this.react <= 0 && Math.abs(dy) < 0.15 && dist < def.botRange * 3.2 + 10) this.tryFire(dt, dist);
    } else if (l > 0.1) {
      const dy = angDiff(this.yaw, Math.atan2(-dx, -dz));
      this.yaw += clamp(dy, -5 * dt, 5 * dt);
      this.pitch = damp(this.pitch, 0, 5, dt);
    }
    this.animate(dt);
  }

  animate(dt) {
    const m = this.model, hs = Math.hypot(this.vel.x, this.vel.z), mv = Math.min(1, hs / 4);
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw;
    this.walk += hs * dt * 2.3;
    const sw = Math.sin(this.walk) * mv * 0.75;
    m.legL.rotation.x = this.onGround ? sw : 0.5;
    m.legR.rotation.x = this.onGround ? -sw : -0.3;
    m.upper.rotation.x = this.pitch * 0.75;
    m.upper.position.y = 0.8 + Math.abs(Math.cos(this.walk)) * 0.035 * mv;
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 7);
      m.mat.emissive.setScalar(this.flash * 0.85);
    }
    if (this.barT > 0) {
      this.barT -= dt;
      this.bar.visible = true;
      const hp = clamp(this.health / 100, 0.001, 1);
      this.hpS.scale.x = hp;
      this.hpS.material.color.setHex(hp > 0.5 ? 0x7dff6a : hp > 0.25 ? 0xffd24a : 0xff4f5e);
      this.shS.visible = this.shield > 0;
      this.shS.scale.x = clamp(this.shield / 100, 0.001, 1);
    } else this.bar.visible = false;
    if (this.spawnProt > 0) m.root.visible = Math.sin(G.time * 40) > -0.3;
    else if (!m.root.visible) m.root.visible = true;
  }
}
