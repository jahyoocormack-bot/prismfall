// Monetization layer. One interface, several ad providers:
//   crazygames        CrazyGames SDK v3
//   poki              Poki SDK v2
//   gamedistribution  GameDistribution HTML5 SDK
//   gamemonetize      GameMonetize SDK
//   adsense           Google AdSense "H5 Games Ads" (Ad Placement API) for self-hosting
//   debug             local placeholder so the flow can be tested without a network (?ads=debug)
//   none              no ads; rewarded buttons are hidden
// Configure in index.html (window.PRISMFALL_ADS) or override with ?ads=<provider>.
import { G } from './ctx.js';
import { el } from './utils.js';

const loadScript = (src, attrs = {}) =>
  new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    for (const k in attrs) s.setAttribute(k, attrs[k]);
    s.onload = res;
    s.onerror = () => rej(new Error('failed to load ' + src));
    document.head.appendChild(s);
  });
const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

function detect(cfg) {
  const q = new URLSearchParams(location.search).get('ads');
  if (q) return q;
  if (cfg.provider && cfg.provider !== 'auto') return cfg.provider;
  const h = location.hostname;
  if (/crazygames\./.test(h) || /1001juegos\.com/.test(h)) return 'crazygames';
  if (/poki\.|poki-gdn\.com|poki-cdn\.com/.test(h)) return 'poki';
  if (/gamedistribution\.com/.test(h) && cfg.gameId) return 'gamedistribution';
  if (/gamemonetize\./.test(h) && cfg.gameId) return 'gamemonetize';
  return 'none';
}

export const Ads = {
  provider: 'none',
  hasRewarded: false,
  showing: false,
  lastInterstitial: 0,
  _gdResolve: null,
  _gdReward: false,

  async init() {
    const cfg = window.PRISMFALL_ADS || {};
    const want = detect(cfg);
    try {
      if (want === 'crazygames') {
        await timeout(loadScript('https://sdk.crazygames.com/crazygames-sdk-v3.js'), 6000);
        await timeout(window.CrazyGames.SDK.init(), 6000);
        this.sdk = window.CrazyGames.SDK;
        this.sdk.game.loadingStart?.();
        this.hasRewarded = true;
      } else if (want === 'poki') {
        await timeout(loadScript('https://game-cdn.poki.com/scripts/v2/poki-sdk.js'), 6000);
        await timeout(window.PokiSDK.init(), 6000).catch(() => {}); // init rejects when an adblocker is active; the SDK still works
        this.sdk = window.PokiSDK;
        this.hasRewarded = true;
      } else if (want === 'gamedistribution' || want === 'gamemonetize') {
        const gd = want === 'gamedistribution';
        const onEvent = (e) => {
          if (e.name === 'SDK_GAME_PAUSE') this._begin();
          if (e.name === 'SDK_GAME_START') {
            this._end();
            if (this._gdResolve) {
              const r = this._gdResolve;
              this._gdResolve = null;
              r(this._gdReward);
            }
          }
          if (e.name === 'SDK_REWARDED_WATCH_COMPLETE') this._gdReward = true;
        };
        if (gd) window.GD_OPTIONS = { gameId: cfg.gameId, onEvent };
        else window.SDK_OPTIONS = { gameId: cfg.gameId, onEvent };
        await timeout(loadScript(gd ? 'https://html5.api.gamedistribution.com/main.min.js' : 'https://api.gamemonetize.com/sdk.js'), 6000);
        this.hasRewarded = gd;
      } else if (want === 'adsense') {
        if (!cfg.adsenseClient) throw new Error('adsenseClient missing');
        const attrs = { 'data-ad-client': cfg.adsenseClient, 'data-ad-frequency-hint': '45s', crossorigin: 'anonymous' };
        if (cfg.adsenseTest) attrs['data-adbreak-test'] = 'on';
        await timeout(loadScript('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(cfg.adsenseClient), attrs), 6000);
        window.adsbygoogle = window.adsbygoogle || [];
        this.adBreak = this.adConfig = (o) => window.adsbygoogle.push(o);
        this.adConfig({ preloadAdBreaks: 'on', sound: 'on' });
        this.hasRewarded = true;
      } else if (want === 'debug') {
        this.hasRewarded = true;
      }
      this.provider = want;
    } catch (err) {
      console.warn('[ads] provider "' + want + '" unavailable, continuing without ads:', err.message);
      this.provider = 'none';
      this.hasRewarded = false;
    }
    return this.provider;
  },

  _begin() {
    this.showing = true;
    G.audio?.muteForAd(true);
  },
  _end() {
    this.showing = false;
    G.audio?.muteForAd(false);
  },

  loadingDone() {
    try {
      if (this.provider === 'crazygames') this.sdk.game.loadingStop?.();
      if (this.provider === 'poki') this.sdk.gameLoadingFinished();
    } catch (e) {
      /* non-fatal */
    }
  },
  gameplayStart() {
    try {
      if (this.provider === 'crazygames') this.sdk.game.gameplayStart();
      if (this.provider === 'poki') this.sdk.gameplayStart();
    } catch (e) {
      /* non-fatal */
    }
  },
  gameplayStop() {
    try {
      if (this.provider === 'crazygames') this.sdk.game.gameplayStop();
      if (this.provider === 'poki') this.sdk.gameplayStop();
    } catch (e) {
      /* non-fatal */
    }
  },
  happy() {
    try {
      if (this.provider === 'crazygames') this.sdk.game.happytime();
    } catch (e) {
      /* non-fatal */
    }
  },

  // Interstitial between rounds. Always resolves (never blocks the game on an ad failure).
  interstitial() {
    if (this.showing || this.provider === 'none') return Promise.resolve();
    return this._run(false).then(() => {
      this.lastInterstitial = performance.now();
    });
  },

  // Rewarded ad. Resolves true only if the player earned the reward.
  rewarded() {
    if (this.showing || !this.hasRewarded) return Promise.resolve(false);
    return this._run(true);
  },

  _run(reward) {
    const p = new Promise((resolve) => {
      const done = (ok) => {
        this._end();
        resolve(!!ok);
      };
      try {
        switch (this.provider) {
          case 'crazygames':
            this.sdk.ad.requestAd(reward ? 'rewarded' : 'midgame', {
              adStarted: () => this._begin(),
              adFinished: () => done(true),
              adError: () => done(false),
            });
            break;
          case 'poki':
            (reward ? this.sdk.rewardedBreak(() => this._begin()) : this.sdk.commercialBreak(() => this._begin())).then((ok) => done(reward ? ok : true), () => done(false));
            break;
          case 'gamedistribution':
            this._gdReward = false;
            this._gdResolve = (r) => resolve(reward ? r : true);
            window.gdsdk.showAd(reward ? 'rewarded' : undefined).catch(() => {
              this._gdResolve = null;
              done(false);
            });
            setTimeout(() => !this.showing && this._gdResolve && done(false), 5000); // no fill
            break;
          case 'gamemonetize':
            this._gdResolve = () => resolve(true);
            window.sdk.showBanner();
            setTimeout(() => !this.showing && this._gdResolve && done(false), 5000); // no fill
            break;
          case 'adsense': {
            let viewed = false;
            const common = { beforeAd: () => this._begin(), afterAd: () => this._end(), adBreakDone: () => done(viewed || !reward) };
            if (reward) this.adBreak({ type: 'reward', name: 'reward', beforeReward: (show) => show(), adViewed: () => (viewed = true), adDismissed: () => (viewed = false), ...common });
            else this.adBreak({ type: 'next', name: 'round-end', ...common });
            break;
          }
          case 'debug': {
            this._begin();
            const layer = el('adlayer'), cnt = el('ad-count');
            layer.classList.remove('hidden');
            let n = 3;
            cnt.textContent = n;
            const iv = setInterval(() => {
              cnt.textContent = --n;
              if (n <= 0) {
                clearInterval(iv);
                layer.classList.add('hidden');
                done(true);
              }
            }, 700);
            break;
          }
          default:
            done(false);
        }
      } catch (err) {
        console.warn('[ads] request failed:', err);
        done(false);
      }
    });
    // safety net: never leave the game stuck behind an ad that failed to report back
    return Promise.race([p, new Promise((r) => setTimeout(() => r(false), 90000))]).then((ok) => {
      this._gdResolve = null;
      if (this.showing) this._end();
      return ok;
    });
  },
};
