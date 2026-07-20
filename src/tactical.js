// Tactical exploration scene — a full-screen floorplan of the building your
// squad is raiding. Rooms render as connected floor tiles (fog on undiscovered
// ones), the squad token walks the cleared path, and the selected room's
// actions (breach / D20 fight / loot / vehicle recovery) live in a side rail.
// Server-authoritative: every action goes through the same room-action API the
// list view used; this is a richer lens on identical state.
import { fmtNum } from './config.js';
import { itemTip } from './items.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createTactical(el, opts = {}) {
  const onAction = opts.onAction || (() => {});   // (action, roomId, item, survivor, option)
  const onClose = opts.onClose || (() => {});
  let data = null;          // last building payload
  let selectedRoom = null;  // room id the action rail describes

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-tactical-close]')) { hide(); onClose(); return; }
    const cell = e.target.closest('[data-tac-room]');
    if (cell) { selectedRoom = Number(cell.dataset.tacRoom); render(); return; }
    const act = e.target.closest('[data-room-act]');
    if (act && !act.disabled) {
      act.disabled = true;
      onAction(act.dataset.roomAct, Number(act.dataset.room), Number(act.dataset.item || 0), Number(act.dataset.survivor || 0), act.dataset.option || '');
    }
  });

  function hide() { el.classList.remove('open'); el.innerHTML = ''; data = null; selectedRoom = null; }
  function isOpen() { return el.classList.contains('open'); }

  // The squad stands in the deepest discovered room (the frontier of the crawl).
  function squadRoomId(rooms) {
    let id = null;
    for (const r of rooms) { if (r.discovered) id = r.id; else break; }
    return id ?? rooms[0]?.id;
  }

  function roomCell(r, isSquadHere, isSelected) {
    const cls = ['tac-room'];
    if (!r.discovered) cls.push(r.accessible ? 'frontier' : 'sealed');
    else if (r.zombies > 0) cls.push('infected');
    else cls.push('clear');
    if (isSelected) cls.push('selected');
    let body;
    if (!r.discovered) {
      body = r.accessible
        ? '<div class="tac-unknown">?</div><small>Breach point</small>'
        : '<div class="tac-unknown">🔒</div><small>Blocked</small>';
    } else {
      const zeds = r.zombies > 0
        ? `<div class="tac-zeds" data-tip="${esc((r.infected || []).map((z) => `${z.amount}× ${z.name} (HP ${z.hp} · ⚔${z.attack} · 🛡${z.defense})`).join('\n'))}">🧟 ${r.zombies}${(r.infected?.[0] && r.infected[0].frontHp < r.infected[0].hp) ? `<i class="tac-leadhp"><em style="width:${(r.infected[0].frontHp / r.infected[0].hp) * 100}%"></em></i>` : ''}</div>`
        : '';
      const loot = r.loot > 0 ? `<div class="tac-loot">📦 ${r.loot}</div>` : '';
      const veh = (r.vehicles || []).length ? '<div class="tac-veh">🚗</div>' : '';
      body = `${zeds}${loot}${veh}${!r.zombies && !r.loot && !(r.vehicles || []).length ? '<div class="tac-empty">cleared</div>' : ''}`;
    }
    return `<div class="${cls.join(' ')}" data-tac-room="${r.id}" style="grid-column:${r.gridX + 1};grid-row:${r.gridY + 1}">
      <span class="tac-num">${r.index}</span>
      <b class="tac-name">${esc(r.discovered ? r.name : 'Unknown')}</b>
      ${body}
      ${isSquadHere ? '<div class="tac-squad" data-tip="Your squad is here">▲ SQUAD</div>' : ''}
    </div>`;
  }

  function rail(r) {
    if (!r) return '<p class="tac-hint">Select a room on the floorplan.</p>';
    if (!r.discovered && !r.accessible) return `<h3>${esc(r.name)}</h3><p class="tac-hint">The way is blocked — secure the previous rooms first.</p>`;
    if (!r.discovered) {
      return `<h3>Breach: room ${r.index}</h3><p class="tac-hint">Choose how the squad opens this door.</p>
        <div class="breach-choices">
          <button data-room-act="discover" data-room="${r.id}" data-option="quiet"><b>Listen</b><small>safe · +2 intel</small></button>
          <button data-room-act="discover" data-room="${r.id}" data-option="careful"><b>Search</b><small>slow · bonus loot</small></button>
          <button class="danger" data-room-act="discover" data-room="${r.id}" data-option="breach"><b>Kick door</b><small>fast · ambush risk</small></button>
        </div>`;
    }
    if (r.zombies > 0) {
      const zeds = (r.infected || []).map((z) => `<div class="tac-zrow"><b>${z.amount}× ${esc(z.name)}</b><small>HP ${z.hp} · ⚔${z.attack} · 🛡${z.defense}${z.frontHp < z.hp ? ` · lead ${z.frontHp}/${z.hp}` : ''}</small></div>`).join('');
      const fighters = (data.survivors || []).map((s) => {
        const state = s.weapon ? [s.maxDurability ? `${s.durability}/${s.maxDurability}` : '', s.ammoItem ? `${s.ammo} ammo` : ''].filter(Boolean).join(' · ') : '';
        const dis = !s.available ? ' disabled' : '';
        return `<div class="fighter-card"><div><span>${esc(s.name)} · ${s.hp}/${s.maxHp} HP</span><b>ATK ${s.attack}</b><small>${s.unavailableReason ? esc(s.unavailableReason) : `${esc(s.weapon || 'unarmed')}${state ? ` · ${state}` : ''}`}</small></div>
          <div class="stance-buttons">
            <button data-room-act="fight" data-room="${r.id}" data-survivor="${s.id}" data-option="precise"${dis} data-tip="Normal stance — no modifiers">Precise</button>
            <button class="rush" data-room-act="fight" data-room="${r.id}" data-survivor="${s.id}" data-option="aggressive"${dis} data-tip="Berserk: ATT ×4/3, DEF ×2/3">Rush</button>
            <button class="guard" data-room-act="fight" data-room="${r.id}" data-survivor="${s.id}" data-option="guarded"${dis} data-tip="Defensive: ATT ×2/3, DEF ×4/3">Guard</button>
          </div></div>`;
      }).join('');
      return `<h3>${esc(r.name)} — contested</h3>${zeds}${r.intel ? `<p class="tac-hint">Intel +${r.intel} ATK</p>` : ''}${fighters}
        <button class="room-retreat" data-room-act="retreat" data-room="${r.id}" data-tip="Speed contest — failure costs a free strike">Retreat (flee roll)</button>`;
    }
    const items = (r.items || []).map((i) => `<button class="room-loot" data-room-act="loot" data-room="${r.id}" data-item="${i.id}" data-tip="${esc(itemTip(i.id) || i.name)}"><span>${esc(i.name)}</span><b>${i.amount}×</b><small>owned ${fmtNum(i.owned)}</small></button>`).join('');
    const vehicles = (r.vehicles || []).map((v) => `<div class="room-vehicle"><span><b>🚗 ${esc(v.name)}</b><small>${v.seats} seats · +${v.cargoBonus} cargo · ${v.fuel}/${v.fuelCapacity} fuel</small></span><button data-room-act="claim_vehicle" data-room="${r.id}" data-item="${v.id}">Drive off</button></div>`).join('');
    return `<h3>${esc(r.name)} — secure</h3>${items || ''}${vehicles || ''}${!items && !vehicles ? '<p class="tac-hint">Room fully scavenged.</p>' : ''}`;
  }

  function render() {
    if (!data) return;
    const b = data.building, rooms = b.rooms || [];
    const run = data.run || { momentum: 0, nextReward: 5, noise: 0 };
    const cargo = data.cargo || { items: [], used: 0, capacity: 0 };
    const squadAt = squadRoomId(rooms);
    if (selectedRoom == null || !rooms.some((r) => r.id === selectedRoom)) selectedRoom = squadAt;
    const cols = Math.max(...rooms.map((r) => r.gridX)) + 1 || 1;
    const cells = rooms.map((r) => roomCell(r, r.id === squadAt, r.id === selectedRoom)).join('');
    const sel = rooms.find((r) => r.id === selectedRoom);
    el.innerHTML = `<div class="tactical-card">
      <header>
        <div><small>TACTICAL RAID · ${b.x}|${b.y}</small><h2>${esc(b.name)}</h2></div>
        <div class="tac-meters">
          <span data-tip="Run momentum — fill for a supply cache">⚡ ${run.momentum}/${run.nextReward}</span>
          <span class="${run.noise >= 6 ? 'danger' : ''}" data-tip="Noise attracts infected">🔊 ${run.noise || 0}/12</span>
          <span data-tip="Squad cargo">🎒 ${cargo.used}/${cargo.capacity} kg</span>
        </div>
        <button data-tactical-close aria-label="Leave building">✕ Leave</button>
      </header>
      <div class="tactical-body">
        <div class="tac-floor" style="grid-template-columns:repeat(${cols},minmax(120px,1fr))">${cells}</div>
        <aside class="tac-rail">${rail(sel)}</aside>
      </div>
    </div>`;
    el.classList.add('open');
  }

  function show(payload) {
    data = payload;
    render();
  }
  return { show, hide, isOpen, selected: () => selectedRoom };
}
