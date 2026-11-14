export const VERSION = '1.0.0';
export const GAME_TITLE = 'PRISMFALL';

export const WORLD = { size: 420, islandR: 172, boundR: 186, waterY: -0.9 };

export const RARITY = [
  { name: 'Common', color: 0xb8c4d6, css: '#b8c4d6', mult: 1.0 },
  { name: 'Rare', color: 0x3fa9ff, css: '#3fa9ff', mult: 1.1 },
  { name: 'Epic', color: 0xc05bff, css: '#c05bff', mult: 1.2 },
  { name: 'Legendary', color: 0xffb52e, css: '#ffb52e', mult: 1.32 },
];

// falloff: [fullDamageUntil, minDamageFrom, minMultiplier]
export const WEAPONS = {
  sidearm: {
    name: 'Sidekick', tag: 'PISTOL', kind: 'hitscan', dmg: 24, rpm: 380, auto: false, mag: 12, reserve: Infinity,
    reload: 1.1, hip: 0.012, ads: 0.004, bloom: 0.012, recoil: 0.014, falloff: [22, 55, 0.5], head: 1.8,
    zoom: 1.25, speed: 1.05, botRange: 14, loot: 0,
  },
  carbine: {
    name: 'Pulse Carbine', tag: 'RIFLE', kind: 'hitscan', dmg: 21, rpm: 560, auto: true, mag: 30, reserve: 90,
    reload: 1.9, hip: 0.018, ads: 0.005, bloom: 0.0045, recoil: 0.0085, falloff: [40, 90, 0.6], head: 1.6,
    zoom: 1.4, speed: 1.0, botRange: 24, loot: 26,
  },
  smg: {
    name: 'Buzzkill', tag: 'SMG', kind: 'hitscan', dmg: 14, rpm: 900, auto: true, mag: 36, reserve: 144,
    reload: 1.6, hip: 0.026, ads: 0.012, bloom: 0.004, recoil: 0.006, falloff: [16, 40, 0.45], head: 1.5,
    zoom: 1.25, speed: 1.06, botRange: 12, loot: 22,
  },
  shotgun: {
    name: 'Scatterjack', tag: 'SHOTGUN', kind: 'hitscan', dmg: 11, pellets: 9, rpm: 75, auto: false, mag: 6, reserve: 24,
    reload: 2.3, hip: 0.075, ads: 0.06, bloom: 0, recoil: 0.05, falloff: [9, 24, 0.2], head: 1.4,
    zoom: 1.15, speed: 1.0, botRange: 7, loot: 20,
  },
  sniper: {
    name: 'Longshot', tag: 'SNIPER', kind: 'hitscan', dmg: 105, rpm: 42, auto: false, mag: 4, reserve: 16,
    reload: 2.6, hip: 0.05, ads: 0.0004, bloom: 0.05, recoil: 0.06, falloff: [200, 320, 0.9], head: 2.2,
    zoom: 4.2, scope: true, speed: 0.94, botRange: 55, loot: 12,
  },
  launcher: {
    name: 'Thumper', tag: 'LAUNCHER', kind: 'rocket', dmg: 115, radius: 6.5, rpm: 50, auto: false, mag: 2, reserve: 6,
    reload: 2.6, hip: 0.01, ads: 0.004, bloom: 0, recoil: 0.05, falloff: [999, 999, 1], head: 1,
    zoom: 1.2, speed: 0.92, botRange: 22, loot: 6,
  },
};
export const WEAPON_IDS = Object.keys(WEAPONS);

export const WRAPS = [
  { id: 'stock', name: 'Factory', price: 0, base: 0x3a3f5c, accent: 0xe8ecf5, glow: 0x39e6ff },
  { id: 'magma', name: 'Magma', price: 300, base: 0x2a1a1a, accent: 0xff5a1f, glow: 0xffa200 },
  { id: 'toxic', name: 'Toxic', price: 300, base: 0x1f2a1f, accent: 0x8dff2f, glow: 0xc8ff00 },
  { id: 'glacier', name: 'Glacier', price: 500, base: 0xdff4ff, accent: 0x54b8ff, glow: 0x9be8ff },
  { id: 'sakura', name: 'Sakura', price: 500, base: 0xffd3e8, accent: 0xff5fa2, glow: 0xff7ac8 },
  { id: 'void', name: 'Voidwalker', price: 800, base: 0x15101f, accent: 0x7a3cff, glow: 0xc26bff },
  { id: 'gold', name: 'Solid Gold', price: 1200, base: 0xffc83a, accent: 0xfff3c2, glow: 0xffe07a },
  { id: 'prism', name: 'Prism', price: 2000, base: 0xf5f5ff, accent: 0xff4fd8, glow: 0x4ffff0 },
];

export const TRACERS = [
  { id: 'volt', name: 'Volt', price: 0, color: 0x6ef3ff },
  { id: 'ember', name: 'Ember', price: 250, color: 0xff8a3c },
  { id: 'venom', name: 'Venom', price: 250, color: 0x9dff3c },
  { id: 'orchid', name: 'Orchid', price: 400, color: 0xff5fe0 },
  { id: 'solar', name: 'Solar', price: 600, color: 0xffe14a },
];

export const DIFF = {
  easy: { label: 'CHILL', aimErr: 0.08, react: 0.85, dmg: 0.3, turn: 4.5, sight: 55 },
  normal: { label: 'STANDARD', aimErr: 0.055, react: 0.55, dmg: 0.48, turn: 6.5, sight: 70 },
  hard: { label: 'SWEATY', aimErr: 0.03, react: 0.3, dmg: 0.85, turn: 9, sight: 90 },
};

export const MODES = {
  royale: { name: 'ROYALE', desc: 'Drop in. Loot up. Outlast 19 rivals as the storm closes.', bots: 19 },
  deathmatch: { name: 'DEATHMATCH', desc: 'Respawn brawl in Neon Plaza. First to 20 eliminations wins.', bots: 7, target: 20, time: 360 },
};

export const STORM_PHASES = [
  { wait: 40, shrink: 35, r: 115, dmg: 1 },
  { wait: 30, shrink: 30, r: 72, dmg: 2 },
  { wait: 25, shrink: 25, r: 42, dmg: 4 },
  { wait: 20, shrink: 22, r: 20, dmg: 7 },
  { wait: 15, shrink: 20, r: 0.5, dmg: 12 },
];

export const BOT_NAMES = [
  'Zapdog', 'NovaKid', 'Glitchy', 'MangoRush', 'Pixelle', 'Dr. Bonk', 'Sprocket', 'Vexa', 'Turbo Tim', 'Lumen',
  'Kazoo', 'Biscuit', 'Riptide', 'Jinxy', 'Moxie', 'Gizmo', 'Fizz', 'Neonna', 'Quasar', 'Bolt', 'Wobble', 'Pogo',
  'Sizzle', 'Echo', 'Tango', 'Nimbus', 'Zesty', 'Rocket Ron', 'Peaches', 'Static', 'Blip', 'Vandal', 'Orbit',
  'Kiwi', 'Shiver', 'Dash', 'Yoyo', 'Comet', 'Juno', 'Flux', 'Pepper', 'Havoc', 'Ziggy', 'Mochi', 'Rumble',
];

export const BOT_PALETTES = [
  { a: 0xff4f8b, b: 0x2b2d6e, g: 0xffe14a },
  { a: 0x3fd0ff, b: 0x1c2452, g: 0xff5fe0 },
  { a: 0xffb52e, b: 0x3a2466, g: 0x6ef3ff },
  { a: 0x8dff5a, b: 0x1f3a4a, g: 0xff8a3c },
  { a: 0xb06bff, b: 0x231a4a, g: 0x9dff3c },
  { a: 0xff7043, b: 0x2a2140, g: 0x6ef3ff },
  { a: 0xf5f5ff, b: 0x3b2f7a, g: 0xff4f8b },
  { a: 0x29e0b0, b: 0x232a5c, g: 0xffe14a },
  { a: 0xff5fe0, b: 0x1e1b45, g: 0x6ef3ff },
  { a: 0xffe14a, b: 0x30285e, g: 0xff4f8b },
];

export const xpForLevel = (lvl) => 400 + lvl * 120; // xp needed to go from lvl to lvl+1
export function levelInfo(xp) {
  let lvl = 1;
  while (xp >= xpForLevel(lvl)) {
    xp -= xpForLevel(lvl);
    lvl++;
  }
  return { level: lvl, into: xp, need: xpForLevel(lvl) };
}
