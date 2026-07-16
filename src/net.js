// JSON API client — the single seam between client and the authoritative backend.
// Real API (same-origin `/api`, proxied to the PHP server by Vite in dev). The active
// player lives in a server session; protected endpoints answer 401 `no_player` when no
// game is in progress, which the client turns into the start screen.
// See docs/api-contract.md and ARCHITECTURE.md.
import mock from './mock/stronghold.json';

const BASE = import.meta.env.VITE_API_BASE || '';   // '' = same-origin (Vite proxies /api)

let lastSource = 'mock';
export function getSource() { return lastSource; }

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message || code);
    this.code = code;
    this.status = status;
  }
}

async function api(path, { method = 'GET', body } = {}) {
  const opts = {
    method,
    credentials: 'include',                 // carries the session cookie
    headers: { Accept: 'application/json' },
  };
  if (body) {
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opts.body = new URLSearchParams(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON body */ }
  if (res.status === 401 || (data && data.error === 'no_player')) {
    throw new ApiError('no_player', (data && data.message) || 'No active player', 401);
  }
  if (!res.ok) throw new ApiError((data && data.error) || 'http', (data && data.message) || `HTTP ${res.status}`, res.status);
  if (data && data.ok === false) throw new ApiError(data.error || 'api_error', data.message || 'API error', res.status);
  return data;
}

// --- session / new game ---
export async function getSession() { return api('/api/session.php'); }
export async function postNewGame(name) { return api('/api/newgame.php', { method: 'POST', body: { name } }); }
export async function postResume(userid) { return api('/api/resume.php', { method: 'POST', body: { userid: String(userid) } }); }

// --- game state ---
export async function getStronghold() {
  try {
    const data = await api('/api/stronghold.php');
    lastSource = 'api';
    return data;
  } catch (e) {
    if (e.code === 'no_player') throw e;     // caller shows the start screen
    console.warn('[net] API unavailable, using mock:', e.message);
    lastSource = 'mock';
    return JSON.parse(JSON.stringify(mock));
  }
}
export async function getFacility(slot) { return api(`/api/facility.php?slot=${slot}`); }
export async function getFacilityCatalog() { return api('/api/facility-catalog.php'); }
export async function getMap(r = 12, squad = 0) { return api(`/api/map.php?r=${r}&squad=${squad}`); }
export async function getBuilding(x, y, squad = 0) { return api(`/api/building.php?x=${x}&y=${y}&squad=${squad}`); }
export async function getForces() { return api('/api/forces.php'); }
export async function postForces(action, survivor = 0, squad = 0, focus = '', item = 0) { return api('/api/forces.php', { method:'POST', body:{ action, survivor:String(survivor), squad:String(squad), focus, item:String(item) } }); }
export async function getInventory() { return api('/api/inventory.php'); }
export async function getResearch() { return api('/api/research.php'); }
export async function postResearch(tech) { return api('/api/research.php', { method: 'POST', body: { tech: String(tech) } }); }
export async function postFacilityAssignment(action, slot, survivor) {
  return api('/api/facility-assignment.php', { method: 'POST', body: { action, slot: String(slot), survivor: String(survivor) } });
}
export async function postInventoryAction(action, survivor, item = 0) {
  return api('/api/inventory-action.php', { method: 'POST', body: { action, survivor: String(survivor), item: String(item) } });
}
export async function postCraft(recipe) {
  return api('/api/craft.php', { method: 'POST', body: { recipe: String(recipe) } });
}
export async function postAdmin(action) { return api('/api/admin.php', { method: 'POST', body: { action } }); }
export async function postRoomAction(action, x, y, room, item = 0, survivor = 0, option = '', squad = 0) {
  return api('/api/room-action.php', { method: 'POST', body: {
    action, x: String(x), y: String(y), room: String(room), item: String(item), survivor: String(survivor), tactic: option, approach: option, squad:String(squad),
  } });
}

// Explore one wasteland tile (frontier rule enforced server-side).
export async function postScout(x, y, squad = 0) {
  return api('/api/scout.php', { method: 'POST', body: { x: String(x), y: String(y), squad:String(squad) } });
}

// Start a build/upgrade. Rule failures come back ok:false with HTTP 200,
// so return the raw payload and let the caller show the message.
export async function postBuild(slot, gridX = null, gridY = null) {
  const res = await fetch(`${BASE}/api/build.php`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ slot: String(slot), ...(gridX === null ? {} : { gridX: String(gridX), gridY: String(gridY) }) }),
  });
  if (res.status === 401) throw new ApiError('no_player', 'No active player', 401);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
