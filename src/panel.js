// Facility detail panel (DOM overlay). Shows real data from GET /api/facility,
// and starts an upgrade via the onUpgrade callback (P2 write-path). When the
// facility is mid-build it shows a construction countdown instead of the button.
import { RES, facInfo, FAC_CAT, fmtDuration, fmtNum, resIcon } from './config.js';
import { makeDraggable } from './draggable.js';
import { itemTip } from './items.js';

const resName = (key) => RES.find((r) => r.key === key)?.name || key;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));

export function createPanel(el, opts = {}) {
  const onClose = opts.onClose || (() => {});
  const onUpgrade = opts.onUpgrade || (() => {});
  const onPlace = opts.onPlace || (() => {});
  const onStaff = opts.onStaff || (() => {});
  const onStaffInfo = opts.onStaffInfo || (() => {});
  const onActivity = opts.onActivity || (() => {});
  const onRoomAction = opts.onRoomAction || (() => {});
  let current = null;
  const dragger = makeDraggable(el, { handle: '.panel-hd', storageKey: 'zv2.window.details' });
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="close"]')) { hide(); onClose(); return; }
    const up = e.target.closest('[data-act="upgrade"]');
    if (up && !up.disabled && current && !current.atMax && !current.building) onUpgrade(current.slot);
    const act = e.target.closest('[data-activity]');
    if (act && current) { onActivity(current.slot, Number(act.dataset.activity)); return; }
    const staffOpen = e.target.closest('[data-staff-open]');
    if (staffOpen) { onStaffInfo(Number(staffOpen.dataset.staffOpen)); return; }
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
      // OG cost table: icon + name, the REQUIRED amount big; a red "have N"
      // note plus a Missing summary only when you fall short.
      const missing = (d.nextCost || []).filter((c) => c.enough === false);
      const costRows = (d.nextCost || []).length
        ? d.nextCost.map((c) => `<li class="${c.enough === false ? 'missing' : ''}" data-tip="${resName(c.res)}: ${fmtNum(c.owned ?? 0)} in storage, ${fmtNum(c.amount)} needed"><span><em class="res-ic">${resIcon(c.res)}</em> ${resName(c.res)}</span><b>${fmtNum(c.amount)}${c.enough === false ? ` <em class="cost-have">have ${fmtNum(c.owned ?? 0)}</em>` : ''}</b></li>`).join('')
        : '<li class="muted">free</li>';
      const missingLine = missing.length
        ? `<div class="panel-missing">Missing: ${missing.map((c) => `<em class="res-ic">${resIcon(c.res)}</em> ${fmtNum(c.amount - (c.owned ?? 0))} ${resName(c.res)}`).join(' · ')}</div>`
        : '';
      const buttonLabel = d.atMax ? 'Max level'
        : d.canUpgrade ? 'Upgrade to level ' + d.nextLevel
        : missing.length ? `Missing: ${missing.map((c) => `<em class="res-ic">${resIcon(c.res)}</em> ${fmtNum(c.amount - (c.owned ?? 0))}`).join('  ')}`
        : (d.upgradeReason || 'Unavailable');
      const benefitTip = (d.upgradeBenefits || []).length ? `Upgrade benefits:\n${d.upgradeBenefits.map((benefit) => `• ${benefit}`).join('\n')}` : 'Upgrade this facility to improve its capabilities.';
      const upgradeTip = [benefitTip, missing.length ? `Still needed: ${missing.map((c) => `${fmtNum(c.amount - (c.owned ?? 0))} ${resName(c.res)}`).join(', ')}` : d.upgradeReason].filter(Boolean).join('\n\n');
      body = `
        <div class="panel-sec">${d.atMax ? 'Fully upgraded' : 'Cost to upgrade'}</div>
        <ul class="panel-cost">${d.atMax ? '' : costRows}</ul>
        ${d.atMax ? '' : missingLine}
        <button class="panel-upgrade" data-act="upgrade"${!d.canUpgrade ? ' disabled' : ''} data-tip="${esc(upgradeTip)}">
          ${buttonLabel}
        </button>`;
    }

    const staffing = d.staffing || { capacity: 0, survivors: [], effect: '' };
    const assigned = staffing.survivors.filter((s) => s.jobFacility === d.slot).length;
    const staffRows = staffing.survivors.map((s) => {
      const here = s.jobFacility === d.slot;
      const full = !here && assigned >= staffing.capacity;
      const disabled = !here && (!s.available || full);
      // OG rule: say WHY someone can't be assigned, not just "unavailable".
      const assignment = s.job ? `facility: ${s.job}`
        : s.squad ? `squad: ${s.squad}${s.squadAway ? ' · outside compound' : ' · at compound'}`
        : s.treatment ? 'Hospital treatment'
        : 'reserve';
      const status = here ? `assigned here · ${assignment}`
        : (s.unavailableReason ? `${assignment} · ${s.unavailableReason}`
          : (full ? `${assignment} · facility staff is full` : `${assignment} · ready to assign`));
      const tip = `${s.name}\nHP ${s.hp}/${s.maxHp} · fatigue ${s.fatigue}%\n⚔ ${s.attack ?? '?'} · 🛡 ${s.defense ?? '?'}${s.squad ? `\nSquad: ${s.squad}${s.squadTraveling ? ' (traveling)' : ''}` : ''}\n${status}`;
      const btnTip = disabled ? (s.unavailableReason || (full ? `Staff limit ${staffing.capacity} reached — upgrade the facility` : 'Unavailable')) : (here ? 'Send back to the reserve' : 'Assign to this facility');
      return `<li data-tip="${esc(tip)}"><span><button class="staff-name" data-staff-open="${s.id}" data-tip="Open squad & survivor overview">${esc(s.name)}</button><small>${s.hp}/${s.maxHp} HP · ${s.fatigue}% fatigue · ${esc(status)}</small></span><button data-staff-act="${here ? 'unassign' : 'assign'}" data-survivor="${s.id}"${disabled ? ' disabled' : ''} data-tip="${esc(btnTip)}">${here ? 'Rest' : 'Assign'}</button></li>`;
    }).join('');
    const staffBlock = `<div class="panel-sec staff-title">Staffing · ${assigned}/${staffing.capacity}</div><p class="staff-effect">${esc(staffing.effect)}</p><ul class="staff-list">${staffRows}</ul>`;
    // OG activity throttle: scales this facility's power draw, output AND job cap.
    const activityBlock = d.adjustable ? `
      <div class="panel-sec">Output level · ${d.activity}%</div>
      <p class="staff-effect">Throttling cuts power draw, production and job slots together${d.drain ? ` · drawing ${d.drain} power` : ''}.</p>
      <div class="activity-row">${[0, 25, 50, 75, 100].map((p) => `<button data-activity="${p}" class="${d.activity === p ? 'on' : ''}" data-tip="Run ${esc(d.name)} at ${p}%${p === 0 ? ' (idle — no power, no output)' : ''}">${p}%</button>`).join('')}</div>` : '';
    // --- facility-specific sections, mirroring each OG facility page ---
    let special = '';
    if (d.garage) {
      const g = d.garage;
      const fleet = g.vehicles.length ? g.vehicles.map((v) => `<li data-tip="${esc(v.type)}\n${v.seats} seats · +${v.cargoBonus} kg cargo · +${v.speedBonus}% speed\n${v.fuelPerTile} fuel per tile">
          <span><b>🚗 ${esc(v.name)}</b><small>${esc(v.type)} · ${v.seats} seats · +${v.cargoBonus} kg${v.squad ? ` · with ${esc(v.squad)}` : ' · in the yard'}</small></span>
          <i class="fuel-gauge" data-tip="Fuel ${v.fuel}/${v.fuelCapacity}"><em style="width:${v.fuelCapacity ? Math.min(100, (v.fuel / v.fuelCapacity) * 100) : 0}%"></em></i>
          <b>${v.fuel}/${v.fuelCapacity}</b></li>`).join('') : '<li class="muted">No vehicles restored yet.</li>';
      const blueprints = g.types.map((t) => `<li class="${t.unlocked ? '' : 'locked'}" data-tip="${esc(t.description)}\n${t.seats} seats · +${t.cargoBonus} kg · +${t.speedBonus}% speed\nTank ${t.fuelCapacity} · ${t.fuelPerTile} fuel/tile">
          <span><b>${esc(t.name)}</b><small>${t.unlocked ? `${fmtNum(t.metalCost)} metal · ${fmtNum(t.woodCost)} wood` : `Garage level ${t.garageLevel} required`}</small></span></li>`).join('');
      special = `<div class="panel-sec">Vehicle yard · ${g.vehicles.length}/${g.capacity}</div>
        <p class="staff-effect">Garage level ${d.level} houses ${g.capacity} vehicle${g.capacity === 1 ? '' : 's'} · ${fmtNum(g.petrol)} petrol in store. Restore and assign vehicles from the Squads window.</p>
        <ul class="yard-list">${fleet}</ul>
        <div class="panel-sec">Blueprints</div><ul class="yard-list blueprints">${blueprints}</ul>`;
    }
    if (d.storage) {
      const s = d.storage;
      const resRows = s.resources.map((r) => `<li data-tip="${resName(r.res)}: ${fmtNum(r.amount)}${r.cap ? ` of ${fmtNum(r.cap)}` : ' (uncapped)'}"><span><em class="res-ic">${resIcon(r.res)}</em> ${resName(r.res)}</span><b>${fmtNum(r.amount)}${r.cap ? ` <small>/ ${fmtNum(r.cap)}</small>` : ''}</b></li>`).join('');
      const groups = {};
      for (const it of s.stock) (groups[it.category] ??= []).push(it);
      const stockRows = Object.keys(groups).length ? Object.entries(groups).map(([cat, list]) => `
          <li class="stock-group">${esc(cat)}</li>
          ${list.map((it) => `<li data-tip="${esc(itemTip(it.id) || it.name)}"><span>${esc(it.name)}${it.durability !== null && it.maxDurability ? `<small>${it.durability}/${it.maxDurability} condition</small>` : ''}</span><b>${fmtNum(it.amount)}×</b></li>`).join('')}`).join('')
        : '<li class="muted">The stash is empty — bring loot home and deposit it.</li>';
      special = `<div class="panel-sec">Resource stores</div><ul class="panel-cost store-res">${resRows}</ul>
        <p class="staff-effect">Storage level ${d.level} supports ${s.scavengerCap} scavenger${s.scavengerCap === 1 ? '' : 's'} · ${s.scavengers} assigned · ${s.productionFactor}× raw-resource output. Resource caps come from Life Support, Scrapyard and Garage.</p>
        <div class="panel-sec">Stash · ${s.stock.length} item type${s.stock.length === 1 ? '' : 's'}</div>
        <ul class="stock-list">${stockRows}</ul>`;
    }
    if (d.defense) {
      const f = d.defense;
      const rows = f.items.length ? f.items.map((it) => `<li data-tip="${esc(itemTip(it.id) || it.name)}\nEach adds ${it.defenseBonus} defence"><span>${esc(it.name)}</span><b>${it.amount}× <small>+${it.total}</small></b></li>`).join('') : '<li class="muted">No defensive equipment built. Craft barricades in the Toolshop.</li>';
      special = `<div class="panel-sec">Compound defence · ${f.total}</div>
        <p class="staff-effect">Walls contribute +${f.wallBonus} at level ${d.level}; posted survivors and defensive gear add the rest. Nightly hordes must be out-defended.</p>
        <ul class="panel-cost">${rows}</ul>`;
    }
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
      ${special}
      ${patientBlock}
      ${staffBlock}
      ${activityBlock}
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
      const infected = (r.infected || []).map((z) => {
        const stats = z.hp ? ` <i class="z-stats" data-tip="HP ${z.hp} · ATK ${z.attack} · DEF ${z.defense}">⚔${z.attack} 🛡${z.defense}</i>` : '';
        const lead = z.hp && z.frontHp < z.hp ? ` <em class="z-lead">lead ${z.frontHp}/${z.hp} HP</em>` : '';
        return `${z.amount}× ${esc(z.name)}${stats}${lead}`;
      }).join(', ');
      const vehicles = (r.vehicles || []).map((v) => `<div class="room-vehicle"><span><b>🚗 ${esc(v.name)}</b><small>${v.seats} seats · +${v.cargoBonus} cargo · ${v.fuel}/${v.fuelCapacity} fuel left</small></span><button data-room-act="claim_vehicle" data-room="${r.id}" data-item="${v.id}"${r.zombies > 0 ? ' disabled' : ''}>Drive off</button></div>`).join('');
      const items = (r.items || []).map((item) => `<button class="room-loot" data-room-act="loot" data-room="${r.id}" data-item="${item.id}"${r.zombies > 0 ? ' disabled' : ''} data-tip="${esc(itemTip(item.id) || item.name)}${r.zombies > 0 ? '\nClear the infected before scavenging' : ''}">
        <span>${esc(item.name)}</span><b>${item.amount}×</b><small>owned ${item.owned}</small>
      </button>`).join('');
      const fighters = survivors.map((s) => {const state=s.weapon?[s.maxDurability?`${s.durability}/${s.maxDurability}`:'',s.ammoItem?`${s.ammo} ammo`:''].filter(Boolean).join(' · '):'';const disabled=!s.available?' disabled':'';return `<div class="fighter-card"><div><span>${esc(s.name)} · ${s.hp}/${s.maxHp} HP</span><b>ATK ${s.attack}</b><small>${s.unavailableReason ? esc(s.unavailableReason) : `${esc(s.weapon || 'unarmed')}${state?` · ${state}`:''}`}</small></div><div class="stance-buttons"><button data-room-act="fight" data-room="${r.id}" data-survivor="${s.id}" data-option="precise"${disabled}>Attack · Precise</button><button class="rush" data-room-act="fight" data-room="${r.id}" data-survivor="${s.id}" data-option="aggressive"${disabled}>Attack · Rush</button><button class="guard" data-room-act="fight" data-room="${r.id}" data-survivor="${s.id}" data-option="guarded"${disabled}>Attack · Guard</button></div></div>`}).join('');
      const action = r.zombies > 0
        ? `<div class="fight-prompt">${r.intel ? `Intel +${r.intel} ATK · ` : ''}choose survivor and attack</div>${fighters}<button class="room-retreat" data-room-act="retreat" data-room="${r.id}" data-tip="Speed contest: escape roll vs the infected — failure costs a free strike">Retreat (flee roll)</button>`
        : items + vehicles;
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
      const costs = (f.cost || []).map((c) => `<span class="${c.enough ? '' : 'missing'}" data-tip="${esc(resName(c.res))}: ${fmtNum(c.owned)} in storage, ${fmtNum(c.amount)} needed"><em class="res-ic">${resIcon(c.res)}</em> ${fmtNum(c.amount)}</span>`).join('');
      return `<li class="build-choice"><div><b>${esc(f.name)}</b><small>${esc(f.description || '')}</small><p>${costs || '<span>free</span>'}</p></div><button data-place-type="${f.type}"${f.canBuild ? '' : ' disabled'} title="${esc(f.reason || '')}">${f.canBuild ? 'Build' : esc(f.reason || 'Unavailable')}</button></li>`;
    }).join('') : '<li class="room-empty">All facility types have been placed.</li>';
    el.innerHTML = `<div class="panel-hd build-hd"><button class="panel-x" data-act="close" aria-label="Close">✕</button><div class="panel-cat">Empty compound plot · ${gridX + 1}|${gridY + 1}</div><h2>Construct a facility</h2><div class="panel-lvl">Choose what to establish here</div></div><p class="panel-desc">The plot stays reserved for this facility while construction is underway.</p><ul class="build-catalog">${rows}</ul>`;
    el.classList.add('open');
    dragger.restore();
  }

  return { show, showPlace, showBuildSite, hide };
}
