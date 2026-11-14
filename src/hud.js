import * as THREE from 'three';
import { G } from './ctx.js';
import { RARITY, WORLD, MODES } from './config.js';
import { el, esc, fmtTime, clamp } from './utils.js';

const _v = new THREE.Vector3();
const TAU = Math.PI * 2;
const DIRS = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

export class Hud {
  constructor() {
    this.root = el('hud');
    this.e = {};
    for (const id of ['vig-hurt', 'vig-low', 'vig-storm', 'scope', 'cross', 'hitm', 'dmg-ind', 'nums', 'zone', 'zone-label', 'zone-time', 'counts', 'feed',
      'sh-fill', 'sh-num', 'hp-fill', 'hp-num', 'dash', 'nade', 'nade-n', 'ammo', 'ammo-cur', 'ammo-res', 'wname', 'slots', 'announce', 'elim', 'prompt',
      'tip', 'toasts', 'respawn', 'respawn-by', 'respawn-t', 'board', 'mini', 'compass']) this.e[id] = el(id);
    this.mctx = this.e.mini.getContext('2d');
    this.cctx = this.e.compass.getContext('2d');
    this.cache = {};
    this.nums = [];
    for (let i = 0; i < 18; i++) {
      const b = document.createElement('b');
      this.e.nums.appendChild(b);
      this.nums.push({ el: b, t: 0, life: 0, pos: new THREE.Vector3(), amount: 0, target: null });
    }
    this.inds = [];
    for (let i = 0; i < 6; i++) {
      const d = document.createElement('i');
      d.style.display = 'none';
      this.e['dmg-ind'].appendChild(d);
      this.inds.push({ el: d, t: 0, pos: new THREE.Vector3() });
    }
    this.hurtA = 0;
    this.hitT = 0;
    this.crossKick = 0;
    this.annT = 0;
    this.elimT = 0;
    this.miniT = 0;
    this.boardT = 0;
    this.scoped = false;
    this.match = null;
  }

  show(on) {
    this.root.classList.toggle('hidden', !on);
  }

  set(key, val, fn) {
    if (this.cache[key] === val) return;
    this.cache[key] = val;
    fn(val);
  }

  reset(match) {
    this.match = match;
    this.cache = {};
    this.e.feed.innerHTML = '';
    this.e.toasts.innerHTML = '';
    this.e.announce.classList.remove('on');
    this.e.elim.classList.remove('on');
    this.e.board.classList.remove('on');
    this.respawn(null);
    this.prompt(null);
    this.scope(false);
    this.hurtA = 0;
    for (const n of this.nums) {
      n.life = 0;
      n.el.style.display = 'none';
    }
    for (const i of this.inds) {
      i.t = 0;
      i.el.style.display = 'none';
    }
  }

  // ------------------------------------------------------------ events
  hitmarker(head) {
    this.hitT = 0.22;
    this.e.hitm.style.setProperty('--c', head ? '#ffe14a' : '#ffffff');
  }

  kickCross() {
    this.crossKick = 1;
  }

  number(target, point, amount, head, shield) {
    let n = this.nums.find((x) => x.life > 0 && x.target === target && x.t < 0.14);
    if (n) {
      n.amount += amount;
      n.head = n.head || head;
    } else {
      n = this.nums.find((x) => x.life <= 0) || this.nums[0];
      n.amount = amount;
      n.head = head;
      n.t = 0;
      n.pos.copy(point);
      n.pos.y += 0.35;
      n.ox = (Math.random() - 0.5) * 40;
      n.target = target;
      n.el.style.display = 'block';
    }
    n.life = 0.9;
    n.el.textContent = Math.max(1, Math.round(n.amount));
    n.el.style.color = n.head ? '#ffe14a' : shield ? '#6fd0ff' : '#ffffff';
  }

  hurt(pos, amount, storm) {
    this.hurtA = Math.min(1, this.hurtA + amount / 45 + 0.22);
    if (!pos || storm) return;
    const i = this.inds.find((x) => x.t <= 0) || this.inds[0];
    i.t = 1.3;
    i.pos.copy(pos);
    i.el.style.display = 'block';
  }

  feed(killer, victim, how, byPlayer, playerDied, head) {
    const d = document.createElement('div');
    if (byPlayer) d.className = 'mine';
    else if (playerDied) d.className = 'me-dead';
    d.innerHTML = `<b>${esc(killer)}</b><i>${how === 'storm' ? 'consumed' : esc(how || 'eliminated') + (head ? ' ◎' : '')}</i><b>${esc(victim)}</b>`;
    this.e.feed.appendChild(d);
    while (this.e.feed.children.length > 5) this.e.feed.firstChild.remove();
    setTimeout(() => d.remove(), 6500);
  }

  elim(name, head, big) {
    this.e.elim.innerHTML = `ELIMINATED <b>${esc(name)}</b>${head ? '<em>HEADSHOT</em>' : ''}`;
    this.e.elim.classList.add('on');
    this.elimT = 2.2;
    if (big) this.announce(big, '', '#ff7ab8', 1.8);
  }

  announce(title, sub = '', color = '#fff', dur = 2.4) {
    const a = this.e.announce;
    a.classList.remove('on');
    void a.offsetWidth; // restart the slam animation
    a.querySelector('h2').textContent = title;
    a.querySelector('h2').style.color = color;
    a.querySelector('p').textContent = sub;
    a.classList.add('on');
    this.annT = dur;
  }

  toast(text, color = '#fff') {
    const d = document.createElement('div');
    d.textContent = text;
    d.style.color = color;
    this.e.toasts.appendChild(d);
    while (this.e.toasts.children.length > 4) this.e.toasts.firstChild.remove();
    setTimeout(() => d.remove(), 1900);
  }

  prompt(html) {
    this.set('prompt', html, (v) => {
      this.e.prompt.classList.toggle('on', !!v);
      if (v) this.e.prompt.innerHTML = (G.input.isTouch ? '' : '<kbd>E</kbd>') + v;
      const use = el('t-use');
      if (use) use.style.display = v ? '' : 'none';
    });
  }

  tip(html) {
    this.e.tip.classList.toggle('on', !!html);
    if (html) this.e.tip.innerHTML = html;
  }

  scope(on) {
    if (on === this.scoped) return;
    this.scoped = on;
    this.e.scope.classList.toggle('on', on);
  }

  respawn(by) {
    this.e.respawn.classList.toggle('on', by !== null);
    if (by !== null) this.e['respawn-by'].textContent = `by ${by}`;
  }

  respawnTime(t) {
    this.set('rt', Math.max(1, Math.ceil(t)), (v) => (this.e['respawn-t'].textContent = `Respawning in ${v}`));
  }

  // ------------------------------------------------------------ per-frame
  update(dt) {
    const M = this.match, P = G.player, e = this.e;
    if (!M || G.state !== 'playing') return;
    const w = P.weapon;

    this.set('hp', Math.ceil(P.health), (v) => {
      e['hp-fill'].style.width = v + '%';
      e['hp-num'].textContent = v;
      e['hp-fill'].parentElement.classList.toggle('low', v <= 35);
    });
    this.set('sh', Math.ceil(P.shield), (v) => {
      e['sh-fill'].style.width = v + '%';
      e['sh-num'].textContent = v;
    });
    if (w) {
      this.set('ac', w.ammo, (v) => (e['ammo-cur'].textContent = v));
      this.set('ar', w.reserve, (v) => (e['ammo-res'].textContent = '/ ' + (Number.isFinite(v) ? v : '∞')));
      this.set('al', w.ammo <= w.def.mag * 0.25, (v) => e.ammo.classList.toggle('low', v));
      this.set('wn', w.id + w.rarity, () => {
        e.wname.textContent = `${RARITY[w.rarity].name} ${w.def.name}`.toUpperCase();
        e.wname.style.color = RARITY[w.rarity].css;
      });
    }
    const sig = P.weapons.map((x) => x.id + x.rarity).join('|') + '#' + P.cur;
    this.set('slots', sig, () => {
      let h = '';
      for (let i = 0; i < 3; i++) {
        const x = P.weapons[i];
        h += x
          ? `<div class="slot${i === P.cur ? ' on' : ''}" style="--rc:${RARITY[x.rarity].css}"><em>${i + 1} · ${x.def.tag}</em><b>${esc(x.def.name)}</b></div>`
          : `<div class="slot empty"><em>${i + 1}</em><b>— empty —</b></div>`;
      }
      e.slots.innerHTML = h;
    });
    this.set('nade', P.nades, (v) => {
      e['nade-n'].textContent = v;
      e.nade.classList.toggle('off', v === 0);
    });
    const dp = clamp(1 - P.dashCd / 4, 0, 1);
    this.set('dash', Math.round(dp * 40), () => {
      e.dash.style.setProperty('--p', dp);
      e.dash.classList.toggle('ready', dp >= 1);
    });

    // vignettes
    this.hurtA = Math.max(0, this.hurtA - dt * 1.6);
    e['vig-hurt'].style.opacity = this.hurtA.toFixed(2);
    const low = P.alive && P.health <= 35 ? (1 - P.health / 35) * (0.55 + 0.25 * Math.sin(G.time * 6)) : 0;
    e['vig-low'].style.opacity = low.toFixed(2);
    const z = M.zone;
    const inStorm = P.alive && !P.dropping && Math.hypot(P.pos.x - z.x, P.pos.z - z.z) > z.r;
    this.set('storm', inStorm, (v) => (e['vig-storm'].style.opacity = v ? 1 : 0));
    this.inStorm = inStorm;

    // crosshair
    this.crossKick = Math.max(0, this.crossKick - dt * 9);
    const showCross = P.alive && !P.dropping && !this.scoped;
    this.set('cv', showCross, (v) => (e.cross.style.display = v ? '' : 'none'));
    this.set('cads', P.ads > 0.6 && !w.def.pellets, (v) => e.cross.classList.toggle('ads', v));
    if (showCross) {
      const px = (P.spread * (innerHeight / 2)) / Math.tan((G.camera.fov * Math.PI) / 360);
      this.set('gap', Math.round(4 + px + this.crossKick * 5), (v) => e.cross.style.setProperty('--gap', v + 'px'));
    }
    if (this.hitT > 0) {
      this.hitT -= dt;
      e.hitm.style.opacity = clamp(this.hitT / 0.12, 0, 1);
      e.hitm.style.transform = `scale(${1 + this.hitT * 1.5})`;
    }

    // timers on text
    if (this.annT > 0 && (this.annT -= dt) <= 0) e.announce.classList.remove('on');
    if (this.elimT > 0 && (this.elimT -= dt) <= 0) e.elim.classList.remove('on');

    // top right + zone label
    if (M.mode === 'royale') {
      this.set('counts', M.aliveCount() + '|' + P.kills, () => (e.counts.innerHTML = `<div><b>${M.aliveCount()}</b><span>ALIVE</span></div><div><b>${P.kills}</b><span>ELIMS</span></div>`));
      const lbl = z.done ? 'FINAL CIRCLE' : z.shrinking ? 'STORM CLOSING' : 'STORM IN';
      this.set('zl', lbl, (v) => {
        e['zone-label'].textContent = v;
        e.zone.classList.toggle('warn', z.shrinking);
      });
      this.set('zt', z.done ? '' : fmtTime(z.t), (v) => (e['zone-time'].textContent = v));
    } else {
      let lead = 0;
      for (const c of M.chars) if (c !== P && c.kills > lead) lead = c.kills;
      const left = fmtTime(M.cfg.time - M.time);
      this.set('counts', P.kills + '|' + lead + '|' + left, () => (e.counts.innerHTML = `<div><b>${P.kills}</b><span>YOU</span></div><div><b>${lead}</b><span>RIVAL</span></div><div><b>${left}</b><span>TIME</span></div>`));
      this.set('zl', 'dm', () => {
        e['zone-label'].textContent = 'FIRST TO';
        e['zone-time'].textContent = M.cfg.target;
      });
    }

    this.updateNumbers(dt);
    this.updateIndicators(dt, P);
    this.drawCompass(P);
    this.miniT -= dt;
    if (this.miniT <= 0) {
      this.miniT = 0.07;
      this.drawMini(M, P);
    }

    const showBoard = G.input.key('Tab');
    this.set('board', showBoard, (v) => e.board.classList.toggle('on', v));
    if (showBoard && (this.boardT -= dt) <= 0) {
      this.boardT = 0.3;
      this.drawBoard(M, P);
    }
  }

  updateNumbers(dt) {
    const cam = G.camera, w = innerWidth, h = innerHeight;
    for (const n of this.nums) {
      if (n.life <= 0) continue;
      n.life -= dt;
      n.t += dt;
      if (n.life <= 0) {
        n.el.style.display = 'none';
        continue;
      }
      _v.copy(n.pos);
      _v.y += n.t * 1.1;
      _v.project(cam);
      if (_v.z > 1) {
        n.el.style.opacity = 0;
        continue;
      }
      const s = (n.head ? 1.25 : 1) * (1 + Math.max(0, 0.15 - n.t) * 4);
      n.el.style.opacity = clamp(n.life / 0.3, 0, 1);
      n.el.style.transform = `translate(${((_v.x * 0.5 + 0.5) * w + n.ox).toFixed(1)}px,${((-_v.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%,-50%) scale(${s.toFixed(2)})`;
    }
  }

  updateIndicators(dt, P) {
    const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
    for (const i of this.inds) {
      if (i.t <= 0) continue;
      i.t -= dt;
      if (i.t <= 0 || !P.alive) {
        i.t = 0;
        i.el.style.display = 'none';
        continue;
      }
      const dx = i.pos.x - P.pos.x, dz = i.pos.z - P.pos.z;
      const ang = Math.atan2(dx * cy - dz * sy, -dx * sy - dz * cy);
      i.el.style.transform = `rotate(${ang.toFixed(3)}rad)`;
      i.el.style.opacity = clamp(i.t / 0.5, 0, 1);
    }
  }

  drawCompass(P) {
    const c = this.cctx, W = 640, H = 44;
    const deg = (((-P.yaw * 180) / Math.PI) % 360 + 360) % 360;
    if (this.cache.cdeg === Math.round(deg * 2)) return;
    this.cache.cdeg = Math.round(deg * 2);
    c.clearRect(0, 0, W, H);
    c.textAlign = 'center';
    c.fillStyle = '#fff';
    for (let a = Math.floor((deg - 85) / 15) * 15; a <= deg + 85; a += 15) {
      const x = W / 2 + (a - deg) * 3.7, n = ((a % 360) + 360) % 360;
      const fade = 1 - Math.abs(a - deg) / 88;
      c.globalAlpha = clamp(fade * 1.4, 0, 1);
      if (DIRS[n]) {
        c.font = `italic 900 ${n % 90 === 0 ? 24 : 17}px "Arial Black", system-ui, sans-serif`;
        c.fillStyle = n === 0 ? '#ff7ab8' : '#fff';
        c.fillText(DIRS[n], x, 26);
      } else {
        c.fillStyle = '#fff';
        c.fillRect(x - 1, 12, 2, 12);
      }
    }
    c.globalAlpha = 1;
    c.fillStyle = '#3cf2ff';
    c.beginPath();
    c.moveTo(W / 2 - 7, H);
    c.lineTo(W / 2 + 7, H);
    c.lineTo(W / 2, H - 10);
    c.fill();
  }

  drawMini(M, P) {
    const c = this.mctx, S = 352, k = S / WORLD.size, half = WORLD.size / 2, z = M.zone;
    c.clearRect(0, 0, S, S);
    c.drawImage(G.world.mapCanvas, 0, 0, S, S);
    const cx = (z.x + half) * k, cy = (z.z + half) * k, r = Math.max(1, z.r * k);
    c.fillStyle = 'rgba(150,60,255,0.5)';
    c.beginPath();
    c.rect(0, 0, S, S);
    c.arc(cx, cy, r, 0, TAU, true);
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = '#e2b8ff';
    c.beginPath();
    c.arc(cx, cy, r, 0, TAU);
    c.stroke();
    if (z.tr < z.r - 0.5) {
      c.setLineDash([9, 7]);
      c.strokeStyle = '#ffffff';
      c.beginPath();
      c.arc((z.tx + half) * k, (z.tz + half) * k, Math.max(1, z.tr * k), 0, TAU);
      c.stroke();
      c.setLineDash([]);
    }
    for (const b of M.bots) {
      const age = M.time - b.pingT;
      if (!b.alive || age > 1.6) continue;
      c.globalAlpha = 1 - age / 1.6;
      c.fillStyle = '#ff3f5e';
      c.beginPath();
      c.arc((b.pos.x + half) * k, (b.pos.z + half) * k, 5, 0, TAU);
      c.fill();
    }
    c.globalAlpha = 1;
    c.save();
    c.translate((P.pos.x + half) * k, (P.pos.z + half) * k);
    c.rotate(-P.yaw);
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#0d0a26';
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(0, -12);
    c.lineTo(8, 9);
    c.lineTo(0, 4);
    c.lineTo(-8, 9);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }

  drawBoard(M, P) {
    const dm = M.mode === 'deathmatch';
    const rows = M.ranking();
    if (!dm) rows.sort((a, b) => b.alive - a.alive || b.kills - a.kills);
    let h = `<h4>${MODES[M.mode].name} · SCOREBOARD</h4><div class="rw hd"><span>#</span><span>PLAYER</span><span>ELIMS</span><span>${dm ? 'DEATHS' : 'STATUS'}</span></div>`;
    rows.forEach((c, i) => {
      h += `<div class="rw${c === P ? ' me' : ''}${!dm && !c.alive ? ' out' : ''}"><span>${i + 1}</span><span>${esc(c.name)}</span><span>${c.kills}</span><span>${dm ? c.deaths : c.alive ? 'ALIVE' : 'OUT'}</span></div>`;
    });
    this.e.board.innerHTML = h;
  }
}
