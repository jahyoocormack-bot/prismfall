import { G } from './ctx.js';
import { WRAPS, TRACERS, MODES, levelInfo } from './config.js';
import { el, esc, fmtTime } from './utils.js';
import { saveProfile } from './save.js';
import { Ads } from './ads.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// Menus, locker (shop), settings and results screens.
export class UI {
  constructor() {
    this.current = 'loading';
    this.backTo = 'menu';
    this.screens = [...document.querySelectorAll('.screen')];

    el('screens').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act],[data-diff],[data-wrap],[data-tracer]');
      if (!b) return;
      G.audio.init();
      if (b.dataset.diff) return this.setDiff(b.dataset.diff);
      if (b.dataset.wrap) return this.buyOrEquip('wraps', 'wrap', WRAPS, b.dataset.wrap);
      if (b.dataset.tracer) return this.buyOrEquip('tracers', 'tracer', TRACERS, b.dataset.tracer);
      G.audio.play('ui');
      this.act(b.dataset.act);
    });
    el('screens').addEventListener('mouseover', (e) => {
      const b = e.target.closest('.btn,.card');
      if (b && b !== this._hover) G.audio.play('hover');
      this._hover = b;
    });
    el('click').addEventListener('click', () => G.game.requestLock());

    // settings bindings
    const S = () => G.profile.settings;
    const bind = (id, key, out, fmt, after) => {
      const inp = el(id);
      inp.addEventListener('input', () => {
        S()[key] = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? parseFloat(inp.value) : inp.value;
        if (out) el(out).textContent = fmt(S()[key]);
        saveProfile(G.profile);
        after && after();
      });
    };
    bind('set-sens', 'sens', 'o-sens', (v) => v.toFixed(2) + '×');
    bind('set-fov', 'fov', 'o-fov', (v) => v + '°');
    bind('set-vol', 'volume', 'o-vol', (v) => Math.round(v * 100) + '%', () => G.audio.applyVolumes());
    bind('set-mus', 'music', 'o-mus', (v) => Math.round(v * 100) + '%', () => G.audio.applyVolumes());
    bind('set-q', 'quality', null, null, () => G.game.applyQuality());
    bind('set-inv', 'invertY');
  }

  show(name) {
    this.current = name;
    for (const s of this.screens) s.classList.toggle('on', s.id === 's-' + name);
  }

  act(a) {
    const game = G.game;
    switch (a) {
      case 'play-royale': return game.startMatch('royale');
      case 'play-deathmatch': return game.startMatch('deathmatch');
      case 'locker': this.backTo = this.current; this.renderLocker(); return this.show('locker');
      case 'settings': this.backTo = this.current; this.syncSettings(); return this.show('settings');
      case 'howto': this.backTo = this.current; return this.show('howto');
      case 'back': return this.show(this.backTo);
      case 'resume': return game.resume();
      case 'quit': return game.quitMatch();
      case 'again': return game.afterResults(true);
      case 'menu': return game.afterResults(false);
      case 'double': return this.doubleCoins();
      case 'free-coins': return this.freeCoins();
      case 'reset-progress': return this.resetProgress();
      case 'fullscreen': return this.fullscreen();
    }
  }

  fullscreen() {
    const d = document, root = d.documentElement;
    try {
      if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else {
        const p = (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
        if (p && p.catch) p.catch(() => {});
      }
    } catch (e) {
      /* fullscreen not permitted in this embed */
    }
  }

  toast(msg) {
    const d = document.createElement('div');
    d.textContent = msg;
    el('gtoast').appendChild(d);
    setTimeout(() => d.remove(), 3200);
  }

  // ------------------------------------------------------------ main menu
  refresh() {
    const p = G.profile, li = levelInfo(p.xp);
    el('m-level').textContent = li.level;
    el('m-xp').style.width = (li.into / li.need) * 100 + '%';
    el('m-coins').textContent = p.coins.toLocaleString();
    el('l-coins').textContent = p.coins.toLocaleString();
    const s = p.stats;
    el('m-stats').innerHTML = `<div><b>${s.matches}</b>MATCHES</div><div><b>${s.wins}</b>WINS</div><div><b>${s.kills}</b>ELIMS</div><div><b>${s.bestKills}</b>BEST GAME</div>`;
    for (const b of el('diff-btns').children) b.classList.toggle('on', b.dataset.diff === p.settings.difficulty);
    el('free-coins').classList.toggle('hidden', !Ads.hasRewarded);
  }

  setDiff(d) {
    G.profile.settings.difficulty = d;
    saveProfile(G.profile);
    G.audio.play('ui');
    this.refresh();
  }

  async freeCoins() {
    if (await Ads.rewarded()) {
      G.profile.coins += 150;
      saveProfile(G.profile);
      G.audio.play('buy');
      this.toast('+150 coins');
      this.refresh();
    }
  }

  // ------------------------------------------------------------ locker / shop
  renderLocker() {
    const p = G.profile;
    const card = (kind, it, owned, eq, sw) => `
      <button class="card${eq ? ' eq' : ''}${owned ? '' : ' locked'}" data-${kind}="${it.id}">
        <div class="sw" style="${sw}"></div>
        <div class="nm">${esc(it.name)}</div>
        <div class="pr">${eq ? '✓ EQUIPPED' : owned ? 'OWNED · TAP TO EQUIP' : `<i class="coin-ic"></i>${it.price.toLocaleString()}`}</div>
      </button>`;
    el('wraps').innerHTML = WRAPS.map((w) => card('wrap', w, p.owned.wraps.includes(w.id), p.wrap === w.id,
      `background:linear-gradient(115deg, ${hex(w.base)} 0 52%, ${hex(w.accent)} 52% 100%);--g:${hex(w.glow)}`)).join('');
    el('tracers').innerHTML = TRACERS.map((t) => card('tracer', t, p.owned.tracers.includes(t.id), p.tracer === t.id,
      `background:radial-gradient(ellipse at 30% 50%, ${hex(t.color)}55, #120d33 70%);--g:${hex(t.color)}`)).join('');
    el('l-coins').textContent = p.coins.toLocaleString();
  }

  buyOrEquip(ownedKey, eqKey, list, id) {
    const p = G.profile, it = list.find((x) => x.id === id);
    if (!it) return;
    if (!p.owned[ownedKey].includes(id)) {
      if (p.coins < it.price) {
        G.audio.play('deny');
        return this.toast(`Need ${(it.price - p.coins).toLocaleString()} more coins`);
      }
      p.coins -= it.price;
      p.owned[ownedKey].push(id);
      G.audio.play('buy');
      this.toast(`Unlocked ${it.name}`);
    } else G.audio.play('ui');
    p[eqKey] = id;
    saveProfile(p);
    G.game.onCosmeticsChanged();
    this.renderLocker();
    this.refresh();
  }

  // ------------------------------------------------------------ settings
  syncSettings() {
    const s = G.profile.settings;
    el('set-sens').value = s.sens;
    el('o-sens').textContent = s.sens.toFixed(2) + '×';
    el('set-fov').value = s.fov;
    el('o-fov').textContent = s.fov + '°';
    el('set-vol').value = s.volume;
    el('o-vol').textContent = Math.round(s.volume * 100) + '%';
    el('set-mus').value = s.music;
    el('o-mus').textContent = Math.round(s.music * 100) + '%';
    el('set-q').value = s.quality;
    el('set-inv').checked = s.invertY;
  }

  resetProgress() {
    if (!this._resetArmed) {
      this._resetArmed = true;
      this.toast('Press again to erase coins, XP and unlocks');
      setTimeout(() => (this._resetArmed = false), 4000);
      return;
    }
    this._resetArmed = false;
    G.game.resetProfile();
    this.syncSettings();
    this.refresh();
    this.toast('Progress reset');
  }

  // ------------------------------------------------------------ results
  showResults(res, before) {
    this.res = res;
    this.doubled = false;
    const p = G.profile, after = levelInfo(p.xp);
    el('r-mode').textContent = MODES[res.mode].name;
    const t = el('r-title');
    t.textContent = res.win ? (res.mode === 'royale' ? 'PRISM CHAMPION' : 'MATCH WON') : res.mode === 'royale' ? 'ELIMINATED' : 'DEFEAT';
    t.classList.toggle('lose', !res.win);
    el('r-sub').textContent = `You placed #${res.place} of ${res.total}`;
    const cells = [[res.kills, 'ELIMS'], [res.dmg, 'DAMAGE'], [res.acc + '%', 'ACCURACY'], res.mode === 'royale' ? [fmtTime(res.time), 'SURVIVED'] : [res.deaths, 'DEATHS']];
    el('r-stats').innerHTML = cells.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
    el('r-level').textContent = before.level;
    el('r-xp').style.transition = 'none';
    el('r-xp').style.width = (before.into / before.need) * 100 + '%';
    el('r-xp-txt').textContent = `+${res.xp} XP`;
    el('r-coins').textContent = `+${res.coins}`;
    const up = after.level > before.level;
    el('r-levelup').classList.add('hidden');
    el('r-double').classList.toggle('hidden', !Ads.hasRewarded);
    this.show('results');
    setTimeout(() => {
      el('r-xp').style.transition = '';
      el('r-xp').style.width = up ? '100%' : (after.into / after.need) * 100 + '%';
      if (up)
        setTimeout(() => {
          el('r-level').textContent = after.level;
          el('r-levelup').classList.remove('hidden');
          el('r-xp').style.transition = 'none';
          el('r-xp').style.width = '0%';
          G.audio.play('buy');
          setTimeout(() => {
            el('r-xp').style.transition = '';
            el('r-xp').style.width = (after.into / after.need) * 100 + '%';
          }, 60);
        }, 950);
    }, 350);
  }

  async doubleCoins() {
    if (this.doubled || !this.res) return;
    if (await Ads.rewarded()) {
      this.doubled = true;
      G.profile.coins += this.res.coins;
      saveProfile(G.profile);
      el('r-coins').textContent = `+${this.res.coins * 2}`;
      el('r-double').classList.add('hidden');
      G.audio.play('buy');
    }
  }
}
