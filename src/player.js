import * as THREE from 'three';
import { G } from './ctx.js';
import { WRAPS, TRACERS } from './config.js';
import { clamp, lerp, damp, rand } from './utils.js';
import { Character, mkWeapon, fire } from './entities.js';
import { buildGun, flashTexture, toonMat } from './models.js';

const _fwd = new THREE.Vector3(), _muz = new THREE.Vector3(), _v = new THREE.Vector3();
const HIP = new THREE.Vector3(0.2, -0.2, -0.44);

// First-person weapon view: rendered in its own scene/camera so it never clips into walls.
class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(56, innerWidth / innerHeight, 0.01, 20);
    this.scene.add(new THREE.HemisphereLight(0xd8ceff, 0xff9d7a, 1.7));
    const dl = new THREE.DirectionalLight(0xffe9d2, 2.4);
    dl.position.set(1, 2, 1.5);
    this.scene.add(dl);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.mat = toonMat();
    this.cache = {};
    this.gun = null;
    this.id = null;
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.3),
      new THREE.MeshBasicMaterial({ map: flashTexture(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false })
    );
    this.flash.material.color.setScalar(2.2);
    this.flash.visible = false;
    this.kick = 0;
    this.kickR = 0;
    this.swx = 0;
    this.swy = 0;
    this.dip = 0;
    this.sprint = 0;
    this.flashT = 0;
  }

  setWeapon(id) {
    if (this.gun) this.root.remove(this.gun);
    let g = this.cache[id];
    if (!g) {
      const wrap = WRAPS.find((w) => w.id === G.profile.wrap) || WRAPS[0];
      g = this.cache[id] = buildGun(id, wrap, { hands: true, mat: this.mat });
    }
    this.gun = g;
    this.id = id;
    this.root.add(g);
    g.add(this.flash);
    this.flash.position.copy(g.userData.muzzle);
    this.flash.position.z -= 0.05;
  }

  refreshSkin() {
    for (const k in this.cache) {
      const g = this.cache[k];
      g.traverse((o) => o.isMesh && o !== this.flash && o.geometry.dispose());
      g.removeFromParent();
    }
    this.cache = {};
    this.gun = null;
    if (this.id) this.setWeapon(this.id);
  }

  shoot(def) {
    this.kick = Math.min(0.09, this.kick + 0.022 + def.recoil * 0.9);
    this.kickR = Math.min(0.3, this.kickR + 0.03 + def.recoil * 1.6);
    this.flashT = 0.05;
    this.flash.rotation.z = Math.random() * 6.28;
    this.flash.scale.setScalar(rand(0.8, 1.3) * (def.pellets || def.scope ? 1.5 : 1));
  }

  update(dt, p, moving, sprinting) {
    const g = this.gun;
    if (!g) return;
    const I = G.input, def = p.weapon.def, a = p.ads * p.ads * (3 - 2 * p.ads);
    this.kick = damp(this.kick, 0, 16, dt);
    this.kickR = damp(this.kickR, 0, 13, dt);
    this.dip = damp(this.dip, 0, 9, dt);
    this.swx = damp(this.swx, clamp(-I.dx * 0.0016, -0.07, 0.07), 10, dt);
    this.swy = damp(this.swy, clamp(-I.dy * 0.0016, -0.07, 0.07), 10, dt);
    this.sprint = damp(this.sprint, sprinting ? 1 : 0, 9, dt);
    const sight = g.userData.sight;
    const hipK = 1 - a;
    let x = lerp(HIP.x, 0, a), y = lerp(HIP.y, -sight - 0.008, a), z = lerp(HIP.z, -0.3, a);
    let rx = 0, ry = 0, rz = 0;
    // bob + sway
    const bob = moving * (p.onGround ? 1 : 0.2);
    x += Math.sin(p.bobT) * 0.007 * bob * (0.25 + hipK);
    y += Math.abs(Math.cos(p.bobT)) * 0.008 * bob * (0.25 + hipK) - this.dip;
    ry += this.swx * (0.4 + hipK);
    rx += this.swy * (0.4 + hipK);
    x += this.swx * 0.05 * hipK;
    // recoil
    z += this.kick;
    rx += this.kickR * (0.5 + 0.5 * hipK);
    // reload
    if (p.reloadT > 0) {
      const t = 1 - p.reloadT / def.reload;
      const k = Math.min(1, t / 0.2) * Math.min(1, (1 - t) / 0.2);
      const e = k * k * (3 - 2 * k);
      rx -= e * 0.75;
      y -= e * 0.14;
      rz += e * 0.45 + Math.sin(t * 18) * 0.02 * e;
    }
    // draw
    if (p.drawT > 0) {
      const k = p.drawT / 0.32;
      y -= k * k * 0.3;
      rx -= k * 0.9;
    }
    // sprint carry
    ry += this.sprint * 0.55;
    rx -= this.sprint * 0.12;
    x -= this.sprint * 0.05;
    y -= this.sprint * 0.03;
    g.position.set(x, y, z);
    g.rotation.set(rx, ry, rz);
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    this.root.updateMatrixWorld(true);
  }

  muzzleWorld(out) {
    out.copy(this.gun.userData.muzzle);
    this.gun.localToWorld(out);
    return G.camera.localToWorld(out);
  }
}

export class Player extends Character {
  constructor() {
    super('You', true);
    this.vm = new ViewModel();
    this.slideDir = new THREE.Vector3();
    this.dashDir = new THREE.Vector3();
    this.color = 0x6ef3ff;
    this.resetState();
  }

  resetState() {
    this.health = 100;
    this.shield = 0;
    this.alive = true;
    this.weapons = [];
    this.cur = 0;
    this.ads = 0;
    this.recoilP = 0;
    this.recoilY = 0;
    this.shake = 0;
    this.dashCd = 0;
    this.dashT = 0;
    this.slideT = 0;
    this.slideCd = 0;
    this.nades = 0;
    this.bobT = 0;
    this.stepD = 0;
    this.coyote = 0;
    this.drawT = 0;
    this.reloadT = 0;
    this.cool = 0;
    this.bloom = 0;
    this.fireBuf = 0;
    this.fireHold = 0;
    this.padCd = 0;
    this.dropping = false;
    this.grav = 24;
    this.h = 1.8;
    this.crouching = false;
    this.vel.set(0, 0, 0);
    this.deadT = 0;
    this.spawnProt = 0;
    this.safeUntil = 0;
    this.roll = 0;
    this.spread = 0.02;
    this.tracer = (TRACERS.find((t) => t.id === G.profile.tracer) || TRACERS[0]).color;
  }

  give(id, rarity = 0) {
    this.weapons.push(mkWeapon(id, rarity));
    return this.weapons.length - 1;
  }

  equip(i, silent) {
    if (!this.weapons[i]) return;
    this.cur = i;
    this.reloadT = 0;
    this.drawT = 0.32;
    this.bloom = 0;
    this.vm.setWeapon(this.weapons[i].id);
    if (!silent) G.audio.play('swap');
  }

  startReload() {
    const w = this.weapon;
    if (this.reloadT > 0 || w.ammo >= w.def.mag || w.reserve <= 0) return;
    this.reloadT = w.def.reload;
    G.audio.play('reload');
  }

  update(dt) {
    const I = G.input, S = G.profile.settings, cam = G.camera, P = G.phys;
    if (!this.alive) {
      this.deadT += dt;
      cam.position.y = damp(cam.position.y, this.pos.y + 0.35, 4, dt);
      cam.rotation.z = damp(cam.rotation.z, 0.6, 3, dt);
      this.vm.root.visible = false;
      return;
    }
    const w = this.weapon, def = w.def;
    this.spawnProt -= dt;

    // ---- look
    const sens = 0.0023 * S.sens * lerp(1, 1 / def.zoom, this.ads);
    this.yaw -= I.dx * sens;
    this.pitch = clamp(this.pitch - I.dy * sens * (S.invertY ? -1 : 1), -1.5, 1.5);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let mx = I.moveX(), mz = I.moveY();
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }
    const wx = -sy * mz + cy * mx, wz = -cy * mz - sy * mx;
    let sprinting = false;

    if (this.dropping) {
      // ---- glide in from the sky
      const dive = clamp(-this.pitch / 1.2, 0, 1);
      this.vel.x = damp(this.vel.x, wx * 17 - sy * 5, 3, dt);
      this.vel.z = damp(this.vel.z, wz * 17 - cy * 5, 3, dt);
      this.vel.y = -(11 + dive * 24);
      P.move(this, dt);
      if (Math.random() < 0.6) G.fx.spawn(this.pos.x + rand(-0.4, 0.4), this.pos.y + 0.2, this.pos.z + rand(-0.4, 0.4), 0, 3, 0, 0.4, 1.4, 1.6, 0.25, 0.6, 0, 0);
      if (this.onGround) {
        this.dropping = false;
        this.grav = 24;
        this.vel.set(0, 0, 0);
        this.shake = 0.03;
        this.vm.dip = 0.12;
        G.audio.play('land');
        G.fx.ring(this.pos.clone().setY(this.pos.y + 0.1), 0x6ef3ff, 5, 0.5);
        G.fx.burst(this.pos, 0x6ef3ff, { n: 30, speed: 7, life: 0.6, size: 0.14, up: 2 });
        G.match.onPlayerLanded();
      }
    } else {
      // ---- ground / air movement
      const hs0 = Math.hypot(this.vel.x, this.vel.z);
      this.slideCd -= dt;
      if (I.hit('KeyC') && this.onGround && hs0 > 7 && this.slideCd <= 0) {
        this.slideT = 0.75;
        this.slideCd = 1.3;
        this.slideDir.set(this.vel.x / hs0, 0, this.vel.z / hs0);
        G.audio.play('dash', null, 0.5);
      }
      const blocked = this.crouching && P.blocked(this.pos.x, this.pos.y + 1.25, this.pos.z, this.r * 0.9, 0.55);
      this.crouching = I.key('KeyC') || this.slideT > 0 || blocked;
      this.h = damp(this.h, this.crouching ? 1.2 : 1.8, 14, dt);
      this.fireHold -= dt;
      sprinting = (I.key('ShiftLeft') || I.key('ShiftRight') || I.sprintHeld) && mz > 0.3 && !this.crouching && this.ads < 0.4 && this.fireHold <= 0 && this.reloadT <= 0;
      const speed = 6.1 * def.speed * (sprinting ? 1.45 : 1) * (this.crouching ? 0.55 : 1) * lerp(1, 0.6, this.ads);

      this.dashCd -= dt;
      if (I.hit('KeyQ') && this.dashCd <= 0) {
        this.dashT = 0.16;
        this.dashCd = 4;
        if (ml > 0.1) this.dashDir.set(wx, 0, wz).normalize();
        else this.dashDir.set(-sy, 0, -cy);
        G.audio.play('dash');
        G.fx.burst(this.center(_v), this.tracer, { n: 16, speed: 3, life: 0.4, size: 0.12, grav: 0 });
      }
      if (this.dashT > 0) {
        this.dashT -= dt;
        this.vel.x = this.dashDir.x * 25;
        this.vel.z = this.dashDir.z * 25;
        if (this.vel.y < 0) this.vel.y = 0;
      } else if (this.slideT > 0) {
        this.slideT -= dt;
        const sp = lerp(5.5, 12.5, this.slideT / 0.75);
        this.vel.x = this.slideDir.x * sp;
        this.vel.z = this.slideDir.z * sp;
      } else {
        const k = this.onGround ? 13 : ml > 0.1 ? 2.6 : 0.3;
        this.vel.x = damp(this.vel.x, wx * speed, k, dt);
        this.vel.z = damp(this.vel.z, wz * speed, k, dt);
      }

      this.coyote = this.onGround ? 0.1 : this.coyote - dt;
      if (I.hit('Space') && this.coyote > 0) {
        this.vel.y = 8.3;
        this.onGround = false;
        this.coyote = 0;
        this.slideT = 0;
        G.audio.play('jump');
      }
      this.padCd -= dt;
      if (this.onGround && this.padCd <= 0) {
        for (const pad of G.world.jumpPads) {
          if (Math.abs(this.pos.y - pad.y) < 0.7 && Math.hypot(this.pos.x - pad.x, this.pos.z - pad.z) < pad.r) {
            this.vel.y = pad.power;
            this.onGround = false;
            this.coyote = 0;
            this.padCd = 0.5;
            G.audio.play('pad');
            G.fx.ring(_v.set(pad.x, pad.y + 0.2, pad.z), 0x9dff3c, 4, 0.5);
            G.fx.burst(_v, 0x9dff3c, { n: 20, speed: 5, life: 0.6, size: 0.12, up: 6, grav: 4 });
          }
        }
      }
      P.move(this, dt);
      if (this.landed > 7) {
        G.audio.play('land', null, clamp(this.landed / 16, 0.4, 1));
        this.vm.dip = Math.min(0.13, this.landed * 0.006);
        this.shake = Math.max(this.shake, Math.min(0.025, this.landed * 0.001));
      }
      const hs = Math.hypot(this.vel.x, this.vel.z);
      if (this.onGround && hs > 2 && this.slideT <= 0) {
        this.stepD += hs * dt;
        this.bobT += hs * dt * 1.55;
        if (this.stepD > 2.4) {
          this.stepD = 0;
          G.audio.play('step', null, sprinting ? 1 : 0.7);
        }
      }

      // ---- weapon handling
      this.cool -= dt;
      this.drawT -= dt;
      this.bloom = Math.max(0, this.bloom - dt * (0.05 + this.bloom * 5));
      let sw = -1;
      const n = this.weapons.length;
      if (I.hit('Digit1')) sw = 0;
      if (I.hit('Digit2')) sw = 1;
      if (I.hit('Digit3')) sw = 2;
      if (I.wheel) sw = (this.cur + Math.sign(I.wheel) + n) % n;
      if (I.hit('TouchSwap') || I.hit('KeyX')) sw = (this.cur + 1) % n;
      if (sw >= 0 && sw < n && sw !== this.cur) {
        this.equip(sw);
        return this.updateCamera(dt, mx, hs, sprinting);
      }
      if (this.reloadT > 0) {
        this.reloadT -= dt;
        if (this.reloadT <= 0) {
          const add = Math.min(def.mag - w.ammo, w.reserve);
          w.ammo += add;
          w.reserve -= add;
          G.audio.play('reloadEnd');
        }
      } else if (I.hit('KeyR') && this.drawT <= 0) this.startReload();

      if (I.fireHit) this.fireBuf = 0.14;
      this.fireBuf -= dt;
      // fireBuf also covers a click shorter than one frame, so a quick tap always fires at least once
      const trig = this.fireBuf > 0 || (def.auto && I.fire);
      if (trig && this.cool <= 0 && this.drawT <= 0 && this.reloadT <= 0) {
        this.fireBuf = 0;
        if (w.ammo > 0) this.shoot(hs);
        else {
          G.audio.play('empty');
          this.cool = 0.25;
          this.startReload();
        }
      }
      if (w.ammo === 0 && this.reloadT <= 0 && this.cool <= 0 && w.reserve > 0 && this.drawT <= 0) this.startReload();

      const wantAds = I.ads && this.reloadT <= 0 && this.drawT <= 0 && !sprinting;
      this.ads = damp(this.ads, wantAds ? 1 : 0, 16, dt);
      if (this.ads < 0.001) this.ads = 0;
      this.spread = def.pellets ? lerp(def.hip, def.ads, this.ads) : lerp(def.hip, def.ads, this.ads) + this.bloom + ((this.onGround ? 0 : 0.02) + (hs / 8) * 0.008) * (1 - this.ads * 0.6);

      if (I.hit('KeyG') && this.nades > 0) {
        this.nades--;
        G.match.throwNade(this);
      }
      return this.updateCamera(dt, mx, hs, sprinting);
    }
    this.updateCamera(dt, mx, 0, false);
  }

  shoot(hs) {
    const cam = G.camera, w = this.weapon, def = w.def, M = G.match;
    cam.getWorldDirection(_fwd);
    this.vm.muzzleWorld(_muz);
    const hit = fire(this, cam.position, _fwd, this.spread, _muz);
    M.stats.shots++;
    if (hit) M.stats.hits++;
    this.recoilP += def.recoil * rand(0.8, 1.2) * lerp(1, 0.7, this.ads);
    this.recoilY += (Math.random() - 0.5) * def.recoil * 0.7;
    this.bloom = Math.min(this.bloom + def.bloom, 0.06);
    this.fireHold = 0.3;
    this.vm.shoot(def);
    G.fx.muzzle(_v.copy(cam.position).addScaledVector(_fwd, 1.2), this.tracer);
    G.hud.kickCross();
  }

  updateCamera(dt, mx, hs, sprinting) {
    const cam = G.camera, S = G.profile.settings, def = this.weapon.def;
    this.recoilP = damp(this.recoilP, 0, 9, dt);
    this.recoilY = damp(this.recoilY, 0, 9, dt);
    this.shake = damp(this.shake, 0, 7, dt);
    const sk = this.shake;
    const bob = this.onGround && !this.dropping ? Math.abs(Math.cos(this.bobT)) * 0.035 * Math.min(1, hs / 6) * (1 - this.ads * 0.7) : 0;
    cam.position.set(this.pos.x, this.pos.y + this.h * 0.9 + bob, this.pos.z);
    this.roll = damp(this.roll, -mx * 0.014 + (this.slideT > 0 ? 0.05 : 0), 8, dt);
    cam.rotation.set(this.pitch + this.recoilP + rand(-sk, sk), this.yaw + this.recoilY + rand(-sk, sk), this.roll + rand(-sk, sk) * 0.5, 'YXZ');
    const baseT = Math.tan((S.fov * Math.PI) / 360) * (9 / 16);
    let fov = (Math.atan(baseT / lerp(1, def.zoom, this.ads)) * 360) / Math.PI;
    fov += (sprinting ? 5 : 0) + (this.dashT > 0 ? 12 : 0) + (this.dropping ? 10 : 0);
    cam.fov = damp(cam.fov, fov, 12, dt);
    cam.updateProjectionMatrix();
    const scoped = !!def.scope && this.ads > 0.85;
    G.hud.scope(scoped);
    this.vm.root.visible = !scoped && !this.dropping;
    this.vm.update(dt, this, Math.min(1, hs / 6), sprinting);
  }
}
