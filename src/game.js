// Local DISPLAY state. Not authoritative — the server owns the truth; this just
// holds the last API snapshot and interpolates resources between polls for a
// smooth HUD (SOTD-style). The next snapshot always wins.

export function fromApi(resp) {
  const s = resp.stronghold;
  return {
    id: s.id,
    name: s.name,
    level: s.level,
    points: s.points,
    location: s.location,
    resources: s.resources,      // { key: {amount, cap, perHour} }
    power: s.power,              // { generated, used }
    population: s.population,
    facilities: s.facilities,    // [ {slot,type,level,active,powered} ]
    grid: s.grid || { w: 7, h: 7 },
    builds: s.builds || [],      // [ {slot,due,toLevel} ] in-progress upgrades
    world: s.world || null,
    staffing: s.staffing || null,
    player: resp.player,
    serverTime: resp.serverTime,
    fetchedAt: Date.now() / 1000,
  };
}

// Interpolated resource amount: base + net rate * elapsed, clamped to cap.
export function resourceAmount(state, key) {
  const r = state.resources[key];
  if (!r) return 0;
  const elapsedH = Math.max(0, Date.now() / 1000 - state.fetchedAt) / 3600;
  return Math.min(r.cap, r.amount + r.perHour * elapsedH);
}

export function brownout(state) {
  return state.power && state.power.used > state.power.generated;
}
