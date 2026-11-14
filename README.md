# PRISMFALL — Arena Royale

**Play it now: https://jahyoocormack-bot.github.io/prismfall/**

A complete, original 3D browser shooter. No build step, no downloads for the player, no external assets.

- **Royale** — glide onto a neon island, loot weapons by rarity, outlast 19 AI rivals while the storm closes.
- **Deathmatch** — 8-player respawn brawl in Neon Plaza, first to 20 eliminations (6-minute cap).
- One hand-laid island with 15 named areas joined by a road network: Neon Plaza, Dockyard, the Reactor, Crystal Ridge, Sunset Villa, four watch posts, plus the Scrapyard, the Ruins, a Broken Highway overpass, the Bunker Line, a Relay Station and a road Checkpoint. Terraced cliffs, road cuts and a toxic crater lake break up the ground between them.
- A megacity skyline, sweeping searchlights, holo-billboards, patrol drones and burning wrecks set the mood.
- 6 weapons (pistol, rifle, SMG, shotgun, scoped sniper, rocket launcher) + frag grenades, 4 rarities.
- Sprint, slide, blink-dash, jump pads, aim-down-sights, headshots, shields, damage numbers, kill feed, minimap, compass, scoreboard.
- Progression: XP levels, coins, daily bonus, a Locker with 8 weapon wraps and 5 tracer colours, saved in the browser.
- Three bot difficulties, three graphics presets with automatic fallback, keyboard/mouse and touch controls.
- All visuals are procedural (three.js) and all audio is synthesised at runtime, so there are no third-party art, music or sound licences to clear.

## Play it locally

Browsers block ES modules on `file://`, so serve the folder over HTTP:

```bash
python3 serve.py
```

Then open <http://localhost:8080>. Any static server works (`npx serve`, nginx, etc.).

## What to upload

The upload build is a zip of the game files only (no README, promo art or dev server). It contains exactly:

```
index.html   style.css   manifest.webmanifest
assets/      icons + social cover
lib/         three.js r170 (MIT) + post-processing addons
src/         game code (ES modules)
```

`index.html` is at the zip root, which is what itch.io, CrazyGames, Poki, GameDistribution and static hosts expect.
Create (or rebuild) the zip from this folder:

```bash
zip -r ../prismfall-upload.zip index.html style.css manifest.webmanifest assets lib src -x "*.DS_Store"
```

Store art is in `promo/`: five 1920×1080 gameplay screenshots and branded covers at 1920×1080, 800×800, 800×1200 and 630×500 (itch.io).

## Monetization

Everything goes through one module, `src/ads.js`, configured at the top of `index.html`:

```html
<script>
  window.PRISMFALL_ADS = { provider: 'auto', gameId: '', adsenseClient: '', adsenseTest: false };
</script>
```

| provider | Use for | What you set |
| --- | --- | --- |
| `auto` | Default. Detects CrazyGames and Poki by hostname, otherwise shows no ads | nothing |
| `crazygames` | CrazyGames (SDK v3) | nothing |
| `poki` | Poki (SDK v2) | nothing |
| `gamedistribution` | GameDistribution | `gameId` |
| `gamemonetize` | GameMonetize | `gameId` |
| `adsense` | Your own site with Google AdSense "H5 Games Ads" | `adsenseClient: 'ca-pub-…'` |
| `none` | No ads (e.g. a paid itch.io build) | nothing |

Where ads appear in the game:

- **Interstitial** — between matches, when the player presses *Play Again* or *Main Menu* on the results screen. Never during gameplay.
- **Rewarded** — *Double Coins* on the results screen and *+150 Coins* on the main menu. These buttons only appear when the active provider supports rewarded ads.
- Audio is muted and the simulation is frozen while an ad is showing; gameplay start/stop and loading events are reported to SDKs that want them.

Test the whole flow without a network by adding `?ads=debug` to the URL (shows a 3-second placeholder).

**Important:** the adapters follow each SDK's documented API but have not been run against the live SDKs, because that requires your publisher accounts. Before submitting, run the portal's own QA tool (CrazyGames QA tool, Poki Inspector, GameDistribution test page) and fix anything it flags in `src/ads.js`. Each adapter is about ten lines.

## Publishing checklist

**itch.io** — New project → Kind: HTML → upload `prismfall-upload.zip` → tick *This file will be played in the browser* → viewport 1280×720, enable *Fullscreen button* and *Mobile friendly (landscape)*. Leave `provider: 'auto'` (no ads) or use itch's pay-what-you-want.

**CrazyGames** — developer.crazygames.com → submit the zip. The SDK loads automatically on their domain. Use `promo/cover-1920x1080.png`, `cover-800x800.png` and `cover-800x1200.png` for the listing.

**Poki** — developers.poki.com → submit for review; Poki onboards games they accept. The SDK loads automatically on their domain.

**GameDistribution / GameMonetize** — create the game in their dashboard, copy the game id into `gameId`, set `provider`, re-zip, upload.

**Your own domain** — drop the folder on Netlify, Cloudflare Pages, Vercel or GitHub Pages. For ads, apply for AdSense H5 Games Ads, then set `provider: 'adsense'` and your client id. You will also need a privacy policy page and, for EU/UK visitors, a consent banner (Google's CMP or similar) — this build does not include one.

## Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move / look | WASD / mouse | left stick / drag right side |
| Fire / aim | LMB / RMB | FIRE / AIM |
| Jump / sprint | Space / Shift | JUMP / push stick fully forward |
| Crouch, slide | C (while sprinting to slide) | SLIDE |
| Dash / grenade | Q / G | DASH / FRAG |
| Reload / switch | R / 1-2-3, wheel, X | RELOAD / SWAP |
| Swap ground weapon | E | USE |
| Scoreboard / pause | Tab / Esc or P | — / II |

If the page is not allowed to capture the mouse (a sandboxed iframe or an in-app browser), the game detects the refusal and switches to **free-look**: mouse movement still turns the view, and resting the pointer near a screen edge keeps turning. Portals that grant pointer lock get normal captured-mouse aiming.

## Tuning

Almost every number lives in `src/config.js`: weapon stats, rarities, storm phases, bot difficulty, cosmetics and prices, XP curve, bot names. The island layout is generated in `src/world.js` from a fixed seed (`rng(1337)`), so the map is identical for every player.

| File | Responsibility |
| --- | --- |
| `main.js` | boot, render pipeline, quality presets, match flow |
| `world.js` | terrain, roads, original districts, scenery, sky, water, storm wall, minimap |
| `worldplus.js` | newer districts, vehicles and props, skyline, searchlights, billboards, drones, fires |
| `physics.js` | character collision, raycasts |
| `player.js` | first-person controller and weapon view model |
| `bots.js` | AI: perception, movement, aim, fire discipline |
| `match.js` | modes, loot, storm, damage, projectiles, scoring |
| `entities.js` | shared character + hitscan code |
| `models.js` | procedural weapon, character and pickup models |
| `fx.js` | particles, tracers, explosions |
| `audio.js` | synthesised SFX and music |
| `hud.js`, `ui.js` | in-game HUD; menus, locker, settings, results |
| `ads.js`, `save.js`, `input.js` | ad providers; profile storage; keyboard, mouse, touch |

URL switches for testing: `?ads=debug` (placeholder ads), `?ads=<provider>` (force a provider), `?nolock` (run without pointer lock).

## Known limits

- Opponents are AI. There is no online multiplayer or server component.
- Progress is stored in `localStorage` on the player's device; clearing site data resets it.
- Needs WebGL 2 and import maps: Chrome/Edge 89+, Firefox 108+, Safari 16.4+.
- Touch controls and the small-screen layout were checked in device emulation, not on physical phones.

## Licences

Game code, art direction and audio: yours to publish and monetize. three.js is MIT licensed (`lib/LICENSE-three.txt`); keep that file in the build.
