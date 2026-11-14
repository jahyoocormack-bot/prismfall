import * as THREE from 'three';
import { G } from './ctx.js';
import { WEAPONS, WEAPON_IDS, RARITY, MODES, STORM_PHASES, BOT_NAMES, BOT_PALETTES, DIFF } from './config.js';
import { rand, lerp, weighted, clamp } from './utils.js';
import { Bot } from './bots.js';
import { mkWeapon } from './entities.js';
import { pickupModel, auraMesh, PICKUP_COLORS, GEO } from './models.js';

const _v = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3(), _d = new THREE.Vector3();
const _pt = {};
const FRAG = { def: { name: 'Frag Grenade' } };
const rocketMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa24a).multiplyScalar(2.6), toneMapped: false });
const nadeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5a3c).multiplyScalar(2.2), toneMapped: false });

const rollWeapon = () => weighted(WEAPON_IDS, (id) => WEAPONS[id].loot);
const rollRarity = (boost = 0) => weighted([0, 1, 2, 3], (r) => [50, 30, 15, 5][r] + (r > 0 ? boost : 0));

export class Match {
  constructor(mode) {
    this.mode = mode;
    this.cfg = MODES[mode];
    this.diffKey = G.profile.settings.difficulty in DIFF ? G.profile.settings.difficulty : 'normal';
    this.diff = DIFF[this.diffKey];
    this.time = 0;
    this.ended = false;
    this.endT = 0;
    this.result = null;
    this.chars = [];
    this.bots = [];
    this.pickups = [];
    this.rockets = [];
    this.nades = [];
    this.stats = { shots: 0, hits: 0, dmg: 0, heads: 0 };
    this.streak = 0;
    this.multi = 0;
    this.lastKillT = -99;
    this.firstBlood = false;
    this.grace = mode === 'royale' ? 7 : 1.5;
    this.total = this.cfg.bots + 1;
    this.zone = { x: 0, z: 0, r: 240, fx: 0, fz: 0, fr: 240, tx: 0, tz: 0, tr: 240, phase: -1, t: 0, shrinking: false, dmg: 1, tick: 1, done: false };
    this.respawnT = 0;
    this.botDmg = 0.55; // bot-vs-bot damage multiplier (governed in Royale to pace the match)
    this.paceT = 0;
  }

  // ------------------------------------------------------------ setup
  start() {
    const P = G.player, W = G.world;
    P.resetState();
    P.kills = P.deaths = 0;
    this.chars.push(P);
    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    const taken = [];
    for (let i = 0; i < this.cfg.bots; i++) {
      const b = new Bot(names[i], BOT_PALETTES[i % BOT_PALETTES.length]);
      this.bots.push(b);
      this.chars.push(b);
    }

    if (this.mode === 'royale') {
      for (const b of this.bots) {
        let pt;
        for (let t = 0; t < 12; t++) {
          pt = W.freePoint(0, 0, 160, 0, {});
          if (!taken.some((q) => Math.hypot(q.x - pt.x, q.z - pt.z) < 30)) break;
        }
        taken.push(pt);
        b.setWeapon(rollWeapon(), rollRarity());
        b.spawn(pt, Math.random() < 0.4 ? 50 : 0);
      }
      for (const s of W.lootSpots) this.rollLoot(s);
      const a = Math.random() * Math.PI * 2;
      P.pos.set(Math.cos(a) * 125, 105, Math.sin(a) * 125);
      P.yaw = Math.atan2(P.pos.x, P.pos.z);
      P.pitch = -0.55;
      P.dropping = true;
      P.grav = 0;
      P.onGround = false;
      P.give('sidearm', 0);
      P.equip(0, true);
      this.nextPhase();
      G.hud.tip('GLIDE WITH <b>WASD</b> · LOOK DOWN TO DIVE');
    } else {
      this.zone.r = this.zone.tr = this.zone.fr = 66;
      this.zone.dmg = 8;
      this.zone.done = true;
      W.setStorm(0, 0, 66, true);
      const ids = ['carbine', 'smg', 'shotgun', 'sniper', 'carbine', 'smg', 'launcher'];
      this.bots.forEach((b, i) => {
        b.setWeapon(ids[i % ids.length], 1);
        b.spawn(this.spawnPoint(), 0);
        b.spawnProt = 1.5;
      });
      this.spawnPlayerDM(true);
      // respawning arena pickups
      const spots = W.lootSpots.filter((s) => Math.hypot(s.x, s.z) < 58);
      const kinds = ['weapon', 'med', 'shield', 'ammo', 'weapon', 'nade', 'shield', 'ammo', 'med', 'weapon'];
      spots.slice(0, 22).forEach((s, i) => {
        const kind = kinds[i % kinds.length];
        this.spawnPickup(kind, s.x, s.y, s.z, kind === 'weapon' ? { id: rollWeapon(), rarity: 2 + (i % 2), respawn: 22 } : { respawn: 16 });
      });
    }
    G.hud.reset(this);
  }

  spawnPoint() {
    const W = G.world;
    let best = null, bd = -1;
    for (let t = 0; t < 10; t++) {
      const pt = W.freePoint(0, 0, 56, 10, {});
      let md = 1e9;
      for (const c of this.chars) if (c.alive) md = Math.min(md, Math.hypot(c.pos.x - pt.x, c.pos.z - pt.z));
      if (md > bd) {
        bd = md;
        best = pt;
      }
    }
    return best;
  }

  spawnPlayerDM(first) {
    const P = G.player, pt = this.spawnPoint();
    const k = P.kills, d = P.deaths;
    P.resetState();
    P.kills = k;
    P.deaths = d;
    P.pos.set(pt.x, pt.y, pt.z);
    P.yaw = Math.atan2(pt.x, pt.z);
    P.pitch = 0;
    P.shield = 50;
    P.nades = 1;
    P.give('carbine', 1);
    P.give('shotgun', 1);
    P.give('sidearm', 1);
    P.equip(0, true);
    P.spawnProt = first ? 1.5 : 2.5;
    G.camera.rotation.z = 0;
    G.hud.respawn(null);
  }

  rollLoot(s) {
    const y = G.phys.ground(s.x, s.z, s.y + 0.4), r = Math.random();
    if (r < 0.5) {
      this.spawnPickup('weapon', s.x, y, s.z, { id: rollWeapon(), rarity: rollRarity() });
      if (Math.random() < 0.6) this.spawnPickup('ammo', s.x + 1.1, G.phys.ground(s.x + 1.1, s.z + 0.4, y + 0.4), s.z + 0.4);
    } else if (r < 0.64) this.spawnPickup('ammo', s.x, y, s.z);
    else if (r < 0.79) this.spawnPickup('shield', s.x, y, s.z);
    else if (r < 0.92) this.spawnPickup('med', s.x, y, s.z);
    else this.spawnPickup('nade', s.x, y, s.z);
  }

  spawnPickup(kind, x, y, z, o = {}) {
    const grp = new THREE.Group();
    const w = kind === 'weapon' ? o.w || mkWeapon(o.id, o.rarity) : null;
    const model = pickupModel(kind, w?.id, w?.rarity);
    model.position.y = 0.8;
    const aura = auraMesh(w ? RARITY[w.rarity].color : PICKUP_COLORS[kind]);
    grp.add(model, aura);
    grp.position.set(x, y, z);
    G.scene.add(grp);
    const p = { kind, w, pos: grp.position, grp, model, aura, t: Math.random() * 6, alive: true, respawn: o.respawn || 0, dead: 0, o };
    this.pickups.push(p);
    return p;
  }

  // ------------------------------------------------------------ storm
  nextPhase() {
    const z = this.zone;
    z.phase++;
    const ph = STORM_PHASES[z.phase];
    if (!ph) {
      z.done = true;
      return;
    }
    z.fx = z.x;
    z.fz = z.z;
    z.fr = z.r;
    z.tx = z.x;
    z.tz = z.z;
    const maxOff = Math.max(0, z.r - ph.r) * 0.8;
    for (let t = 0; t < 20; t++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * maxOff;
      const x = z.x + Math.cos(a) * d, zz = z.z + Math.sin(a) * d;
      if (Math.hypot(x, zz) < Math.max(20, 150 - ph.r * 0.6) && G.world.height(x, zz) > 0.5) {
        z.tx = x;
        z.tz = zz;
        break;
      }
    }
    z.tr = ph.r;
    z.t = ph.wait;
    z.shrinking = false;
    z.dmg = ph.dmg;
  }

  updateZone(dt) {
    const z = this.zone;
    if (!z.done) {
      const ph = STORM_PHASES[z.phase];
      z.t -= dt;
      if (!z.shrinking) {
        if (z.t <= 0) {
          z.shrinking = true;
          z.t = ph.shrink;
          G.hud.announce('STORM CLOSING', 'Get inside the circle', '#c26bff');
          G.audio.play('storm');
        }
      } else {
        const k = clamp(1 - z.t / ph.shrink, 0, 1);
        z.x = lerp(z.fx, z.tx, k);
        z.z = lerp(z.fz, z.tz, k);
        z.r = lerp(z.fr, z.tr, k);
        if (z.t <= 0) this.nextPhase();
      }
      G.world.setStorm(z.x, z.z, z.r, true);
    }
    z.tick -= dt;
    if (z.tick <= 0) {
      z.tick = 1;
      for (const c of this.chars) {
        if (c.alive && !(c.isPlayer && c.dropping) && Math.hypot(c.pos.x - z.x, c.pos.z - z.z) > z.r) this.damage(c, z.dmg, null, { storm: true });
      }
    }
  }

  // ------------------------------------------------------------ damage + eliminations
  damage(t, amount, by, info = {}) {
    if (!t.alive || this.ended || t.spawnProt > 0) return;
    if (t.isPlayer && t.dropping) return;
    const P = G.player;
    let sd = 0;
    if (!info.storm) {
      sd = Math.min(t.shield, amount);
      t.shield -= sd;
    }
    t.health -= amount - sd;
    if (by) {
      t.lastHitBy = by;
      t.lastHitT = this.time;
    }
    if (by === P && t !== P) {
      this.stats.dmg += amount;
      if (info.head) this.stats.heads++;
      G.hud.hitmarker(info.head);
      G.hud.number(t, info.point || t.center(_c), amount, info.head, sd > 0);
      G.audio.play(info.head ? 'headshot' : sd > 0 ? 'shieldHit' : 'hit');
      t.barT = 2.5;
    }
    if (t === P) {
      G.hud.hurt(by && by !== P ? by.pos : null, amount, info.storm);
      P.shake = Math.min(0.05, P.shake + amount * 0.0012);
      G.audio.play(info.storm ? 'stormTick' : 'hurt');
      if (sd > 0 && t.shield <= 0) G.audio.play('shieldBreak');
    } else {
      t.flash = 1;
      t.onDamaged(by);
    }
    if (t.health <= 0) this.kill(t, by, info);
  }

  kill(t, by, info) {
    const P = G.player;
    t.alive = false;
    t.health = 0;
    t.deaths++;
    if (by && by !== t) by.kills++;
    const how = info.storm ? 'storm' : info.weapon ? info.weapon.def.name : '';
    G.hud.feed(by && by !== t ? by.name : info.storm ? 'The Storm' : t.name, t.name, how, by === P, t === P, !!info.head);
    G.fx.elimination(t.pos, t.color);
    if (!t.isPlayer) {
      G.audio.play('pickup', t.pos, 0.6);
      const w = t.weapon, jx = () => rand(-0.9, 0.9);
      const gy = (x, z) => G.phys.ground(x, z, t.pos.y + 0.5);
      if (this.mode === 'royale') {
        let x = t.pos.x + jx(), z = t.pos.z + jx();
        const nw = mkWeapon(w.id, w.rarity);
        nw.reserve = Math.ceil(nw.def.reserve / 2);
        this.spawnPickup('weapon', x, gy(x, z), z, { w: nw });
        for (const [kind, ch] of [['ammo', 0.6], ['shield', 0.35], ['med', 0.25], ['nade', 0.12]]) {
          if (Math.random() > ch) continue;
          x = t.pos.x + jx() * 1.6;
          z = t.pos.z + jx() * 1.6;
          this.spawnPickup(kind, x, gy(x, z), z);
        }
      } else if (Math.random() < 0.6) {
        const x = t.pos.x + jx(), z = t.pos.z + jx();
        this.spawnPickup(Math.random() < 0.5 ? 'ammo' : Math.random() < 0.5 ? 'med' : 'shield', x, gy(x, z), z, { temp: 20 });
      }
      t.onDeath();
      t.respawnT = 3;
    } else {
      this.streak = 0;
      this.multi = 0;
      G.audio.play('defeat', null, 0.6);
      if (this.mode === 'deathmatch') {
        this.respawnT = 3.5;
        G.hud.respawn(by && by !== P ? by.name : info.storm ? 'the storm' : 'yourself');
      }
    }
    if (by === P && t !== P) {
      this.streak++;
      this.multi = this.time - this.lastKillT < 4.5 ? this.multi + 1 : 1;
      this.lastKillT = this.time;
      G.audio.play('kill');
      const big = this.multi === 2 ? 'DOUBLE KILL' : this.multi === 3 ? 'TRIPLE KILL' : this.multi >= 4 ? 'RAMPAGE' : this.streak === 5 ? 'KILLING SPREE' : this.streak === 10 ? 'UNSTOPPABLE' : !this.firstBlood ? 'FIRST BLOOD' : null;
      G.hud.elim(t.name, !!info.head, big);
      if (big) G.audio.play('announce');
    }
    if (by && by !== t) this.firstBlood = true;
    this.checkEnd(by);
  }

  aliveCount() {
    let n = 0;
    for (const c of this.chars) if (c.alive) n++;
    return n;
  }

  ranking() {
    return this.chars.slice().sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  }

  checkEnd(by) {
    const P = G.player;
    if (this.mode === 'royale') {
      const alive = this.aliveCount();
      if (!P.alive) this.end(false, alive + 1);
      else if (alive === 1) this.end(true, 1);
    } else if (by && by.kills >= this.cfg.target) {
      this.end(by === P, this.ranking().indexOf(P) + 1);
    }
  }

  end(win, place) {
    if (this.ended) return;
    this.ended = true;
    this.endT = 2.8;
    G.timeScale = 0.25;
    const P = G.player, k = P.kills, mult = { easy: 0.8, normal: 1, hard: 1.3 }[this.diffKey];
    let xp, coins;
    if (this.mode === 'royale') {
      xp = 60 + k * 45 + (this.total - place) * 12 + (win ? 400 : 0);
      coins = 10 + k * 8 + Math.floor((this.total - place) * 1.5) + (win ? 120 : 0);
    } else {
      xp = 60 + k * 30 + (win ? 250 : place <= 3 ? 100 : 0);
      coins = 10 + k * 4 + (win ? 80 : place <= 3 ? 30 : 0);
    }
    this.result = {
      mode: this.mode, win, place, total: this.total, kills: k, deaths: P.deaths, dmg: Math.round(this.stats.dmg),
      acc: this.stats.shots ? Math.round((this.stats.hits / this.stats.shots) * 100) : 0, heads: this.stats.heads,
      time: this.time, xp: Math.round(xp * mult), coins: Math.round(coins * mult),
    };
    if (win) {
      G.hud.announce(this.mode === 'royale' ? 'PRISM CHAMPION' : 'MATCH WON', this.mode === 'royale' ? 'Last one standing' : 'Top of the board', '#ffe14a', 4);
      G.audio.play('victory');
      for (let i = 0; i < 6; i++) {
        _v.set(P.pos.x + rand(-10, 10), P.pos.y + rand(5, 12), P.pos.z + rand(-10, 10));
        G.fx.burst(_v, [0xff4fd8, 0x6ef3ff, 0xffe14a, 0x9dff3c][i % 4], { n: 60, speed: 12, life: 1.4, size: 0.3, grav: 5, drag: 1.5, k: 2.2 });
      }
    } else {
      G.hud.announce(this.mode === 'royale' ? 'ELIMINATED' : 'DEFEAT', this.mode === 'royale' ? `You placed #${place} of ${this.total}` : `You finished #${place}`, '#ff4f6e', 4);
    }
  }

  // ------------------------------------------------------------ projectiles
  spawnRocket(by, o, d, w) {
    const mesh = new THREE.Mesh(GEO.cylZ, rocketMat);
    mesh.scale.set(0.08, 0.08, 0.55);
    G.scene.add(mesh);
    const r = { pos: o.clone().addScaledVector(d, 0.7), dir: d.clone(), by, w, life: 5, mesh };
    mesh.position.copy(r.pos);
    mesh.lookAt(_v.copy(r.pos).add(r.dir));
    this.rockets.push(r);
  }

  throwNade(by) {
    G.camera.getWorldDirection(_d);
    const mesh = new THREE.Mesh(GEO.sphere, nadeMat);
    mesh.scale.setScalar(0.11);
    G.scene.add(mesh);
    const pos = G.camera.position.clone().addScaledVector(_d, 0.6);
    this.nades.push({ pos, vel: _d.clone().multiplyScalar(21).add(_v.set(0, 3.5, 0)), by, fuse: 2.2, mesh });
    G.audio.play('throw');
  }

  explode(p, by, dmg, radius, w) {
    G.fx.explosion(p, radius);
    G.audio.play('explosion', p, 1.2);
    const P = G.player, pd = P.pos.distanceTo(p);
    if (pd < radius * 4) P.shake = Math.max(P.shake, 0.05 * (1 - pd / (radius * 4)));
    for (const c of this.chars.slice()) {
      if (!c.alive) continue;
      c.center(_c);
      const d = _c.distanceTo(p);
      if (d > radius) continue;
      if (d > 1.2 && !G.phys.los(p.x, p.y + 0.3, p.z, _c.x, _c.y, _c.z)) continue;
      let a = dmg * (1 - Math.pow(d / radius, 1.4) * 0.8);
      if (c === by) a *= 0.4;
      else if (by && !by.isPlayer) a *= c.isPlayer ? this.diff.dmg : this.botDmg;
      this.damage(c, a, by, { weapon: w, point: _c.clone() });
    }
  }

  updateProjectiles(dt) {
    const ph = G.phys;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i], step = 58 * dt;
      let hitD = -1;
      const H = ph.ray(r.pos.x, r.pos.y, r.pos.z, r.dir.x, r.dir.y, r.dir.z, step);
      if (H.kind) hitD = H.d;
      for (const c of this.chars) {
        if (c === r.by || !c.alive) continue;
        c.center(_c).sub(r.pos);
        const t = clamp(_c.dot(r.dir), 0, step);
        if (_c.addScaledVector(r.dir, -t).length() < 0.8 && (hitD < 0 || t < hitD)) hitD = t;
      }
      r.life -= dt;
      if (hitD >= 0 || r.life <= 0) {
        r.pos.addScaledVector(r.dir, Math.max(0, hitD - 0.1));
        this.explode(r.pos, r.by, r.w.def.dmg * RARITY[r.w.rarity].mult, r.w.def.radius, r.w);
        r.mesh.removeFromParent();
        this.rockets.splice(i, 1);
        continue;
      }
      r.pos.addScaledVector(r.dir, step);
      r.mesh.position.copy(r.pos);
      for (let k = 0; k < 3; k++) G.fx.spawn(r.pos.x - r.dir.x * k * 0.4, r.pos.y - r.dir.y * k * 0.4, r.pos.z - r.dir.z * k * 0.4, rand(-1, 1), rand(-1, 1) + 1, rand(-1, 1), 2.2, 1.1, 0.5, 0.3, 0.45, -1, 1);
    }
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const g = this.nades[i];
      g.vel.y -= 20 * dt;
      const sp = g.vel.length(), step = sp * dt;
      if (step > 1e-4) {
        _d.copy(g.vel).divideScalar(sp);
        const H = ph.ray(g.pos.x, g.pos.y, g.pos.z, _d.x, _d.y, _d.z, step + 0.05);
        if (H.kind) {
          _n.set(H.nx, H.ny, H.nz);
          g.pos.addScaledVector(_d, Math.max(0, H.d - 0.06));
          g.vel.addScaledVector(_n, -1.45 * g.vel.dot(_n)).multiplyScalar(0.7);
          if (sp > 3) G.audio.play('bounce', g.pos);
        } else g.pos.addScaledVector(_d, step);
      }
      g.mesh.position.copy(g.pos);
      g.fuse -= dt;
      if (Math.random() < 0.5) G.fx.spawn(g.pos.x, g.pos.y, g.pos.z, 0, 0.5, 0, 2, 0.6, 0.3, 0.14, 0.3, 0, 0);
      if (g.fuse <= 0) {
        this.explode(g.pos, g.by, 120, 7.5, FRAG);
        g.mesh.removeFromParent();
        this.nades.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------ pickups
  updatePickups(dt) {
    const P = G.player, cam = G.camera.position, I = G.input;
    let best = null, bd = 2.4;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (!p.alive) {
        p.dead -= dt;
        if (p.dead <= 0) {
          if (p.kind === 'weapon') {
            // arena weapon pads re-roll what they offer
            p.grp.remove(p.model);
            p.w = mkWeapon(rollWeapon(), p.w.rarity);
            p.model = pickupModel('weapon', p.w.id, p.w.rarity);
            p.model.position.y = 0.8;
            p.grp.add(p.model);
          }
          p.alive = true;
          p.grp.visible = true;
        }
        continue;
      }
      if (p.o.temp) {
        p.o.temp -= dt;
        if (p.o.temp <= 0) {
          this.removePickup(i);
          continue;
        }
      }
      const dx = p.pos.x - cam.x, dz = p.pos.z - cam.z, d2 = dx * dx + dz * dz;
      p.grp.visible = d2 < 150 * 150;
      if (d2 > 60 * 60) continue;
      p.t += dt;
      p.model.rotation.y = p.t * 1.5;
      p.model.position.y = 0.8 + Math.sin(p.t * 2.2) * 0.1;
      p.aura.scale.y = clamp((Math.sqrt(d2) - 2) / 5, 0.04, 1); // keep the light beam out of your face up close
      if (!P.alive || P.dropping) continue;
      const d = Math.hypot(p.pos.x - P.pos.x, p.pos.z - P.pos.z);
      if (d > 2.4 || Math.abs(p.pos.y - P.pos.y) > 2.2) continue;
      if (p.kind !== 'weapon') {
        if (d < 1.7 && this.collect(p)) this.takePickup(i);
        continue;
      }
      const same = P.weapons.find((w) => w.id === p.w.id);
      if (same) {
        if (d < 1.7 && (same.reserve < same.def.reserve * 2 || p.w.rarity > same.rarity)) {
          if (Number.isFinite(same.reserve)) same.reserve = Math.min(same.def.reserve * 2, same.reserve + p.w.ammo + Math.min(p.w.reserve, same.def.mag));
          if (p.w.rarity > same.rarity) {
            same.rarity = p.w.rarity;
            G.hud.toast(`${same.def.name} upgraded to ${RARITY[same.rarity].name}`, RARITY[same.rarity].css);
          } else G.hud.toast(`+ ${same.def.name} ammo`, '#b6ff4a');
          G.audio.play('pickup');
          this.takePickup(i);
        }
      } else if (P.weapons.length < 3) {
        if (d < 1.7) {
          P.weapons.push(p.w);
          G.hud.toast(`${RARITY[p.w.rarity].name} ${p.w.def.name}`, RARITY[p.w.rarity].css);
          G.audio.play('pickup');
          // auto-equip an upgrade over the starting sidearm
          if (P.weapon.id === 'sidearm' && P.reloadT <= 0) P.equip(P.weapons.length - 1, true);
          this.takePickup(i);
        }
      } else if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best !== null && P.alive) {
      const p = this.pickups[best];
      G.hud.prompt(`SWAP FOR <b style="color:${RARITY[p.w.rarity].css}">${RARITY[p.w.rarity].name} ${p.w.def.name}</b>`);
      if (I.hit('KeyE')) {
        const old = P.weapon;
        P.weapons[P.cur] = p.w;
        P.equip(P.cur);
        G.audio.play('pickup');
        const respawns = p.respawn;
        this.takePickup(best);
        if (!respawns) this.spawnPickup('weapon', P.pos.x, P.pos.y, P.pos.z, { w: old });
      }
    } else G.hud.prompt(null);
  }

  collect(p) {
    const P = G.player;
    if (p.kind === 'ammo') {
      let any = false;
      for (const w of P.weapons) {
        const cap = w.def.reserve * 2;
        if (!Number.isFinite(w.reserve) || w.reserve >= cap) continue;
        w.reserve = Math.min(cap, w.reserve + Math.ceil(w.def.mag * 1.5));
        any = true;
      }
      if (!any) return false;
      G.hud.toast('+ AMMO', '#b6ff4a');
      G.audio.play('pickup');
    } else if (p.kind === 'med') {
      if (P.health >= 100) return false;
      P.health = Math.min(100, P.health + 50);
      G.hud.toast('+50 HEALTH', '#ff5f8f');
      G.audio.play('heal');
    } else if (p.kind === 'shield') {
      if (P.shield >= 100) return false;
      P.shield = Math.min(100, P.shield + 50);
      G.hud.toast('+50 SHIELD', '#4fb8ff');
      G.audio.play('heal');
    } else {
      if (P.nades >= 4) return false;
      P.nades++;
      G.hud.toast('+ FRAG GRENADE', '#ff9a3c');
      G.audio.play('pickup');
    }
    return true;
  }

  takePickup(i) {
    const p = this.pickups[i];
    G.fx.burst(_v.copy(p.pos).setY(p.pos.y + 0.8), p.w ? RARITY[p.w.rarity].color : PICKUP_COLORS[p.kind], { n: 12, speed: 3, life: 0.4, size: 0.1, grav: -3 });
    if (p.respawn) {
      p.alive = false;
      p.dead = p.respawn;
      p.grp.visible = false;
    } else this.removePickup(i);
  }

  removePickup(i) {
    this.pickups[i].grp.removeFromParent();
    this.pickups.splice(i, 1);
  }

  onPlayerLanded() {
    G.player.safeUntil = this.time + 5; // bots give you a moment to find a weapon
    G.hud.tip(null);
    G.hud.announce('GEAR UP', 'Find weapons before the storm closes', '#6ef3ff', 2.5);
  }

  // ------------------------------------------------------------ frame
  update(dt) {
    this.time += dt;
    const P = G.player;
    P.update(dt);
    for (const b of this.bots) b.update(dt);
    this.updateProjectiles(dt);
    this.updatePickups(dt);
    this.updateZone(dt);
    if (this.mode === 'royale' && (this.paceT -= dt) <= 0) {
      // Pacing governor: rivals thin out on a ~4 minute curve instead of wiping each other in the first minute.
      this.paceT = 1;
      const expected = Math.max(2, this.total - (this.total - 2) * Math.min(1, this.time / 235));
      const alive = this.aliveCount();
      this.botDmg = alive <= expected - 1 ? 0.03 : alive <= expected + 1 ? 0.22 : 0.6;
    }
    if (this.mode === 'deathmatch' && !this.ended) {
      for (const b of this.bots) {
        if (b.alive) continue;
        b.respawnT -= dt;
        if (b.respawnT <= 0) {
          b.spawn(this.spawnPoint(), 0);
          b.spawnProt = 1.5;
        }
      }
      if (!P.alive) {
        this.respawnT -= dt;
        G.hud.respawnTime(this.respawnT);
        if (this.respawnT <= 0) this.spawnPlayerDM(false);
      }
      if (this.time >= this.cfg.time) {
        const rank = this.ranking().indexOf(P) + 1;
        this.end(rank === 1, rank);
      }
    }
  }

  dispose() {
    for (const b of this.bots) {
      if (b.gunMesh) b.gunMesh.traverse((o) => o.isMesh && o.geometry.dispose());
      b.dispose();
    }
    for (const p of this.pickups) p.grp.removeFromParent();
    for (const r of this.rockets) r.mesh.removeFromParent();
    for (const g of this.nades) g.mesh.removeFromParent();
    this.bots.length = this.pickups.length = this.rockets.length = this.nades.length = 0;
    G.world.setStorm(0, 0, 400, false);
    G.timeScale = 1;
  }
}
