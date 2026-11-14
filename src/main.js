import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { G } from './ctx.js';
import { VERSION, levelInfo } from './config.js';
import { el, damp } from './utils.js';
import { loadProfile, saveProfile } from './save.js';
import { World } from './world.js';
import { FX } from './fx.js';
import { AudioSys } from './audio.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { Match } from './match.js';
import { Hud } from './hud.js';
import { UI } from './ui.js';
import { Ads } from './ads.js';

// Draws the first-person weapon scene on top of the world inside the post-processing chain.
class OverlayPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = false;
  }
  render(renderer, writeBuffer, readBuffer) {
    const old = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = old;
  }
}

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uHurt: { value: 0 }, uStorm: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uHurt,uStorm; varying vec2 vUv;
    void main(){ vec2 c=vUv-0.5; float r2=dot(c,c); float ca=(0.006+uHurt*0.02)*r2;
      vec3 col=vec3(texture2D(tDiffuse,vUv+c*ca).r, texture2D(tDiffuse,vUv).g, texture2D(tDiffuse,vUv-c*ca).b);
      float l=dot(col,vec3(0.2126,0.7152,0.0722));
      col=mix(vec3(l),col,1.14);
      col*=1.0-0.42*smoothstep(0.1,0.62,r2);
      col=mix(col,col*vec3(0.78,0.6,1.2),uStorm*0.6);
      col=mix(col,vec3(l)*vec3(1.25,0.45,0.5),uHurt*0.4*smoothstep(0.03,0.45,r2));
      gl_FragColor=vec4(col,1.0); }`,
};

const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

class Game {
  constructor() {
    this.last = performance.now();
    this.dyn = 1;
    this.stormK = 0;
    this.perfN = 0;
    this.perfSum = 0;
    this.perfSkip = 3;
    this.lockPending = false;
    this.noLock = new URLSearchParams(location.search).has('nolock');
    this.frame = this.frame.bind(this);
  }

  async boot() {
    G.game = this;
    G.profile = loadProfile();
    G.audio = this.audio = new AudioSys();
    G.ui = this.ui = new UI();
    const progress = (p, msg) => {
      el('load-fill').style.width = p + '%';
      if (msg) el('load-msg').textContent = msg;
    };
    try {
      const canvas = el('c');
      const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      G.renderer = renderer;
      G.scene = this.scene = new THREE.Scene();
      G.camera = this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 2600);
      this.camera.rotation.order = 'YXZ';

      progress(18, 'Raising the island…');
      await nextFrame();
      await nextFrame();
      G.world = this.world = new World(this.scene);
      G.phys = this.world.phys;

      progress(70, 'Loading the armory…');
      await nextFrame();
      G.fx = this.fx = new FX(this.scene);
      G.input = this.input = new Input(canvas);
      G.player = this.player = new Player();
      G.hud = this.hud = new Hud();
      this.autoQ = this.input.isTouch ? 'low' : 'medium';
      this.applyQuality();
      addEventListener('resize', () => this.resize());
      addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
      document.addEventListener('visibilitychange', () => document.hidden && this.pause());
      addEventListener('pointerdown', () => this.audio.init(), { once: true });
      addEventListener('keydown', () => this.audio.init(), { once: true });

      progress(88, 'Connecting…');
      await Ads.init();
      // render a couple of frames behind the loading screen so shaders are compiled before the menu appears
      this.menuCamera(0);
      this.world.update(0, this.camera, 0);
      this.render(0);
      await nextFrame();
      progress(100, 'Ready');
      await nextFrame();
    } catch (err) {
      console.error(err);
      el('err-msg').textContent = 'PRISMFALL could not start: ' + (err && err.message ? err.message : err) + '. Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration enabled.';
      this.ui.show('error');
      return;
    }

    this.dailyBonus();
    G.state = 'menu';
    this.ui.refresh();
    this.ui.show('menu');
    if (!G.profile.seenHowTo) {
      G.profile.seenHowTo = true;
      saveProfile(G.profile);
      this.ui.backTo = 'menu';
      this.ui.show('howto');
    }
    this.audio.music(true, 1);
    Ads.loadingDone();
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  dailyBonus() {
    const p = G.profile, today = new Date().toISOString().slice(0, 10);
    if (p.lastDaily === today) return;
    const first = p.lastDaily === '';
    p.lastDaily = today;
    p.coins += 100;
    saveProfile(p);
    setTimeout(() => this.ui.toast(first ? 'Welcome bonus: +100 coins' : 'Daily bonus: +100 coins'), 900);
  }

  // ------------------------------------------------------------ quality / sizing
  applyQuality() {
    const s = G.profile.settings.quality;
    const q = (this.q = s === 'auto' ? this.autoQ : s);
    const cap = q === 'high' ? 2 : q === 'medium' ? 1.5 : 1.25;
    this.pr = Math.max(0.6, Math.min(devicePixelRatio || 1, cap) * this.dyn);
    this.renderer.setPixelRatio(this.pr);
    this.world.setQuality(q);
    if (this.composer) {
      this.composer.dispose();
      this.bloom.dispose();
      this.composer = null;
    }
    if (q !== 'low') {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      const rt = new THREE.WebGLRenderTarget(Math.max(2, size.x), Math.max(2, size.y), { type: THREE.HalfFloatType, samples: q === 'high' ? 4 : 0 });
      const c = (this.composer = new EffectComposer(this.renderer, rt));
      c.addPass(new RenderPass(this.scene, this.camera));
      c.addPass(new OverlayPass(this.player.vm.scene, this.player.vm.cam));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.42, 0.55, 1.0);
      c.addPass(this.bloom);
      this.grade = new ShaderPass(GradeShader);
      c.addPass(this.grade);
      c.addPass(new OutputPass());
    }
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    if (w < 48 || h < 48) return; // hidden / collapsed embed: keep the last valid size
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.pr);
      this.composer.setSize(w, h);
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.player.vm.cam.aspect = w / h;
    this.player.vm.cam.updateProjectionMatrix();
  }

  // Auto quality: if the frame rate stays low, shed resolution first, then post-processing.
  perf(dt) {
    if (G.profile.settings.quality !== 'auto') return;
    if (this.perfSkip > 0) {
      this.perfSkip -= dt;
      return;
    }
    if (dt > 0.25) return; // tab switch / hitch, not a slow machine
    this.perfSum += dt;
    if (++this.perfN < 150) return;
    const avg = this.perfSum / this.perfN;
    this.perfN = 0;
    this.perfSum = 0;
    if (avg > 0.03) {
      if (this.dyn > 0.75) this.dyn -= 0.15;
      else if (this.autoQ !== 'low') {
        this.autoQ = 'low';
        this.dyn = 1;
      } else if (this.dyn > 0.65) this.dyn -= 0.15;
      else return;
      this.applyQuality();
      this.perfSkip = 2;
    }
  }

  // ------------------------------------------------------------ match flow
  startMatch(mode) {
    this.audio.init();
    if (G.match) G.match.dispose();
    this.lastMode = mode;
    G.match = new Match(mode);
    G.state = 'playing';
    G.paused = false;
    G.timeScale = 1;
    this.stormK = 0;
    this.ui.show(null);
    this.hud.show(true);
    el('touch').classList.toggle('hidden', !this.input.isTouch);
    this.camera.rotation.set(0, 0, 0);
    G.match.start();
    this.requestLock();
    Ads.gameplayStart();
    this.audio.music(true, 0.5);
    this.perfSkip = 3;
  }

  requestLock() {
    if (this.input.isTouch || this.noLock || this.input.freeLook) return;
    this.lockPending = true;
    this.input.lock();
    setTimeout(() => {
      if (G.state === 'playing' && !G.paused && !this.input.locked && !this.input.freeLook) el('click').classList.remove('hidden');
    }, 300);
  }

  // The page is not allowed to capture the mouse: play on without it instead of blocking on the overlay.
  onFreeLook() {
    this.lockPending = false;
    el('click').classList.add('hidden');
    this.last = performance.now();
    this.ui.toast('Mouse capture is blocked here — free-look on: rest the pointer near an edge to keep turning');
  }

  togglePause() {
    if (G.state !== 'playing') return;
    if (!G.paused) this.pause();
    else if (this.ui.current === 'pause') this.resume();
  }

  onLockChange(locked) {
    if (G.state !== 'playing' || this.input.freeLook) return;
    if (locked) {
      this.lockPending = false;
      el('click').classList.add('hidden');
      this.last = performance.now();
    } else if (!G.paused) {
      if (this.lockPending) el('click').classList.remove('hidden');
      else this.pause();
    }
  }

  pause() {
    if (G.state !== 'playing' || G.paused || !G.match || G.match.ended) return;
    G.paused = true;
    this.lockPending = false;
    el('click').classList.add('hidden');
    this.ui.show('pause');
    this.input.unlock();
    Ads.gameplayStop();
  }

  resume() {
    if (G.state !== 'playing') return;
    G.paused = false;
    this.ui.show(null);
    this.last = performance.now();
    this.requestLock();
    Ads.gameplayStart();
  }

  leaveToMenu() {
    if (G.match) G.match.dispose();
    G.match = null;
    G.state = 'menu';
    G.paused = false;
    this.hud.show(false);
    el('touch').classList.add('hidden');
    el('click').classList.add('hidden');
    this.input.unlock();
    this.player.vm.root.visible = false;
    this.ui.refresh();
    this.ui.show('menu');
    this.audio.music(true, 1);
  }

  quitMatch() {
    Ads.gameplayStop();
    this.leaveToMenu();
  }

  finishMatch() {
    const res = G.match.result, p = G.profile, before = levelInfo(p.xp);
    p.xp += res.xp;
    p.coins += res.coins;
    const after = levelInfo(p.xp);
    if (after.level > before.level) p.coins += (after.level - before.level) * 50; // level-up bonus
    p.stats.matches++;
    if (res.win) p.stats.wins++;
    p.stats.kills += res.kills;
    p.stats.deaths += res.deaths;
    p.stats.headshots += res.heads;
    p.stats.bestKills = Math.max(p.stats.bestKills, res.kills);
    saveProfile(p);
    Ads.gameplayStop();
    if (res.win) Ads.happy();
    G.match.dispose();
    G.match = null;
    G.state = 'results';
    this.hud.show(false);
    el('touch').classList.add('hidden');
    el('click').classList.add('hidden');
    this.input.unlock();
    this.player.vm.root.visible = false;
    this.audio.music(true, 1);
    this.ui.showResults(res, before);
  }

  async afterResults(again) {
    if (this.busy) return;
    this.busy = true;
    await Ads.interstitial();
    this.busy = false;
    if (again) this.startMatch(this.lastMode || 'royale');
    else this.leaveToMenu();
  }

  onCosmeticsChanged() {
    this.player.vm.refreshSkin();
  }

  resetProfile() {
    try {
      localStorage.removeItem('prismfall.profile.v1');
    } catch (e) {
      /* storage unavailable */
    }
    const keep = G.profile.settings;
    G.profile = loadProfile();
    G.profile.settings = keep;
    G.profile.lastDaily = new Date().toISOString().slice(0, 10);
    saveProfile(G.profile);
    this.onCosmeticsChanged();
  }

  // ------------------------------------------------------------ frame
  menuCamera(dt) {
    const a = G.time * 0.045 + 0.9, cam = this.camera;
    cam.position.set(Math.cos(a) * 76, 27 + Math.sin(G.time * 0.2) * 3, Math.sin(a) * 76);
    cam.lookAt(0, 9, 0);
    if (Math.abs(cam.fov - 52) > 0.01) {
      cam.fov = damp(cam.fov, 52, 3, dt || 1);
      cam.updateProjectionMatrix();
    }
    this.player.vm.root.visible = false;
  }

  render(dt) {
    const r = this.renderer;
    if (r.domElement.width < 48 || r.domElement.height < 48) return;
    this.fx.resize(r.domElement.height, this.camera.fov);
    if (this.composer) {
      this.grade.uniforms.uHurt.value = G.state === 'playing' ? this.hud.hurtA : 0;
      this.grade.uniforms.uStorm.value = this.stormK;
      this.composer.render(dt);
    } else {
      r.setRenderTarget(null);
      r.autoClear = false;
      r.clear();
      r.render(this.scene, this.camera);
      r.clearDepth();
      r.render(this.player.vm.scene, this.player.vm.cam);
    }
  }

  frame(now) {
    requestAnimationFrame(this.frame);
    const raw = (now - this.last) / 1000;
    this.last = now;
    const dt = Math.min(0.05, Math.max(0, raw));
    G.time += dt;
    const I = this.input;
    const sim = G.state === 'playing' && !G.paused && !Ads.showing && (I.locked || I.isTouch || I.freeLook || this.noLock);
    const fl = sim && I.freeLook;
    if (fl !== this._fl) document.body.classList.toggle('fl-play', (this._fl = fl));
    let wdt = dt;
    if (G.state === 'playing') {
      wdt = 0;
      if (sim) {
        const M = G.match;
        wdt = dt * G.timeScale;
        if (I.freeLook) I.edgeTurn(dt);
        M.update(wdt);
        this.stormK = damp(this.stormK, this.hud.inStorm ? 1 : 0, 3, dt);
        this.hud.update(dt);
        this.perf(raw);
        if (M.ended && (M.endT -= dt) <= 0) this.finishMatch();
      }
    } else {
      this.stormK = damp(this.stormK, 0, 3, dt);
      this.menuCamera(dt);
    }
    this.camera.updateMatrixWorld();
    this.world.update(wdt, this.camera, this.stormK);
    this.fx.update(wdt, this.camera);
    this.render(dt);
    this.input.endFrame();
  }
}

console.log(`%cPRISMFALL v${VERSION}`, 'color:#ff3fa4;font-weight:900;font-size:14px');
new Game().boot();
