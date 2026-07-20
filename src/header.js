// OG Zombilization header: logo left, then the ORIGINAL dropdown set —
// Map ▾ · Stronghold ▾ · Troops ▾ · User ▾ (menu.php row 1; Ally omitted, no
// ally system). Research/Toolshop open from the Stronghold facility list like
// the OG facility pages; Quests/Events/Settings live under User, like the OG.
import { facInfo, facKey } from './config.js';
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// OG Stronghold dropdown grouping (menu.php): command/power · resources ·
// logistics/science · military/staff — plus Zv2's medical/comm block.
const STRONGHOLD_GROUPS = [[17, 9], [1, 2, 3], [4, 12, 11], [10, 13, 8], [16, 15, 18]];

export function createHeader(el, opts = {}) {
  const onAction = opts.onAction || (() => {});         // (action, a, b, c)
  const squadProvider = opts.squadProvider || (async () => []);
  let state = null;
  let openMenu = null;

  el.innerHTML = `
    <div class="hdr-row">
      <a class="hdr-logo" data-hdr-act="compound" data-tip="Back to the compound">ZOMBILIZATION<i>v2</i></a>
      <nav class="hdr-menus">
        <button class="hdr-menu" id="hdr-map" data-hdr-menu="map">🗺 <span>Map</span> ▾</button>
        <button class="hdr-menu" id="hdr-stronghold" data-hdr-menu="stronghold">🏚 <span>Stronghold</span> ▾</button>
        <button class="hdr-menu" id="hdr-squads" data-hdr-menu="troops">🪖 <span>Troops</span> ▾</button>
        <button class="hdr-menu" id="hdr-ally" data-hdr-menu="ally"><span class="hdr-allycrest">🛡</span> <span>Ally</span> ▾</button>
        <button class="hdr-menu" id="hdr-records" data-hdr-menu="user">👤 <span>User</span> ▾</button>
      </nav>
      <div class="hdr-right">
        <span class="hdr-name" data-hdr-act="compound"></span>
        <span class="hdr-points" data-tip="Stronghold points — earned from construction, research and objectives"></span>
      </div>
    </div>
    <div class="hdr-drop" id="hdrdrop"></div>`;

  const drop = el.querySelector('#hdrdrop');

  function close() { openMenu = null; drop.classList.remove('open'); drop.innerHTML = ''; el.querySelectorAll('.hdr-menu.on').forEach((b) => b.classList.remove('on')); }

  function rows(items) {
    return items.map((it, i) => it === '-' ? '<div class="hdr-sep"></div>'
      : `<button class="hdr-item${it.cls ? ' hdr-' + it.cls : ''}" data-hdr-item="${i}"${it.disabled ? ' disabled' : ''}><span>${it.icon || ''} ${esc(it.label)}</span>${it.right ? `<em>${esc(it.right)}</em>` : ''}${it.small ? `<small>${esc(it.small)}</small>` : ''}</button>`).join('');
  }

  let currentItems = [];
  async function show(menu, anchor) {
    openMenu = menu;
    el.querySelectorAll('.hdr-menu.on').forEach((b) => b.classList.remove('on'));
    anchor.classList.add('on');
    let items = [];
    if (menu === 'map') {
      const loc = state?.location;
      items = [
        { icon: '🧭', label: 'Your position', right: loc ? `${loc.x}|${loc.y}` : '—', onClick: () => onAction('world') },
        '-',
        { icon: '🗺', label: 'World map', small: 'Berlin exclusion zone', onClick: () => onAction('world') },
        { icon: '🏠', label: 'Compound view', onClick: () => onAction('compound') },
      ];
      try {
        const squads = await squadProvider();
        if (squads.length) items.push('-');
        for (const s of squads) items.push({ icon: '🪖', label: s.name, right: `${s.x}|${s.y}`, small: s.traveling ? 'traveling…' : undefined, onClick: () => onAction('squad', s.id) });
      } catch { /* squads unavailable — menu still useful */ }
    } else if (menu === 'stronghold') {
      // OG menu.php dropdown: stronghold name on top, then EVERY facility in the
      // original groups — unbuilt ones greyed. Research center / Toolshop open
      // their feature windows, exactly like the OG facility pages did.
      const bySlot = new Map((state?.facilities || []).map((f) => [f.slot, f]));
      items = [{ icon: '🏚', label: state?.name || 'Stronghold', right: `Lv ${state?.level ?? 1}`, onClick: () => onAction('compound') }];
      for (const g of STRONGHOLD_GROUPS) {
        items.push('-');
        for (const slot of g) {
          const f = bySlot.get(slot);
          const name = f?.name || facInfo(slot).name;
          const k = facKey(slot);
          const hint = k ? ` (${k.toUpperCase()})` : '';
          if (!f) { items.push({ icon: '▫', cls: 'unbuilt', label: name, right: hint.trim(), small: 'not built — click a free plot', onClick: () => onAction('compound') }); continue; }
          items.push({ icon: f.constructing ? '🏗' : '▪', label: name, right: `Lv ${f.level}${hint}`, small: f.staff ? `${f.staff} assigned` : undefined, onClick: () => onAction('facility', f.slot) });
        }
      }
    } else if (menu === 'troops') {
      // OG Troops dropdown: count → armory, then each troop with coordinates,
      // green row at home / red row in the field.
      items = [{ icon: '🪖', label: 'Troop Quarters & squads', small: 'crews, loadouts, vehicles', onClick: () => onAction('forces') }];
      try {
        const squads = await squadProvider();
        const home = state?.location;
        if (squads.length) items.push('-');
        for (const s of squads) {
          const atHome = home && s.x === home.x && s.y === home.y && !s.traveling;
          items.push({ icon: s.traveling ? '🚶' : '📍', cls: atHome ? 'home' : 'field', label: s.name, right: `${s.x}|${s.y}`, small: `${s.crew?.length ? `${s.crew.length} member${s.crew.length === 1 ? '' : 's'}` : 'no crew'}${s.traveling ? ' · traveling' : atHome ? ' · in stronghold' : ' · in the field'}`, onClick: () => onAction('squad', s.id) });
        }
      } catch { /* ignore */ }
      items.push('-', { icon: '🎒', label: 'Inventory & equipment', onClick: () => onAction('inventory') });
    } else if (menu === 'ally') {
      // OG ally dropdown: banner + name → ally page, points, then the roster.
      const a = state?.ally;
      if (!a) {
        items = [
          { icon: '🛡', label: 'No alliance', small: 'found one from the alliance page', onClick: () => onAction('ally') },
          '-',
          { icon: '➕', label: 'Found an alliance', small: 'needs a Communication center', onClick: () => onAction('ally') },
        ];
      } else {
        items = [
          { icon: a.emblem || '🛡', label: a.name, right: `★ ${a.points ?? 0}`, small: `${a.memberCount} member${a.memberCount === 1 ? '' : 's'}`, onClick: () => onAction('ally') },
          '-',
          ...(a.members || []).map((m) => ({ icon: m.emblem || '🧭', label: m.name + (m.isYou ? ' (you)' : ''), right: `★ ${m.points}`, small: m.rank === 2 ? 'founder' : m.rank === 1 ? 'admin' : undefined, onClick: () => onAction('ally') })),
        ];
      }
    } else if (menu === 'user') {
      // OG User dropdown: profile → points/rank → Quests · Events · settings · logout
      items = [
        { icon: '👤', label: state?.player?.name || state?.name || 'Survivor', right: `★ ${state?.points ?? 0}`, small: 'stronghold points', onClick: () => onAction('objectives') },
        '-',
        { icon: '🎯', label: 'Quests', right: '(O)', small: 'objectives & rewards', onClick: () => onAction('objectives') },
        { icon: '📜', label: 'Events', right: '(L)', small: 'settlement log', onClick: () => onAction('log') },
        { icon: '📖', label: 'Field manual', small: 'tutorial', onClick: () => onAction('tutorial') },
        '-',
        { icon: '✎', label: 'Names & emblems', small: 'rename stronghold and squads', onClick: () => onAction('identity') },
        { icon: '⚙', label: 'Testing tools', onClick: () => onAction('admin') },
        { icon: '⟳', label: 'New game', small: 'abandon this settlement', onClick: () => onAction('newgame') },
      ];
    }
    currentItems = items.filter((it) => it !== '-');
    drop.innerHTML = rows(items);
    // align dropdown under its menu button
    const ar = anchor.getBoundingClientRect();
    drop.style.left = Math.min(ar.left, window.innerWidth - 250) + 'px';
    drop.classList.add('open');
  }

  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-hdr-act]');
    if (act) { close(); onAction(act.dataset.hdrAct); return; }
    const menuBtn = e.target.closest('[data-hdr-menu]');
    if (menuBtn) {
      const m = menuBtn.dataset.hdrMenu;
      if (openMenu === m) { close(); return; }
      await show(m, menuBtn);
      return;
    }
    const item = e.target.closest('[data-hdr-item]');
    if (item && !item.disabled) {
      const idx = Number(item.dataset.hdrItem);
      // rows() indexes include separators — map back through the filtered list
      const flat = drop.querySelectorAll('[data-hdr-item]');
      const it = currentItems[[...flat].indexOf(item)];
      close();
      it?.onClick?.();
    }
  });
  document.addEventListener('pointerdown', (e) => { if (!el.contains(e.target)) close(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  function setAlly(a) {
    state = { ...(state || {}), ally: a };
    const crest = el.querySelector('.hdr-allycrest');
    if (crest) crest.textContent = a?.emblem || '🛡';
    if (openMenu === 'ally') { const btn = el.querySelector('[data-hdr-menu="ally"]'); if (btn) show('ally', btn); }
  }

  function update(s) {
    state = { ...(s || {}), ally: state?.ally };
    const nameEl = el.querySelector('.hdr-name'), ptsEl = el.querySelector('.hdr-points');
    if (nameEl) nameEl.textContent = `${s?.emblem || '🏚'} ${s?.name || ''}`.trim();
    if (ptsEl) ptsEl.textContent = s ? `★ ${s.points ?? 0}` : '';
    // live-refresh an open stronghold menu so levels/construction stay current
    if (openMenu === 'stronghold') { const btn = el.querySelector('[data-hdr-menu="stronghold"]'); if (btn) show('stronghold', btn); }
  }

  return { update, setAlly, close };
}
