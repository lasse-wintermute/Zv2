// Facility detail panel (DOM overlay). Shows real data from GET /api/facility,
// and starts an upgrade via the onUpgrade callback (P2 write-path). When the
// facility is mid-build it shows a construction countdown instead of the button.
import { RES, facInfo, FAC_CAT, fmtDuration } from './config.js';
import { makeDraggable } from './draggable.js';

const resName = (key) => RES.find((r) => r.key === key)?.name || key;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));

export function createPanel(el, opts = {}) {
  const onClose = opts.onClose || (() => {});
  const onUpgrade = opts.onUpgrade || (() => {});
  const onPlace = opts.onPlace || (() => {});
  const onStaff = opts.onStaff || (() => {});
  const onRoomAction = opts.onRoomAction || (() => {});
  let current = null;
  const dragger = makeDraggable(el, { handle: '.panel-hd', storageKey: 'zv2.window.details' });
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="close"]')) { hide(); onClose(); return; }
    const up = e.target.closest('[data-act="upgrade"]');
    if (up && !up.disabled && current && !current.atMax && !current.building) onUpgrade(current.slot);
    const staff = e.target.closest('[data-staff-act]');
    if (staff && !staff.disabled && current) { staff.disabled = true; onStaff(staff.dataset.staffAct, current.slot, Number(staff.dataset.survivor)); return; }
    const place = e.target.closest('[data-place-type]');
    if (place && !place.disabled && current?.kind === 'build-site') {
      place.disabled = true;
      onPlace(Number(place.dataset.placeType), current.gridX, current.gridY);
      return;
    }
    const roomAct = e.target.closest('[data-room-act]');
    if (roomAct && !roomAct.disabled) {
      roomAct.disabled = true;
      onRoomAction(roomAct.dataset.roomAct, Number(roomAct.dataset.room), Number(roomAct.dataset.item || 0), Number(roomAct.dataset.survivor || 0), roomAct.dataset.option || '');
    }
  });

  function hide() { el.classList.remove('open'); el.innerHTML = ''; current = null; }

  function show(d) {
    current = d;
    const info = facInfo(d.type);
    const color = FAC_CAT[info.cat] || '#888';
    const lvl = d.atMax
      ? `Level ${d.level} · <span class="max">MAX</span>`
      : `Level ${d.level} <span class="arrow">→</span> ${d.nextLevel}`;

    let body;
    if (d.building) {
      const remaining = d.building.due - Date.now() / 1000;
      body = `
        <div class="panel-sec">Under construction</div>
        <div class="panel-building">⏳ Upgrading to level ${d.building.toLevel}
          — <b>${remaining > 0 ? fmtDuration(remaining) + ' left' : 'finishing…'}</b></div>
        <button class="panel-upgrade" disabled>Building…</button>`;
    } else {
      const costRows = (d.nextCost || []).length
        ? d.nextCost.map((c) => `<li class="${c.enough === false ? 'missing' : ''}"><span>${resName(c.res)}</span><b>${c.owned ?? '?'} / ${c.amount}</b></li>`).join('')
        : '<li class="muted">free</li>';
      const reqBlock = (d.nextReq || []).length
        ? `<div class="panel-sec">Requires</div>
           <ul class="panel-cost">${d.nextReq.map((r) => `<li><span>${r.name}</span><b>${r.amount}</b></li>`).join('')}</ul>`
        : '';
      body = `
        <div class="panel-sec">${d.atMax ? 'Fully upgraded' : 'Cost to upgrade'}</div>
        <ul class="panel-cost">${d.atMax ? '' : costRows}</ul>
        ${d.atMax ? '' : reqBlock}
        <button class="panel-upgrade" data-act="upgrade"${!d.canUpgrade ? ' disabled' : ''} title="${esc(d.upgradeReason || '')}">
          ${d.atMax ? 'Max level' : (d.canUpgrade ? 'Upgrade to level ' + d.nextLevel : (d.upgradeReason || 'Unavailable'))}
        </button>`;
    }

    const staffing = d.staffing || { capacity: 0, survivors: [], effect: '' };
    const assigned = staffing.survivors.filter((s) => s.jobFacility === d.slot).length;
    const staffRows = staffing.survivors.map((s) => {
      const here = s.jobFacility === d.slot;
      const full = !here && assigned >= staffing.capacity;
      const disabled = !here && (!s.available || full);
      const status = s.treatment ? 'Hospital patient' : (here ? 'assigned here' : (s.job ? `working: ${s.job}` : (s.available ? 'resting' : 'unavailable')));
      return `<li><span><b>${esc(s.name)}</b><small>${s.hp}/${s.maxHp} HP · ${s.fatigue}% fatigue · ${esc(status)}</small></span><button data-staff-act="${here ? 'unassign' : 'assign'}" data-survivor="${s.id}"${disabled ? ' disabled' : ''}>${here ? 'Rest' : 'Assign'}</button></li>`;
    }).join('');
    const staffBlock = `<div class="panel-sec staff-title">Staffing · ${assigned}/${staffing.capacity}</div><p class="staff-effect">${esc(staffing.effect)}</p><ul class="staff-list">${staffRows}</ul>`;
    const patients=d.slot===16?(d.patients||[]):[];
    const patientRows=patients.map(p=>{const remaining=Math.max(0,p.due-Date.now()/1000),total=Math.max(1,p.due-p.startedAt),progress=Math.min(100,Math.max(0,(1-remaining/total)*100));return `<li><span><b>${esc(p.name)} · Soldier Lv ${p.soldierLevel}</b><small>Hospital Lv ${p.hospitalLevel} · ${remaining>0?fmtDuration(remaining)+' remaining':'ready for discharge'}</small><i><em style="width:${progress}%"></em></i></span></li>`}).join('');
    const patientBlock=d.slot===16?`<div class="panel-sec patient-title">Patients · ${patients.length}</div><p class="staff-effect">Incapacitated squad members are admitted automatically after returning home. Higher soldier levels take longer; higher Hospital levels shorten treatment.</p><ul class="patient-list">${patientRows||'<li class="patient-empty">No critical patients.</li>'}</ul>`:'';

    el.innerHTML = `
      <div class="panel-hd" style="--c:${color}">
        <button class="panel-x" data-act="close" aria-label="Close">✕</button>
        <div class="panel-cat">${info.cat}</div>
        <h2>${d.name}</h2>
        <div class="panel-lvl">${lvl}</div>
      </div>
      <p class="panel-desc">${d.description || ''}</p>
      ${patientBlock}
      ${staffBlock}
      ${body}`;
    el.classList.add('open');
    dragger.restore();
  }

  function showPlace(payload) {
    const d = payload.building;
    const run = payload.run || { momentum: 0, nextReward: 5 };
    const cargo = payload.cargo || { items: [], used: 0, capacity: 0 };
    const survivors = payload.survivors || [];
    current = { kind: 'place', x: d.x, y: d.y };
    const rooms = d.rooms || [];
    const rows = rooms.length ? rooms.map((r, i) => {
      if (!r.discovered) {
        const choices = r.accessible ? `<div class="breach-choices">
          <button data-room-act="discover" data-room="${r.id}" data-option="quiet"><b>Listen</b><small>safe · +2 intel</small></button>
          <button data-room-act="discover" data-room="${r.id}" data-option="careful"><b>Search</b><small>slow · bonus loot</small></button>
          <button class="danger" data-room-act="discover" data-room="${r.id}" data-option="breach"><b>Kick door</b><small>free · ambush risk</small></button>
        </div>` : '<div class="room-locked">🔒 Secure the previous room to reach this door</div>';
        return `<li class="room-row room-unknown"><span class="room-name"><i>${i + 1}</i>Unknown room</span><span class="room-meta">No intel · choose how to enter</span>${choices}</li>`;
      }
      const danger = r.zombies > 0
        ? `<span class="room-danger">${r.zombies} zombie${r.zombies === 1 ? '' : 's'}</span>`
        : '<span class="room-clear">clear</span>';
      const loot = r.loot > 0 ? `${r.loot} item${r.loot === 1 ? '' : 's'}` : 'empty';
      const infected = (r.infected || []).map((z) => `${z.amount}× ${esc(z.name)}`).join(', ');
      const items = (r.items || []).map((item) => `<button class="room-loot" data-room-act="loot" data-room="${r.id}" data-item="${item.id}"${r.zombies > 0 ? ' disabled' : ''}>
        <span>${esc(item.name)}</span><b>${item.amount}×</b><small>owned ${item.owned}</small>
      </button>`).join('');
      const fighters = survivors.map((s) => {const state=s.weapon?[s.maxDurability?`${s.durability}/${s.maxDurability}`:'',s.ammoItem?`${s.ammo} ammo`:''].filter(Boolean).join(' · '):'';const disabled=!s.available?' disabled':'';return `<div class="fighter-card"><div><span>${esc(s.name)} · ${s.hp}/${s.maxHp} HP</span><b>ATK ${s.attack}</b><small>${s.unavailableReason ? esc(s.unavailableReason) : `${esc(s.weapon || 'unarmed')}${state?` · ${state}`:''}`}</small></div><div class="stance-buttons"><button data-room-act="fight" data-room="${r.id}" data-survivor="${s.id}" data-option="precise"${disabled}>Attack · Precise</button><button class="rush" data-room-act="fight" data-room="${r.id}" data-survivor="${s.id}" data-option="aggressive"${disabled}>Attack · Rush</button><button class="guard" data-room-act="fight" data-room="${r.id}" data-survivor="${s.id}" data-option="guarded"${disabled}>Attack · Guard</button></div></div>`}).join('');
      const action = r.zombies > 0
        ? `<div class="fight-prompt">${r.intel ? `Intel +${r.intel} ATK · ` : ''}choose survivor and attack</div>${fighters}<button class="room-retreat" data-room-act="retreat" data-room="${r.id}">Retreat</button>`
        : items;
      return `<li class="room-row" style="--room-x:${r.gridX || 0};--room-y:${r.gridY || 0}">
        <span class="room-name"><i>${i + 1}</i>${esc(r.name)}</span>
        <span class="room-meta">${loot} · ${danger}</span>
        ${infected ? `<span class="room-hostiles">${infected}</span>` : ''}
        <div class="room-actions">${action || '<span class="room-searched">Room fully scavenged</span>'}</div>
      </li>`;
    }).join('') : '<li class="room-empty">No accessible rooms found.</li>';

    el.innerHTML = `
      <div class="panel-hd place-hd">
        <button class="panel-x" data-act="close" aria-label="Close">✕</button>
        <div class="panel-cat">Discovered location · ${d.x}|${d.y}</div>
        <h2>${esc(d.name)}</h2>
        <div class="panel-lvl">${rooms.length} room${rooms.length === 1 ? '' : 's'} mapped</div>
      </div>
      <p class="panel-desc">Your scouts mapped the interior. Clear infected rooms before scavenging their supplies.</p>
      <div class="expedition-meters"><div class="momentum"><span>RUN MOMENTUM</span><b>${run.momentum}/${run.nextReward}</b><i><em style="width:${Math.min(100, run.momentum / run.nextReward * 100)}%"></em></i><small>Fill the bar to earn a supply cache</small></div><div class="noise-meter ${run.noise >= 6 ? 'danger' : ''}"><span>BUILDING NOISE</span><b>${run.noise || 0}/12</b><i><em style="width:${Math.min(100,(run.noise || 0)/12*100)}%"></em></i><small>${run.noise >= 6 ? 'Nearby infected are alerted' : 'Quiet actions keep danger down'}</small></div></div>
      <div class="cargo-meter"><span>SQUAD CARGO</span><b>${cargo.used}/${cargo.capacity} kg</b><i><em style="width:${cargo.capacity ? Math.min(100,cargo.used/cargo.capacity*100) : 0}%"></em></i><small>${cargo.items.length ? cargo.items.map(i=>`${esc(i.name)} ×${i.amount}`).join(' · ') : 'Empty — carried loot is deposited after returning home'}</small></div>
      <ul class="room-list room-map">${rows}</ul>
      <div class="panel-coming">Choose quiet entries and guarded attacks to control noise, then return home to bank carried loot.</div>`;
    el.classList.add('open');
    dragger.restore();
  }

  function showBuildSite(payload, gridX, gridY) {
    current = { kind: 'build-site', gridX, gridY };
    const facilities = payload.facilities || [];
    const rows = facilities.length ? facilities.map((f) => {
      const costs = (f.cost || []).map((c) => `<span class="${c.enough ? '' : 'missing'}">${esc(resName(c.res))} ${c.owned}/${c.amount}</span>`).join('');
      return `<li class="build-choice"><div><b>${esc(f.name)}</b><small>${esc(f.description || '')}</small><p>${costs || '<span>free</span>'}</p></div><button data-place-type="${f.type}"${f.canBuild ? '' : ' disabled'} title="${esc(f.reason || '')}">${f.canBuild ? 'Build' : esc(f.reason || 'Unavailable')}</button></li>`;
    }).join('') : '<li class="room-empty">All facility types have been placed.</li>';
    el.innerHTML = `<div class="panel-hd build-hd"><button class="panel-x" data-act="close" aria-label="Close">✕</button><div class="panel-cat">Empty compound plot · ${gridX + 1}|${gridY + 1}</div><h2>Construct a facility</h2><div class="panel-lvl">Choose what to establish here</div></div><p class="panel-desc">The plot stays reserved for this facility while construction is underway.</p><ul class="build-catalog">${rows}</ul>`;
    el.classList.add('open');
    dragger.restore();
  }

  return { show, showPlace, showBuildSite, hide };
}
