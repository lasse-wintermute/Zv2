// Entry point: the new-user gameflow (start screen → new game → play), then the
// compound / world views.
// On-demand rendering (not a perpetual rAF loop): rAF is paused when the page isn't
// visible — e.g. headless/preview panes — which would leave the canvas blank.
import './style.css';
import { initI18n, t } from './i18n.js';
import {
  getStronghold, getSource, getFacility, getFacilityCatalog, getMap, getBuilding, getInventory, getResearch, getForces, postForces, postResearch, postInventoryAction, postFacilityAssignment, postCraft, postAdmin, postBuild, postScout, postRoomAction,
  getSession, postNewGame, postResume, getTutorial, postTutorial, getObjectives, postObjectiveClaim, postRecruit,
} from './net.js';
import { fromApi } from './game.js';
import { createView } from './view.js';
import { createHud } from './hud.js';
import { createPanel } from './panel.js';
import { createStart } from './start.js';
import { createInventory } from './inventory.js';
import { createAdmin } from './admin.js';
import { createResearch } from './research.js';
import { createToolshop } from './toolshop.js';
import { createForces } from './forces.js';
import { createTutorial } from './tutorial.js';
import { createNotify } from './notify.js';
import { initTooltips } from './tooltip.js';
import { confirmAction } from './confirm.js';
import { createMinimap } from './minimap.js';
import { createObjectives } from './objectives.js';
import { createTactical } from './tactical.js';
import { createContext } from './context.js';
import { createHeader } from './header.js';
import { createQueue } from './queue.js';
import { loadItems } from './items.js';
import { postBuildCancel, postResearchCancel } from './net.js';
import { createPower } from './power.js';
import { createIdentity } from './identity.js';
import { createRecruitEncounter } from './recruit.js';
import { createAlly } from './ally.js';
import { getIdentity, postIdentity, getAlly, postAlly, postActivity } from './net.js';
import { RES, facInfo, fmtNum, fmtDuration, resIcon, resName, facKey, slotForKey } from './config.js';

// OG-style cost chips: icon + amount, red when you can't afford it.
const costChips = (cost) => (cost || []).map((c) => `<i class="${c.enough === false ? 'cost-miss' : 'cost-ok'}"><em class="res-ic">${resIcon(c.res)}</em>${fmtNum(c.amount)}</i>`).join(' ');
const missChips = (cost) => (cost || []).filter((c) => c.enough === false).map((c) => `<em class="res-ic">${resIcon(c.res)}</em>${fmtNum(c.amount - (c.owned ?? 0))}`).join(' ');
const missingList = (cost) => (cost || []).filter((c) => c.enough === false).map((c) => `${resIcon(c.res)} ${fmtNum(c.amount - (c.owned ?? 0))} ${resName(c.res)}`);

const SAVE_KEY = 'zv2.userid';   // remembers the player so a reload resumes the game
const WORLD_RADIUS = 25;         // full 50x50 city overview; fog still protects undiscovered content

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const modeBtn = document.getElementById('modebtn');
const newGameBtn = document.getElementById('newgamebtn');
const inventoryBtn = document.getElementById('inventorybtn');
const adminBtn = document.getElementById('adminbtn');
const zoomControls = document.getElementById('zoomcontrols');
const researchBtn = document.getElementById('researchbtn');
const toolshopBtn = document.getElementById('toolshopbtn');
const forcesBtn = document.getElementById('forcesbtn');
const tutorialBtn = document.getElementById('tutorialbtn');
const logBtn = document.getElementById('logbtn');

initI18n();

const notify = createNotify();
const recruitEncounter = createRecruitEncounter({
  onAction: async (action,id) => { const r=await postRecruit(action,id,activeSquadId);if(action==='recruit'){worldState=await getMap(WORLD_RADIUS,activeSquadId);requestRender();setStatus(r.message,false,'good');}return r; },
  onOpenReserve: () => forcesBtn.click(),
});
initTooltips();
const view = createView(canvas);
const minimapEl = document.getElementById('minimap');
const minimap = createMinimap(minimapEl, {
  onMove: (cx, cy) => { view.cam.x = cx; view.cam.y = cy; requestRender(); },
  onZoom: (steps) => { view.setWorldZoom(view.cam.worldZoom + steps * .1); requestRender(); },
});
const context = createContext();
// OG Zombilization top header: dropdown menus dispatch to the same handlers as
// the (now hidden) legacy buttons, so hotkeys and tutorial flows stay intact.
const header = createHeader(document.getElementById('gameheader'), {
  squadProvider: async () => { try { return (await getForces()).squads || []; } catch { return []; } },
  onAction: async (action, a, b, c) => {
    switch (action) {
      case 'compound': setMode('compound'); break;
      case 'world': setMode('world'); break;
      case 'squad':
        activeSquadId = a;
        await setMode('world');
        try { worldState = await getMap(WORLD_RADIUS, a); requestRender(); } catch (e) { setStatus(e.message, true); }
        break;
      case 'facility': openFacilityScreen(a); break;
      case 'research': researchBtn.click(); break;
      case 'toolshop': toolshopBtn.click(); break;
      case 'objectives': document.getElementById('objectivesbtn').click(); break;
      case 'log': notify.toggleLog(); break;
      case 'tutorial': tutorialBtn.click(); break;
      case 'identity': openPanel(async () => identity.show(await getIdentity())); break;
      case 'ally': openPanel(async () => ally.show(await getAlly())); break;
      case 'admin': adminBtn.click(); break;
      case 'forces': forcesBtn.click(); break;
      case 'inventory': inventoryBtn.click(); break;
      case 'newgame': newGameBtn.click(); break;
    }
  },
});
// OG live queue box: every running job with countdown + cancel (50% refund).
const queue = createQueue(document.getElementById('queue'), {
  onCancel: async (type, ref) => {
    try {
      const r = type === 'build' ? await postBuildCancel(ref) : type === 'research' ? await postResearchCancel() : null;
      if (r) { await load(); setStatus(r.message, false, 'warn'); }
    } catch (e) { setStatus(e.message, true); await load(); }
  },
});
const power = createPower(document.getElementById('power'), {
  onFacility: (slot) => openFacilityScreen(slot),
});
const ally = createAlly(document.getElementById('ally'), {
  onAction: async (action, payload) => {
    try {
      const r = await postAlly(action, payload);
      ally.show(r.ally !== undefined ? r : await getAlly());
      refreshAlly();
      setStatus(r.message, false, 'good');
    } catch (e) { setStatus(e.message, true); try { ally.show(await getAlly()); } catch { /* keep view */ } }
  },
});
const identity = createIdentity(document.getElementById('identity'), {
  onSave: async (action, payload) => {
    try {
      const r = await postIdentity(action, payload);
      identity.show(await getIdentity());
      await load();
      if (mode === 'world') { worldState = await getMap(WORLD_RADIUS, activeSquadId); requestRender(); }
      setStatus(r.message, false, 'good');
    } catch (e) { setStatus(e.message, true); }
  },
});
const compassBtn = document.getElementById('compass');
function updateCompass() { const n = document.getElementById('compassneedle'); if (n) n.style.transform = `rotate(${view.cam.rot}rad)`; }
compassBtn.addEventListener('click', () => { view.setRotation(0); view.cam.x = 0; view.cam.y = 0; updateCompass(); requestRender(); });
const hud = createHud(document.getElementById('hud'));
const panel = createPanel(document.getElementById('panel'), {
  onClose: () => { activePlace = null; view.setSelected(null); view.setSelectedCell(null); requestRender(); },
  onUpgrade: async (slot) => {
    setStatus('Starting build…');
    try {
      const r = await postBuild(slot);
      await load();                          // refresh resources and levels
      panel.show(await getFacility(slot));   // refresh the open panel
      refreshTutorial();
      setStatus(r.message || (r.ok ? 'Build started.' : 'Cannot build.'), !r.ok);
    } catch (e) {
      setStatus('Build failed: ' + e.message, true);
    }
  },
  onPlace: async (type, gridX, gridY) => {
    setStatus('Starting construction...');
    try {
      const r = await postBuild(type, gridX, gridY);
      if (!r.ok) throw new Error(r.message || 'Cannot build here.');
      await load();
      panel.hide();
      refreshTutorial();
      setStatus(r.message || 'Construction started.');
    } catch (e) {
      setStatus(e.message, true);
      try { panel.showBuildSite(await getFacilityCatalog(), gridX, gridY); } catch { /* preserve original error */ }
    }
  },
  onStaffInfo: async () => { try { forces.show(await getForces(), activeSquadId); } catch (e) { setStatus(e.message, true); } },
  onActivity: async (slot, percent) => {
    try {
      const r = await postActivity(slot, percent);
      await load();
      panel.show(await getFacility(slot));
      if (power.isOpen()) power.show(state);
      setStatus(r.message, false, percent === 0 ? 'warn' : 'good');
    } catch (e) { setStatus(e.message, true); }
  },
  onStaff: async (action, slot, survivor) => {
    try {
      const r = await postFacilityAssignment(action, slot, survivor);
      await load();
      panel.show(await getFacility(slot));
      refreshTutorial();
      setStatus(r.message);
    } catch (e) {
      setStatus(e.message, true);
      panel.show(await getFacility(slot));
    }
  },
  onRoomAction: async (action, room, item, survivor, option) => {
    if (!activePlace) return;
    setStatus(action === 'fight' ? `${option || 'precise'} attack…` : (action === 'discover' ? 'Opening the unknown room…' : 'Recovering supplies…'));
    try {
      const r = await postRoomAction(action, activePlace.x, activePlace.y, room, item, survivor, option, activePlace.squadId);
      if (action === 'retreat') { panel.hide(); activePlace = null; }
      else panel.showPlace(await getBuilding(activePlace.x, activePlace.y, activePlace.squadId));
      await load();
      refreshTutorial();
      setStatus(r.message || 'Done.');
    } catch (e) { setStatus(e.message, true); }
  },
});
const inventory = createInventory(document.getElementById('inventory'), {
  onAction: async (action, survivor, item) => {
    try {
      const r = await postInventoryAction(action, survivor, item);
      inventory.show(await getInventory());
      if (activePlace) tactical.show(await getBuilding(activePlace.x, activePlace.y, activePlace.squadId));
      setStatus(r.message);
    } catch (e) {
      setStatus(e.message, true);
      inventory.show(await getInventory());
    }
  },
  onCraft: async (recipe) => {
    try {
      const r = await postCraft(recipe);
      inventory.show(await getInventory());
      await load();
      setStatus(r.message);
    } catch (e) {
      setStatus(e.message, true);
      inventory.show(await getInventory());
    }
  },
});
const admin = createAdmin(document.getElementById('admin'), { onAction: async (action) => { try { const r=await postAdmin(action); admin.show(); await load(); if(mode==='world') { worldState=await getMap(WORLD_RADIUS,activeSquadId); requestRender(); } setStatus(r.message); } catch(e) { admin.show(); setStatus(e.message,true); } } });
const research = createResearch(document.getElementById('research'), { onStart: async (tech) => { try { const r=await postResearch(tech); research.show(await getResearch()); setStatus(r.message); } catch(e) { setStatus(e.message,true); research.show(await getResearch()); } } });
const toolshop = createToolshop(document.getElementById('toolshop'), { onProduce: async (recipe) => { try { const r=await postCraft(recipe); toolshop.show(await getInventory()); setStatus(r.message); } catch(e) { setStatus(e.message,true); toolshop.show(await getInventory()); } } });
const forces = createForces(document.getElementById('forces'), {
  onSelect: async (id) => { activeSquadId=id; try { worldState=await getMap(WORLD_RADIUS,id); requestRender(); forces.show(await getForces(),id); setStatus(`${worldState.squad.name} selected for deployment.`); } catch(e){setStatus(e.message,true);} },
  onAction: async (action,survivor,squad,focus,item) => { try { const r=await postForces(action,survivor,squad,focus,item); forces.show(await getForces(),activeSquadId); if(mode==='world'){worldState=await getMap(WORLD_RADIUS,activeSquadId);requestRender();}refreshTutorial();setStatus(r.message); } catch(e){setStatus(e.message,true);forces.show(await getForces(),activeSquadId);} }
});
const objectives = createObjectives(document.getElementById('objectives'), {
  onClaim: async (id) => {
    try { const r = await postObjectiveClaim(id); objectives.show(await getObjectives()); await load(); setStatus(r.message, false, 'good'); }
    catch (e) { setStatus(e.message, true); try { objectives.show(await getObjectives()); } catch { /* keep last view */ } }
  },
});
const tactical = createTactical(document.getElementById('tactical'), {
  onAction: async (action, room, item, survivor, option) => {
    if (!activePlace) return;
    try {
      const r = await postRoomAction(action, activePlace.x, activePlace.y, room, item, survivor, option, activePlace.squadId);
      tactical.show(await getBuilding(activePlace.x, activePlace.y, activePlace.squadId));
      await load();
      refreshTutorial();
      setStatus(r.message || 'Done.', false, (action === 'fight' && r.secured) || action === 'claim_vehicle' ? 'good' : undefined);
    } catch (e) {
      setStatus(e.message, true);
      try { tactical.show(await getBuilding(activePlace.x, activePlace.y, activePlace.squadId)); } catch { /* building fetch failed; scene keeps last state */ }
    }
  },
  onClose: () => { activePlace = null; },
});
const start = createStart(document.getElementById('start'), {
  onNewGame: newGame,
  onCancel: () => { if (player) start.hide(); },
});
const tutorial = createTutorial(document.getElementById('tutorial'), {
  onAdvance: async () => { try { tutorial.show(await postTutorial('advance')); } catch(e) { setStatus(e.message,true); refreshTutorial(); } },
  onDismiss: async () => { try { tutorial.show(await postTutorial('dismiss')); } catch(e) { setStatus(e.message,true); } },
  onRestart: async () => { try { tutorial.show(await postTutorial('restart')); } catch(e) { setStatus(e.message,true); } },
});

let state = null;
let player = null;
let playing = false;
let mode = 'compound';        // 'compound' | 'world'
let worldState = null;
let activePlace = null;
let activeSquadId = 0;
let seenRaidTime = 0;

// Transient one-liners stay on the status line; anything meaningful is also
// pushed to the event log, and errors/notable events pop a toast. `tone` can be
// forced ('good'|'warn'|'bad'), else it's inferred from isError.
const AMBIENT = /^(live|mock|.*zoom \d|.*drag to pan|.* selected| *)$/i;   // don't log idle chatter
function setStatus(msg, isError, tone) {
  statusEl.textContent = t(msg || '');
  statusEl.classList.toggle('error', !!isError);
  if (!msg || AMBIENT.test(msg)) return;
  const statusTone = tone || (isError ? 'bad' : 'info');
  notify.notify(msg, { tone: statusTone, silent: statusTone === 'info' });   // info: log only; good/warn/bad also toast
}

function requestRender() {
  if (!playing) return;
  view.resize();              // keep the canvas sized to the viewport
  if (mode === 'world') {
    if (worldState) { view.renderWorld(worldState); minimap.render(worldState, view.cam); if(worldState.recentRecruit)recruitEncounter.show(worldState.recentRecruit);else recruitEncounter.reset(); }
    minimapEl.classList.remove('hidden');
  } else {
    minimapEl.classList.add('hidden');
    if (state) view.render(state);
  }
}

document.addEventListener('zv2:languagechange', requestRender);

async function refreshAlly(){
  try {
    const d = await getAlly();
    header.setAlly(d.ally ? { ...d.ally, memberCount: d.ally.members.length } : null);
  } catch { /* alliance API unavailable during setup */ }
}
async function refreshTutorial(){if(!playing)return;try{tutorial.show(await getTutorial());}catch{/* migration/API may be unavailable during setup */}}

// --- new-user gameflow -----------------------------------------------------
async function boot() {
  let p = null;
  try { p = (await getSession()).player; } catch { /* API down → start screen */ }
  if (!p) {
    const saved = Number(localStorage.getItem(SAVE_KEY) || 0);
    if (saved > 0) { try { p = (await postResume(saved)).player; } catch { /* stale id */ } }
  }
  if (p) { player = p; await enterGame(); }
  else { start.show(); }
}

async function newGame(name) {
  if (!name) { start.show({ error: 'Enter a survivor name.', canCancel: !!player }); return; }
  start.busy('Waking up in the dust…');
  try {
    const r = await postNewGame(name);
    player = r.player;
    state = null; worldState = null; mode = 'compound';
    await enterGame();
  } catch (e) {
    start.show({ error: e.message, name, canCancel: !!player });
  }
}

async function enterGame() {
  start.hide();
  playing = true;
  document.body.classList.add('playing');
  localStorage.setItem(SAVE_KEY, String(player.id));
  modeBtn.textContent = '🗺 World map';
  loadItems();        // item-tooltip catalog (OG getitemmouseover2 data)
  refreshAlly();      // alliance crest + roster in the header dropdown
  await load();
  notify.openLog();   // SOTD-style docked events/facilities panel, open by default
  try { const f=await getForces(); if(!activeSquadId)activeSquadId=f.squads?.[0]?.id||0; } catch { /* map can choose the first squad */ }
  await refreshTutorial();
}

function leaveToStart(error) {
  playing = false; state = null; player = null;
  document.body.classList.remove('playing');
  panel.hide();
  start.show({ error });
}

newGameBtn.addEventListener('click', async () => {
  // Starting a new survivor abandons the current settlement — confirm first.
  if (player && !(await confirmAction({
    title: 'Start a new game?',
    body: 'Your current settlement, survivors and research progress will be left behind.',
    confirm: 'Start new game', cancel: 'Keep playing',
  }))) return;
  start.show({ canCancel: !!player });
});
adminBtn.addEventListener('click', () => admin.show());
logBtn.addEventListener('click', () => notify.toggleLog());
document.getElementById('objectivesbtn').addEventListener('click', async () => { try { objectives.show(await getObjectives()); } catch (e) { setStatus(e.message, true); } });
researchBtn.addEventListener('click', () => openFacilityScreen(12));
toolshopBtn.addEventListener('click', () => openFacilityScreen(11));
forcesBtn.addEventListener('click', async () => { try { forces.show(await getForces(),activeSquadId); } catch(e) { setStatus(e.message,true); } });
tutorialBtn.addEventListener('click', () => tutorial.reopen());
zoomControls.addEventListener('click', (e) => {
  const button = e.target.closest('[data-zoom]');
  if (!button) return;
  if(mode==='world')view.setWorldZoom(view.cam.worldZoom+(button.dataset.zoom==='in'?.15:-.15));
  else view.setZoom(view.cam.zoom + (button.dataset.zoom === 'in' ? .15 : -.15));
  requestRender();
  setStatus(`${mode==='world'?'World map':'Compound'} zoom ${Math.round((mode==='world'?view.cam.worldZoom:view.cam.zoom)*100)}%`);
});
inventoryBtn.addEventListener('click', async () => {
  try { inventory.show(await getInventory()); }
  catch (e) { setStatus(e.message, true); }
});

// --- away/offline progress recap (SOTD QoL) --------------------------------
// The server accrues resources and resolves raids while you're gone; on return
// we diff a per-player snapshot to show what changed. Only fires after a real
// gap (not during 15s live polling), and only while the tab is visible.
const AWAY_MIN = 120;        // seconds gap before a recap is worth showing
const AWAY_CAP = 8 * 3600;   // clamp the displayed span at 8h, like SOTD
const awayKey = () => `zv2.away.${player?.id || 0}`;
function snapshotResources() { const r = {}; for (const res of RES) r[res.key] = state?.resources?.[res.key]?.amount ?? 0; return r; }
function saveAwaySnapshot() {
  try { localStorage.setItem(awayKey(), JSON.stringify({ t: Math.floor(Date.now() / 1000), res: snapshotResources() })); } catch { /* storage disabled */ }
}
function maybeShowAwayRecap() {
  let prior; try { prior = JSON.parse(localStorage.getItem(awayKey()) || 'null'); } catch { /* ignore */ }
  if (!prior?.res) return;
  const elapsed = Math.min(AWAY_CAP, Math.floor(Date.now() / 1000) - (prior.t || 0));
  if (elapsed < AWAY_MIN) return;
  const now = snapshotResources();
  const gains = RES.map((r) => ({ name: r.name.toLowerCase(), d: Math.round((now[r.key] ?? 0) - (prior.res[r.key] ?? 0)) })).filter((g) => g.d > 0);
  const raid = state.world?.lastRaid;
  const raided = raid?.time && raid.time > prior.t;
  if (!gains.length && !raided) return;
  const parts = gains.map((g) => `+${fmtNum(g.d)} ${g.name}`);
  const raidNote = raided ? (raid.success ? ' · night raid repelled' : ` · raid cost ${raid.resourceLoss} supplies`) : '';
  notify.notify(`While away (${fmtDuration(elapsed)}): ${parts.join(', ') || 'stores were full'}${raidNote}`, { tone: raided && !raid.success ? 'warn' : 'good' });
}

// --- state -----------------------------------------------------------------
async function load() {
  if (!playing) return;
  try {
    state = fromApi(await getStronghold());
    if (document.visibilityState === 'visible') { maybeShowAwayRecap(); saveAwaySnapshot(); }
    setStatus(getSource() === 'mock' ? 'mock data (API offline) · drag to pan' : 'live · drag to pan');
    const raid = state.world?.lastRaid;
    if (raid?.time && raid.time > seenRaidTime) {
      seenRaidTime = raid.time;
      if (mode === 'compound' && raid.time >= Math.floor(Date.now() / 1000) - 90) view.startRaidAnimation(raid);
      if (raid.success) setStatus(`Zombie horde repelled · defence ${raid.defense} vs threat ${raid.threat}`, false, 'good');
      else setStatus(`Zombie horde breached the walls (threat ${raid.threat} vs defence ${raid.defense})${raid.resourceLoss ? ` · ${raid.resourceLoss} food devoured` : ''}${raid.wounded ? ` · ${raid.wounded} wounded` : ''}`, true, 'bad');
    }
  } catch (e) {
    if (e.code === 'no_player') { leaveToStart('Your session expired — start a new game.'); return; }
    console.error(e);
    setStatus('Failed to load stronghold: ' + e.message, true);
  }
  hud.render(state);
  queue.show(state?.jobs || []);
  const facRows = (state?.facilities || []).map((f) => ({
    slot: f.slot, name: facInfo(f.type).name, level: f.level, staff: f.staff,
    gridX: f.gridX, gridY: f.gridY, constructing: f.constructing,
  }));
  header.update(state ? { ...state, facilities: facRows } : null);
  // Facilities tab (SOTD buildings list): click a row to jump the camera there.
  notify.setFacilities(facRows, (slot) => openFacilityScreen(slot));
  requestRender();
}

// live tick: HUD interpolation, plus build-countdown re-render + finalize on completion
const finalizeTriggered = new Set();
let phaseRefreshAt = 0;
setInterval(() => {
  if (!playing || !state) return;
  hud.render(state);
  const nextPhaseAt=Number(state.world?.nextPhaseAt||0);if(nextPhaseAt&&nextPhaseAt*1000<=Date.now()&&phaseRefreshAt!==nextPhaseAt){phaseRefreshAt=nextPhaseAt;load();return;}
  const builds = state.builds || [];
  if (builds.length && mode === 'compound') requestRender();   // tick the countdown badges
  for (const b of builds) {
    if (b.due * 1000 <= Date.now() && !finalizeTriggered.has(b.slot)) {
      finalizeTriggered.add(b.slot);
      const done = b;
      load().then(() => setStatus(`Construction complete · level ${done.toLevel}`, false, 'good'));   // server finalizes completed Zv2 construction
    }
  }
  for (const slot of finalizeTriggered) if (!builds.some((b) => b.slot === slot)) finalizeTriggered.delete(slot);
}, 1000);

setInterval(() => { if (playing) load(); }, 15000);   // re-poll; server is authoritative
setInterval(() => { if (playing && research.isOpen() && !document.getElementById('research').classList.contains('window-interacting')) getResearch().then((d) => research.show(d)).catch(() => {}); }, 3000);
setInterval(() => { if (playing && toolshop.isOpen() && !document.getElementById('toolshop').classList.contains('window-interacting')) getInventory().then((d) => toolshop.show(d)).catch(() => {}); }, 3000);
setInterval(() => { if (playing && forces.isOpen() && !document.getElementById('forces').classList.contains('window-interacting')) getForces().then((d) => forces.show(d,activeSquadId)).catch(() => {}); }, 3000);
setInterval(() => { if (playing && tutorial.isOpen() && !document.getElementById('tutorial').classList.contains('window-interacting')) refreshTutorial(); }, 3000);
setInterval(async () => {
  if (!playing || mode !== 'world' || !worldState?.squad?.traveling) return;
  try {
    worldState = await getMap(WORLD_RADIUS,activeSquadId); requestRender();
    const sq=worldState.squad;
    if (sq.traveling) setStatus(`Squad traveling to ${sq.targetX}|${sq.targetY} · ${Math.max(0,sq.arrivesAt-Math.floor(Date.now()/1000))}s`);
    else setStatus(sq.lastEvent || `${sq.name} arrived at ${sq.x}|${sq.y}.`);
  } catch(e) { setStatus(e.message,true); }
}, 1000);

// --- views -----------------------------------------------------------------
modeBtn.addEventListener('click', () => setMode(mode === 'compound' ? 'world' : 'compound'));
async function setMode(m) {
  mode = m;
  view.cam.x = 0; view.cam.y = 0;
  panel.hide(); view.setSelected(null); view.setSelectedCell(null);
  activePlace = null;
  zoomControls.classList.remove('hidden');
  if (m === 'world' && !worldState) {
    try { worldState = await getMap(WORLD_RADIUS,activeSquadId); if(!activeSquadId)activeSquadId=worldState.squad.id; }
    catch (e) { setStatus('map load failed: ' + e.message, true); }
  }
  if(m==='world'&&tutorial.currentStep()===8){try{tutorial.show(await postTutorial('event','world'));}catch{/* remain on objective until next attempt */}}
  modeBtn.textContent = m === 'world' ? '🏠 Compound' : '🗺 World map';
  setStatus(m === 'world'
    ? 'Berlin exclusion zone · drag to pan and zoom'
    : (getSource() === 'mock' ? 'mock data (API offline) · drag to pan' : 'live · drag to pan'));
  requestRender();
}

// --- input: drag-to-pan, right-drag rotate, click-to-select, right-click menu
let drag = null, moved = false, rightDrag = null;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  if (!playing) return;
  if (e.button === 2) {                          // SOTD: right-drag rotates the view
    rightDrag = { x: e.clientX, rot0: view.cam.rot, moved: false };
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    return;
  }
  if (e.button !== 0) return;
  drag = { x: e.clientX, y: e.clientY, cx: view.cam.x, cy: view.cam.y };
  moved = false;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
});
// OG map commentary tooltips: hovering the canvas explains what's under the
// cursor — facility (level/staff), empty plot, or world tile with X|Y coords.
let hoverThrottle = 0;
function updateCanvasTip(e) {
  const now = performance.now();
  if (now - hoverThrottle < 90) return;
  hoverThrottle = now;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  let tip = '';
  if (mode === 'compound' && state) {
    const hit = view.pick(x, y);
    if (hit?.empty) tip = `Empty plot ${hit.gridX + 1}|${hit.gridY + 1}\nClick to construct a facility`;
    else if (hit) {
      const f = (state.facilities || []).find((ff) => ff.slot === hit.slot);
      tip = `${facInfo(hit.type).name} — Level ${hit.level}${f?.staff ? `\n${f.staff} survivor${f.staff === 1 ? '' : 's'} assigned` : ''}${f?.constructing ? '\n🏗 under construction' : ''}\nClick for actions`;
    }
  } else if (mode === 'world' && worldState) {
    const t = view.worldPick(x, y);
    if (t) {
      if (t.seen) tip = `${t.home ? '★ ' : ''}${t.name || 'District'} (X:${t.x} Y:${t.y})${t.rooms ? `\n${t.rooms} rooms` : ''}${t.district ? `\n${t.district}` : ''}${t.cleared ? '\n✓ Fully cleared · +0.5% resource production' : ''}\n${t.home ? 'Your stronghold' : 'Click to travel / enter'}`;
      else if (t.scoutable) tip = `Unknown block (X:${t.x} Y:${t.y})\nClick to scout`;
      else tip = `Deep fog (X:${t.x} Y:${t.y})\nExplore outward from known ground`;
    }
  }
  if (tip) canvas.setAttribute('data-tip', tip); else canvas.removeAttribute('data-tip');
}

canvas.addEventListener('pointermove', (e) => {
  if (!drag && !rightDrag && playing) updateCanvasTip(e);
  if (rightDrag) {
    const dx = e.clientX - rightDrag.x;
    if (Math.abs(dx) > 4) rightDrag.moved = true;
    view.setRotation(rightDrag.rot0 + dx * Math.PI / 450);   // ~10° per 25px
    updateCompass();
    requestRender();
    return;
  }
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
  view.cam.x = drag.cx + dx;
  view.cam.y = drag.cy + dy;
  requestRender();
});
canvas.addEventListener('pointerup', (e) => {
  if (e.button === 2) {
    const wasClick = rightDrag && !rightDrag.moved;
    rightDrag = null;
    if (wasClick) openContextMenu(e);
    return;
  }
  const wasClick = drag && !moved;
  drag = null;
  if (wasClick) onClick(e);
});
canvas.addEventListener('pointercancel', () => { drag = null; rightDrag = null; });

// Letter shortcuts for menu entries (SOTD BUILD_KEYS feel): first free letter
// of the name, skipping letters already taken within this menu.
function assignMenuKeys(items) {
  const used = new Set();
  for (const it of items) {
    if (it.info || it.disabled) continue;
    let key = null;
    for (const ch of (it.label || '').toLowerCase()) if (/[a-z]/.test(ch) && !used.has(ch)) { key = ch; break; }
    if (!key) for (const ch of 'abcdefghijklmnopqrstuvwxyz') if (!used.has(ch)) { key = ch; break; }
    if (key) { used.add(key); it.key = key; }
  }
  return items;
}

// SOTD-style build menu right at the clicked plot: every buildable facility
// with its cost inline, its description on hover, and a letter hotkey.
async function openBuildMenu(hit, cx, cy) {
  view.setSelectedCell(hit.gridX, hit.gridY);
  requestRender();
  let catalog;
  try { catalog = await getFacilityCatalog(); } catch (err) { setStatus('Build catalog failed: ' + err.message, true); return; }
  const items = assignMenuKeys((catalog.facilities || []).map((f) => ({
    label: f.name,
    tip: (f.description || '') + (missingList(f.cost).length ? `\nMissing: ${missingList(f.cost).join(', ')}` : ''),
    smallHtml: (f.cost || []).length
      ? costChips(f.cost)
      : undefined,
    small: (f.cost || []).length ? undefined : (f.canBuild ? 'free' : f.reason || ''),
    disabled: !f.canBuild,
    onClick: async () => {
      setStatus('Starting construction…');
      try {
        const r = await postBuild(f.type, hit.gridX, hit.gridY);
        if (!r.ok) throw new Error(r.message || 'Cannot build here.');
        view.setSelectedCell(null);
        await load();
        refreshTutorial();
        setStatus(r.message || 'Construction started.', false, 'good');
      } catch (err) { setStatus(err.message, true); }
    },
  })));
  if (!items.length) items.push({ label: 'All facility types placed', disabled: true });
  context.openAt(cx, cy, 'Construct facility', items, `plot ${hit.gridX + 1}|${hit.gridY + 1}`);
}

// Facility popup, context-menu style (same pattern as the build menu):
// compact info at the cursor — level, construction countdown, next cost,
// staffing — with Upgrade (U) and full Details (D) actions.
async function openFacilityMenu(slot, cx, cy) {
  view.setSelected(slot);
  requestRender();
  let d;
  try { d = await getFacility(slot); } catch (err) { setStatus('facility load failed: ' + err.message, true); return; }
  const items = [];
  if (d.description) items.push({ info: true, label: d.description });
  if (d.building) {
    const remaining = Math.max(0, d.building.due - Date.now() / 1000);
    items.push({ info: true, label: `⏳ Upgrading to level ${d.building.toLevel}`, small: remaining > 0 ? fmtDuration(remaining) + ' remaining' : 'finishing…' });
  } else if (!d.atMax) {
    const miss = missingList(d.nextCost);
    items.push({
      info: true,
      label: `Upgrade to level ${d.nextLevel}:`,
      html: `<span>Upgrade to level ${d.nextLevel}:</span><small>${(d.nextCost || []).length ? costChips(d.nextCost) : 'free'}${miss.length ? `<br><b class="cost-miss">Missing: ${miss.join(', ')}</b>` : ''}</small>`,
      tip: (d.nextCost || []).map((c) => `${resIcon(c.res)} ${resName(c.res)}: ${fmtNum(c.owned ?? 0)} owned / ${fmtNum(c.amount)} needed`).join('\n'),
    });
  }
  const staffing = d.staffing || { capacity: 0, survivors: [] };
  const assigned = (staffing.survivors || []).filter((s) => s.jobFacility === d.slot).length;
  if (staffing.capacity) items.push({ info: true, label: `Staff: ${assigned}/${staffing.capacity} assigned`, small: staffing.effect || '', tip: 'Assign survivors in Details — workers boost this facility but leave the raiding crew' });
  if (!d.building && !d.atMax) items.push({
    key: 'u', label: `Upgrade to level ${d.nextLevel}`,
    smallHtml: d.canUpgrade ? undefined : (missChips(d.nextCost) ? `<b class="cost-miss">Missing: ${missChips(d.nextCost)}</b>` : undefined),
    small: d.canUpgrade || missChips(d.nextCost) ? undefined : (d.upgradeReason || 'Unavailable'),
    disabled: !d.canUpgrade,
    tip: [`Upgrade benefits:\n${(d.upgradeBenefits || ['Improves this facility.']).map((benefit) => `• ${benefit}`).join('\n')}`, d.canUpgrade ? 'Start construction now' : (missingList(d.nextCost).length ? 'Still needed: ' + missingList(d.nextCost).join(', ') : (d.upgradeReason || ''))].filter(Boolean).join('\n\n'),
    onClick: async () => {
      setStatus('Starting build…');
      try {
        const r = await postBuild(slot);
        await load();
        refreshTutorial();
        setStatus(r.message || (r.ok ? 'Build started.' : 'Cannot build.'), !r.ok, r.ok ? 'good' : undefined);
      } catch (err) { setStatus('Build failed: ' + err.message, true); }
    },
  });
  if (d.atMax) items.push({ info: true, label: 'Fully upgraded', small: 'maximum level reached' });
  items.push({ key: 'g', label: 'Go to facility page', small: 'open the full building screen', onClick: () => { openFacilityScreen(slot); } });
  items.push({ key: 'd', label: 'Details & staffing', small: 'full panel: workers, patients, costs', onClick: () => { panel.show(d); } });
  const fk = facKey(slot);
  context.openAt(cx, cy, d.name, items, `Level ${d.level}${d.atMax ? ' · MAX' : ''}${fk ? ` · screen (${fk.toUpperCase()})` : ''}`);
}

// Every facility has its own action screen (like each OG facility page):
// the staffing/upgrade panel on the right — the OG facility block — plus the
// facility's own feature window where it has one (Research tree, Toolshop
// production, Power grid). Reached by click or the facility's hotkey.
async function openFacilityScreen(slot) {
  if (!playing) return;
  const built = (state?.facilities || []).find((f) => f.slot === slot);
  const info = facInfo(slot);
  if (!built) {
    setStatus(`${info.name} is not built yet — click an empty compound plot to construct it.`, true);
    return;
  }
  if (mode !== 'compound') await setMode('compound');
  view.centerCompoundOn(built.gridX, built.gridY);
  view.setSelected(slot);
  requestRender();
  // feature window for facilities that have one
  try {
    if (slot === 12) research.show(await getResearch());
    else if (slot === 11) toolshop.show(await getInventory());
    else if (slot === 9) power.show(state);
  } catch (e) { setStatus(e.message, true); }
  // the OG facility block: staffing + upgrade, always alongside
  try { panel.show(await getFacility(slot)); }
  catch (e) { setStatus(e.message, true); }
}

// Right-click context menu (SOTD ctxpanel): contextual actions at the cursor.
function openContextMenu(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  if (mode === 'compound') {
    const hit = view.pick(x, y);
    if (!hit) return;
    if (hit.empty) { openBuildMenu(hit, e.clientX, e.clientY); return; }
    openFacilityMenu(hit.slot, e.clientX, e.clientY);
    return;
  }
  const t = view.worldPick(x, y);
  if (!t) return;
  const squad = worldState?.squad;
  if (t.seen) {
    const items = [];
    if (squad && squad.x === t.x && squad.y === t.y && !t.home) items.push({ label: 'Enter building', small: 'tactical raid', onClick: async () => { try { activePlace = { x: t.x, y: t.y, squadId: activeSquadId }; tactical.show(await getBuilding(t.x, t.y, activeSquadId)); } catch (err) { setStatus(err.message, true); } } });
    if (!squad || squad.x !== t.x || squad.y !== t.y) items.push({ label: 'Travel here', small: squad?.traveling ? 'squad already traveling' : 'move the active squad', disabled: !!squad?.traveling, onClick: async () => { try { const r = await postScout(t.x, t.y, activeSquadId); worldState = await getMap(WORLD_RADIUS, activeSquadId); requestRender(); setStatus(r.message); } catch (err) { setStatus(err.message, true); } } });
    if (t.home) items.push({ label: 'Squad overview', small: 'manage squads & loadouts', onClick: async () => { try { forces.show(await getForces(), activeSquadId); } catch (err) { setStatus(err.message, true); } } });
    context.openAt(e.clientX, e.clientY, t.name || 'District', items, `${t.x}|${t.y}${t.rooms ? ` · ${t.rooms} rooms` : ''}`);
    return;
  }
  if (t.scoutable) {
    context.openAt(e.clientX, e.clientY, t.survivorSignal ? 'Signs of life' : 'Unknown block', [
      { label: t.survivorSignal ? 'Investigate signal' : 'Scout this block', small: squad?.traveling ? 'squad already traveling' : (t.survivorSignal ? 'possible survivor · reveal & travel' : 'reveal & travel'), disabled: !!squad?.traveling, onClick: async () => { try { const r = await postScout(t.x, t.y, activeSquadId); worldState = await getMap(WORLD_RADIUS, activeSquadId); requestRender(); setStatus(`${r.message} · ${r.travel.seconds}s`); } catch (err) { setStatus(err.message, true); } } },
    ], `${t.x}|${t.y}${t.survivorSignal ? ' · survivor signal' : ''}`);
  }
}
canvas.addEventListener('wheel', (e) => {
  if (!playing) return;
  e.preventDefault();
  if(mode==='world')view.setWorldZoom(view.cam.worldZoom+(e.deltaY<0?.1:-.1));
  else view.setZoom(view.cam.zoom + (e.deltaY < 0 ? .1 : -.1));
  requestRender();
  setStatus(`${mode==='world'?'World map':'Compound'} zoom ${Math.round((mode==='world'?view.cam.worldZoom:view.cam.zoom)*100)}%`);
}, { passive: false });

async function onClick(e) {
  if (!playing) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  if (mode === 'world') return onWorldClick(x, y);

  const hit = view.pick(x, y);
  if (!hit) { view.setSelected(null); view.setSelectedCell(null); panel.hide(); requestRender(); return; }
  if (hit.empty) {
    await openBuildMenu(hit, e.clientX, e.clientY);   // SOTD-style menu at the plot
    return;
  }
  await openFacilityMenu(hit.slot, e.clientX, e.clientY);   // context-menu style, like the build menu
}

// Wasteland: click a known place to inspect it, or a dashed frontier tile to explore.
async function onWorldClick(x, y) {
  const t = view.worldPick(x, y);
  if (!t) return;
  const squad=worldState?.squad;
  if (squad?.traveling) { setStatus(`Squad already traveling · ${Math.max(0,squad.arrivesAt-Math.floor(Date.now()/1000))}s remaining`,true); return; }
  if (t.seen) {
    if (!squad || squad.x !== t.x || squad.y !== t.y) {
      try { const r=await postScout(t.x,t.y,activeSquadId); worldState=await getMap(WORLD_RADIUS,activeSquadId); requestRender(); setStatus(r.message); } catch(err) { setStatus(err.message,true); } return;
    }
    if (t.home) { setStatus(`${t.name} — squad is home (${t.x}|${t.y})`); return; }
    setStatus(`Entering ${t.name}…`);
    try {
      activePlace = { x: t.x, y: t.y, squadId:activeSquadId };
      tactical.show(await getBuilding(t.x, t.y, activeSquadId));   // full tactical raid scene
      setStatus(`${t.name} · ${t.rooms || 0} rooms (${t.x}|${t.y})`);
    } catch (err) {
      setStatus('Building load failed: ' + err.message, true);
    }
    return;
  }
  if (!t.scoutable) { setStatus('Too far — explore outward from ground you know.', true); return; }
  setStatus(t.survivorSignal ? 'Investigating signs of life…' : 'Scouting…');
  try {
    const r = await postScout(t.x, t.y, activeSquadId);
    worldState = await getMap(WORLD_RADIUS,activeSquadId);
    requestRender();
    setStatus(`${r.message} · ${r.travel.seconds}s`);
  } catch (err) {
    setStatus('Scout failed: ' + err.message, true);
  }
}

// --- keyboard shortcuts (SOTD QoL): discoverable via the (key) hints on buttons.
// Guards: ignore when typing in a field or using a modifier chord.
const openPanel = async (fn, ...args) => { try { await fn(...args); } catch (e) { setStatus(e.message, true); } };
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (context.isOpen()) return;   // menu owns the keyboard while open (letter shortcuts + Esc)
  if (e.key === 'Escape') {
    // Close whatever floating window is open, newest concern first.
    if (notify.isLogOpen()) { notify.toggleLog(); return; }
    if (tactical.isOpen()) { tactical.hide(); activePlace = null; return; }
    panel.hide(); activePlace = null; view.setSelected(null); view.setSelectedCell(null); requestRender();
    for (const id of ['research', 'toolshop', 'forces', 'inventory', 'admin', 'objectives', 'power', 'identity', 'ally']) document.getElementById(id)?.classList.remove('open');
    return;
  }
  if (!playing) return;
  const key = e.key.toLowerCase();
  const facSlot = slotForKey(key);            // every facility has its own screen key
  if (facSlot) { openFacilityScreen(facSlot); e.preventDefault(); return; }
  switch (key) {
    case 'q': openPanel(async () => forces.show(await getForces(), activeSquadId)); break;
    case 'b': openPanel(async () => inventory.show(await getInventory())); break;
    case 'o': openPanel(async () => objectives.show(await getObjectives())); break;
    case 'l': notify.toggleLog(); break;
    case 'm': setMode(mode === 'compound' ? 'world' : 'compound'); break;
    case '+': case '=': zoomControls.querySelector('[data-zoom="in"]')?.click(); break;
    case '-': case '_': zoomControls.querySelector('[data-zoom="out"]')?.click(); break;
    default: return;
  }
  e.preventDefault();
});

window.addEventListener('resize', requestRender);
// Returning to a backgrounded tab pulls fresh authoritative state and shows the away recap.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && playing) load(); });

boot();
