import { G } from './ctx.js';
import { el, clamp } from './utils.js';

// Keyboard + mouse (pointer lock) + touch controls behind one polling interface.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.hits = new Set(); // edge-triggered key presses, cleared each frame
    this.dx = 0;
    this.dy = 0;
    this.fire = false;
    this.fireHit = false;
    this.ads = false;
    this.wheel = 0;
    this.locked = false;
    this.joy = { x: 0, y: 0 };
    this.isTouch = matchMedia('(pointer: coarse)').matches && 'ontouchstart' in window;
    this.sprintHeld = false;
    // Free-look: fallback when the page is not allowed to capture the mouse (sandboxed iframe, in-app browser).
    this.freeLook = false;
    this.lockFails = 0;
    this.mx = 0.5;
    this.my = 0.5;
    this._lockPromise = false;
    this.lastUnlock = -1e9;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.hits.add(e.code);
      if (e.code === 'KeyP' || (e.code === 'Escape' && this.freeLook)) G.game?.togglePause();
      if (G.state === 'playing' && ['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'KeyQ', 'KeyE', 'Slash', 'Quote'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.fire = false;
      this.ads = false;
      this.mx = this.my = 0.5;
    });
    document.addEventListener('mouseleave', () => (this.mx = this.my = 0.5));
    addEventListener('mouseout', (e) => {
      if (!e.relatedTarget) this.mx = this.my = 0.5; // pointer left the window: stop edge-turning
    });
    addEventListener('mousemove', (e) => {
      if (this.freeLook) {
        this.mx = e.clientX / innerWidth;
        this.my = e.clientY / innerHeight;
      }
      if (!this.capturing) return;
      // guard against the occasional huge spurious delta some browsers emit
      if (Math.abs(e.movementX) > 500 || Math.abs(e.movementY) > 500) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    addEventListener('mousedown', (e) => {
      if (!this.capturing || (this.freeLook && e.target !== canvas)) return;
      if (e.button === 0) {
        this.fire = true;
        this.fireHit = true;
      }
      if (e.button === 2) this.ads = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fire = false;
      if (e.button === 2) this.ads = false;
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => {
      if (this.capturing) this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) this.lockFails = 0;
      else {
        this.lastUnlock = performance.now();
        this.fire = false;
        this.ads = false;
      }
      G.game?.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      if (!this._lockPromise) this.onLockFail(); // older browsers report failures only through this event
      G.game?.onLockChange(false);
    });

    if (this.isTouch) this.initTouch();
  }

  // True while mouse input should drive the game (captured pointer, or free-look during play).
  get capturing() {
    return this.locked || (this.freeLook && G.state === 'playing' && !G.paused);
  }

  lock() {
    if (this.isTouch || this.freeLook) return;
    if (!this.canvas.requestPointerLock) return this.enableFreeLook();
    try {
      const p = this.canvas.requestPointerLock();
      this._lockPromise = !!(p && p.catch);
      if (this._lockPromise) p.catch((e) => this.onLockFail(e));
    } catch (e) {
      this.onLockFail(e);
    }
  }

  onLockFail(e) {
    // Embeds that forbid pointer lock reject with SecurityError or WrongDocumentError ("root document ...
    // not valid for pointer lock"): that never changes, so fall back at once.
    const blocked = e && (e.name === 'SecurityError' || e.name === 'WrongDocumentError' || /not valid for pointer lock|sandbox/i.test(e.message || ''));
    if (blocked) return this.enableFreeLook();
    // Browsers also refuse to re-lock for about a second after Esc; that is not a real failure.
    if (performance.now() - this.lastUnlock < 1600) return;
    if (++this.lockFails >= 2) this.enableFreeLook();
  }

  enableFreeLook() {
    if (this.freeLook) return;
    this.freeLook = true;
    G.game?.onFreeLook();
  }

  // Free-look only: keep turning while the pointer rests near a screen edge, since it cannot move past it.
  edgeTurn(dt) {
    const zone = (v, z) => (v < z ? -(z - v) / z : v > 1 - z ? (v - (1 - z)) / z : 0);
    const ex = zone(this.mx, 0.16), ey = zone(this.my, 0.12);
    this.dx += Math.sign(ex) * ex * ex * 1100 * dt;
    this.dy += Math.sign(ey) * ey * ey * 600 * dt;
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  key(code) {
    return this.keys.has(code);
  }
  hit(code) {
    return this.hits.has(code);
  }

  endFrame() {
    this.hits.clear();
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.fireHit = false;
  }

  // ------------------------------------------------------------ touch
  initTouch() {
    document.body.classList.add('touch');
    const root = el('touch');
    const stick = el('t-stick'), knob = el('t-knob');
    let joyId = null, lookId = null, jx = 0, jy = 0, lx = 0, ly = 0;
    const R = 56;

    const btn = (id, down, up) => {
      const b = el(id);
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        b.classList.add('on');
        down(e);
      }, { passive: false });
      const end = (e) => {
        e.preventDefault();
        e.stopPropagation();
        b.classList.remove('on');
        up && up(e);
      };
      b.addEventListener('touchend', end, { passive: false });
      b.addEventListener('touchcancel', end, { passive: false });
      return b;
    };

    // fire button doubles as a look pad so you can track targets while shooting
    let fireId = null, fx = 0, fy = 0;
    const fb = el('t-fire');
    fb.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const t = e.changedTouches[0];
      fireId = t.identifier;
      fx = t.clientX;
      fy = t.clientY;
      this.fire = true;
      this.fireHit = true;
      fb.classList.add('on');
    }, { passive: false });
    fb.addEventListener('touchmove', (e) => {
      e.preventDefault();
      e.stopPropagation();
      for (const t of e.changedTouches)
        if (t.identifier === fireId) {
          this.dx += (t.clientX - fx) * 2.2;
          this.dy += (t.clientY - fy) * 2.2;
          fx = t.clientX;
          fy = t.clientY;
        }
    }, { passive: false });
    const fend = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.fire = false;
      fireId = null;
      fb.classList.remove('on');
    };
    fb.addEventListener('touchend', fend, { passive: false });
    fb.addEventListener('touchcancel', fend, { passive: false });

    btn('t-jump', () => this.hits.add('Space'));
    btn('t-reload', () => this.hits.add('KeyR'));
    btn('t-swap', () => this.hits.add('TouchSwap'));
    btn('t-dash', () => this.hits.add('KeyQ'));
    btn('t-nade', () => this.hits.add('KeyG'));
    btn('t-use', () => this.hits.add('KeyE'));
    btn('t-crouch', () => this.keys.add('KeyC'), () => this.keys.delete('KeyC'));
    btn('t-ads', () => (this.ads = !this.ads));
    btn('t-pause', () => G.game?.pause());

    root.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.45 && joyId === null) {
          joyId = t.identifier;
          jx = t.clientX;
          jy = t.clientY;
          stick.style.left = jx + 'px';
          stick.style.top = jy + 'px';
          stick.classList.add('on');
        } else if (lookId === null) {
          lookId = t.identifier;
          lx = t.clientX;
          ly = t.clientY;
        }
      }
    }, { passive: false });
    root.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) {
          let dx = t.clientX - jx, dy = t.clientY - jy;
          const d = Math.hypot(dx, dy);
          if (d > R) {
            dx *= R / d;
            dy *= R / d;
          }
          knob.style.transform = `translate(${dx}px,${dy}px)`;
          this.joy.x = dx / R;
          this.joy.y = -dy / R;
          this.sprintHeld = d > R * 1.5 && this.joy.y > 0.6;
        } else if (t.identifier === lookId) {
          this.dx += (t.clientX - lx) * 2.2;
          this.dy += (t.clientY - ly) * 2.2;
          lx = t.clientX;
          ly = t.clientY;
        }
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) {
          joyId = null;
          this.joy.x = this.joy.y = 0;
          this.sprintHeld = false;
          knob.style.transform = '';
          stick.classList.remove('on');
        } else if (t.identifier === lookId) lookId = null;
      }
    };
    root.addEventListener('touchend', end);
    root.addEventListener('touchcancel', end);
  }

  moveX() {
    return clamp((this.key('KeyD') || this.key('ArrowRight') ? 1 : 0) - (this.key('KeyA') || this.key('ArrowLeft') ? 1 : 0) + this.joy.x, -1, 1);
  }
  moveY() {
    return clamp((this.key('KeyW') || this.key('ArrowUp') ? 1 : 0) - (this.key('KeyS') || this.key('ArrowDown') ? 1 : 0) + this.joy.y, -1, 1);
  }
}
