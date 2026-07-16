// Entry point: the new-user gameflow (start screen → new game → play), then the
// compound / world views.
// On-demand rendering (not a perpetual rAF loop): rAF is paused when the page isn't
// visible — e.g. headless/preview panes — which would leave the canvas blank.
import './style.css';
import {
  getStronghold, getSource, getFacility, getFacilityCatalog, getMap, getBuilding, getInventory, getResearch, getForces, postForces, postResearch, postInventoryAction, postFacilityAssignment, postCraft, postAdmin, postBuild, postScout, postRoomAction,
  getSession, postNewGame, postResume,
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

const SAVE_KEY = 'zv2.userid';   // remembers the player so a reload resumes the game

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

const view = createView(canvas);
const hud = createHud(document.getElementById('hud'));
const panel = createPanel(document.getElementById('panel'), {
  onClose: () => { activePlace = null; view.setSelected(null); requestRender(); },
  onUpgrade: async (slot) => {
    setStatus('Starting build…');
    try {
      const r = await postBuild(slot);
      await load();                          // refresh resources and levels
      panel.show(await getFacility(slot));   // refresh the open panel
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
      setStatus(r.message || 'Construction started.');
    } catch (e) {
      setStatus(e.message, true);
      try { panel.showBuildSite(await getFacilityCatalog(), gridX, gridY); } catch { /* preserve original error */ }
    }
  },
  onStaff: async (action, slot, survivor) => {
    try {
      const r = await postFacilityAssignment(action, slot, survivor);
      await load();
      panel.show(await getFacility(slot));
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
      setStatus(r.message || 'Done.');
    } catch (e) { setStatus(e.message, true); }
  },
});
const inventory = createInventory(document.getElementById('inventory'), {
  onAction: async (action, survivor, item) => {
    try {
      const r = await postInventoryAction(action, survivor, item);
      inventory.show(await getInventory());
      if (activePlace) panel.showPlace(await getBuilding(activePlace.x, activePlace.y, activePlace.squadId));
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
const admin = createAdmin(document.getElementById('admin'), { onAction: async (action) => { try { const r=await postAdmin(action); admin.show(); await load(); if(mode==='world') { worldState=await getMap(12,activeSquadId); requestRender(); } setStatus(r.message); } catch(e) { admin.show(); setStatus(e.message,true); } } });
const research = createResearch(document.getElementById('research'), { onStart: async (tech) => { try { const r=await postResearch(tech); research.show(await getResearch()); setStatus(r.message); } catch(e) { setStatus(e.message,true); research.show(await getResearch()); } } });
const toolshop = createToolshop(document.getElementById('toolshop'), { onProduce: async (recipe) => { try { const r=await postCraft(recipe); toolshop.show(await getInventory()); setStatus(r.message); } catch(e) { setStatus(e.message,true); toolshop.show(await getInventory()); } } });
const forces = createForces(document.getElementById('forces'), {
  onSelect: async (id) => { activeSquadId=id; try { worldState=await getMap(12,id); requestRender(); forces.show(await getForces(),id); setStatus(`${worldState.squad.name} selected for deployment.`); } catch(e){setStatus(e.message,true);} },
  onAction: async (action,survivor,squad,focus) => { try { const r=await postForces(action,survivor,squad,focus); forces.show(await getForces(),activeSquadId); if(mode==='world'){worldState=await getMap(12,activeSquadId);requestRender();}setStatus(r.message); } catch(e){setStatus(e.message,true);forces.show(await getForces(),activeSquadId);} }
});
const start = createStart(document.getElementById('start'), {
  onNewGame: newGame,
  onCancel: () => { if (player) start.hide(); },
});

let state = null;
let player = null;
let playing = false;
let mode = 'compound';        // 'compound' | 'world'
let worldState = null;
let activePlace = null;
let activeSquadId = 0;
let seenRaidTime = 0;

function setStatus(msg, isError) {
  statusEl.textContent = msg || '';
  statusEl.classList.toggle('error', !!isError);
}

function requestRender() {
  if (!playing) return;
  view.resize();              // keep the canvas sized to the viewport
  if (mode === 'world') { if (worldState) view.renderWorld(worldState); }
  else if (state) view.render(state);
}

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
  await load();
  try { const f=await getForces(); if(!activeSquadId)activeSquadId=f.squads?.[0]?.id||0; } catch { /* map can choose the first squad */ }
}

function leaveToStart(error) {
  playing = false; state = null; player = null;
  document.body.classList.remove('playing');
  panel.hide();
  start.show({ error });
}

newGameBtn.addEventListener('click', () => start.show({ canCancel: !!player }));
adminBtn.addEventListener('click', () => admin.show());
researchBtn.addEventListener('click', async () => { try { research.show(await getResearch()); } catch(e) { setStatus(e.message,true); } });
toolshopBtn.addEventListener('click', async () => { try { toolshop.show(await getInventory()); } catch(e) { setStatus(e.message,true); } });
forcesBtn.addEventListener('click', async () => { try { forces.show(await getForces(),activeSquadId); } catch(e) { setStatus(e.message,true); } });
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

// --- state -----------------------------------------------------------------
async function load() {
  if (!playing) return;
  try {
    state = fromApi(await getStronghold());
    setStatus(getSource() === 'mock' ? 'mock data (API offline) · drag to pan' : 'live · drag to pan');
    const raid = state.world?.lastRaid;
    if (raid?.time && raid.time > seenRaidTime) {
      seenRaidTime = raid.time;
      setStatus(raid.success
        ? `Night raid repelled · defence ${raid.defense} vs threat ${raid.threat}`
        : `Defences breached · ${raid.resourceLoss} supplies lost${raid.wounded ? ` · ${raid.wounded} wounded` : ''}`, !raid.success);
    }
  } catch (e) {
    if (e.code === 'no_player') { leaveToStart('Your session expired — start a new game.'); return; }
    console.error(e);
    setStatus('Failed to load stronghold: ' + e.message, true);
  }
  hud.render(state);
  requestRender();
}

// live tick: HUD interpolation, plus build-countdown re-render + finalize on completion
const finalizeTriggered = new Set();
setInterval(() => {
  if (!playing || !state) return;
  hud.render(state);
  const builds = state.builds || [];
  if (builds.length && mode === 'compound') requestRender();   // tick the countdown badges
  for (const b of builds) {
    if (b.due * 1000 <= Date.now() && !finalizeTriggered.has(b.slot)) {
      finalizeTriggered.add(b.slot);
      load();   // server finalizes completed Zv2 construction
    }
  }
  for (const slot of finalizeTriggered) if (!builds.some((b) => b.slot === slot)) finalizeTriggered.delete(slot);
}, 1000);

setInterval(() => { if (playing) load(); }, 15000);   // re-poll; server is authoritative
setInterval(() => { if (playing && research.isOpen()) getResearch().then((d) => research.show(d)).catch(() => {}); }, 3000);
setInterval(() => { if (playing && toolshop.isOpen()) getInventory().then((d) => toolshop.show(d)).catch(() => {}); }, 3000);
setInterval(() => { if (playing && forces.isOpen()) getForces().then((d) => forces.show(d,activeSquadId)).catch(() => {}); }, 3000);
setInterval(async () => {
  if (!playing || mode !== 'world' || !worldState?.squad?.traveling) return;
  try {
    worldState = await getMap(12,activeSquadId); requestRender();
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
  panel.hide(); view.setSelected(null);
  activePlace = null;
  zoomControls.classList.remove('hidden');
  if (m === 'world' && !worldState) {
    try { worldState = await getMap(12,activeSquadId); if(!activeSquadId)activeSquadId=worldState.squad.id; }
    catch (e) { setStatus('map load failed: ' + e.message, true); }
  }
  modeBtn.textContent = m === 'world' ? '🏠 Compound' : '🗺 World map';
  setStatus(m === 'world'
    ? 'the wasteland · drag to pan'
    : (getSource() === 'mock' ? 'mock data (API offline) · drag to pan' : 'live · drag to pan'));
  requestRender();
}

// --- input: drag-to-pan + click-to-select ----------------------------------
let drag = null, moved = false;
canvas.addEventListener('pointerdown', (e) => {
  if (!playing) return;
  drag = { x: e.clientX, y: e.clientY, cx: view.cam.x, cy: view.cam.y };
  moved = false;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
  view.cam.x = drag.cx + dx;
  view.cam.y = drag.cy + dy;
  requestRender();
});
canvas.addEventListener('pointerup', (e) => {
  const wasClick = drag && !moved;
  drag = null;
  if (wasClick) onClick(e);
});
canvas.addEventListener('pointercancel', () => { drag = null; });
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
  if (!hit) { view.setSelected(null); panel.hide(); requestRender(); return; }
  if (hit.empty) {
    view.setSelected(null);
    requestRender();
    try { panel.showBuildSite(await getFacilityCatalog(), hit.gridX, hit.gridY); }
    catch (err) { setStatus('Build catalog failed: ' + err.message, true); }
    return;
  }
  view.setSelected(hit.slot);
  requestRender();
  try { panel.show(await getFacility(hit.slot)); }
  catch (err) { setStatus('facility load failed: ' + err.message, true); }
}

// Wasteland: click a known place to inspect it, or a dashed frontier tile to explore.
async function onWorldClick(x, y) {
  const t = view.worldPick(x, y);
  if (!t) return;
  const squad=worldState?.squad;
  if (squad?.traveling) { setStatus(`Squad already traveling · ${Math.max(0,squad.arrivesAt-Math.floor(Date.now()/1000))}s remaining`,true); return; }
  if (t.seen) {
    if (!squad || squad.x !== t.x || squad.y !== t.y) {
      try { const r=await postScout(t.x,t.y,activeSquadId); worldState=await getMap(12,activeSquadId); requestRender(); setStatus(r.message); } catch(err) { setStatus(err.message,true); } return;
    }
    if (t.home) { setStatus(`${t.name} — squad is home (${t.x}|${t.y})`); return; }
    setStatus(`Entering ${t.name}…`);
    try {
      activePlace = { x: t.x, y: t.y, squadId:activeSquadId };
      panel.showPlace(await getBuilding(t.x, t.y, activeSquadId));
      setStatus(`${t.name} · ${t.rooms || 0} rooms (${t.x}|${t.y})`);
    } catch (err) {
      setStatus('Building load failed: ' + err.message, true);
    }
    return;
  }
  if (!t.scoutable) { setStatus('Too far — explore outward from ground you know.', true); return; }
  setStatus('Scouting…');
  try {
    const r = await postScout(t.x, t.y, activeSquadId);
    worldState = await getMap(12,activeSquadId);
    requestRender();
    setStatus(`${r.message} · ${r.travel.seconds}s`);
  } catch (err) {
    setStatus('Scout failed: ' + err.message, true);
  }
}

window.addEventListener('resize', requestRender);

boot();
