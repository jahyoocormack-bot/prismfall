// Shared game context. Modules reach each other through this object to avoid import cycles.
export const G = {
  state: 'loading', // loading | menu | playing | results
  paused: false,
  time: 0,
  timeScale: 1,
};
