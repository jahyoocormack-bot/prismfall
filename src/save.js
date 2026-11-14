// Player profile persisted in localStorage (falls back to memory when storage is blocked, e.g. in some iframes).
const KEY = 'prismfall.profile.v1';

const defaults = () => ({
  coins: 0,
  xp: 0,
  owned: { wraps: ['stock'], tracers: ['volt'] },
  wrap: 'stock',
  tracer: 'volt',
  stats: { matches: 0, wins: 0, kills: 0, deaths: 0, bestKills: 0, headshots: 0 },
  settings: {
    sens: 1,
    fov: 90,
    volume: 0.8,
    music: 0.5,
    quality: 'auto',
    invertY: false,
    difficulty: 'normal',
    autoFire: true,
  },
  lastDaily: '',
  seenHowTo: false,
});

function merge(base, extra) {
  for (const k in extra) {
    if (extra[k] && typeof extra[k] === 'object' && !Array.isArray(extra[k]) && base[k] && typeof base[k] === 'object') merge(base[k], extra[k]);
    else base[k] = extra[k];
  }
  return base;
}

export function loadProfile() {
  const p = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) merge(p, JSON.parse(raw));
  } catch (e) {
    /* storage unavailable */
  }
  return p;
}

export function saveProfile(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch (e) {
    /* storage unavailable */
  }
}
