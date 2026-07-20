// Identity window — the OG's rename forms (stronghold.php / troop.php) plus its
// banner system (troop banner, profilbild) as a curated emblem picker.
import { makeDraggable } from './draggable.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createIdentity(el, opts = {}) {
  const onSave = opts.onSave || (() => {});     // (action, {name, emblem, squad})
  const dragger = makeDraggable(el, { handle: '.identity-card header', target: '.identity-card', storageKey: 'zv2.window.identity' });
  let data = null;
  let picking = null;   // {action, squad} while the emblem grid is open

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-identity-close]')) { hide(); return; }
    const pick = e.target.closest('[data-pick]');
    if (pick) { picking = JSON.parse(pick.dataset.pick); render(); return; }
    const emb = e.target.closest('[data-emblem]');
    if (emb && picking) {
      onSave(picking.action, { emblem: emb.dataset.emblem, squad: picking.squad });
      picking = null;
      return;
    }
    if (e.target.closest('[data-pick-cancel]')) { picking = null; render(); return; }
    const save = e.target.closest('[data-save]');
    if (save) {
      const cfg = JSON.parse(save.dataset.save);
      const input = el.querySelector(`[data-name-for="${cfg.field}"]`);
      const name = input?.value.trim();
      if (!name) return;
      onSave(cfg.action, { name, squad: cfg.squad });
    }
  });
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const input = e.target.closest('[data-name-for]');
    if (!input) return;
    e.preventDefault();
    el.querySelector(`[data-save*='"${input.dataset.nameFor}"']`)?.click();
  });

  function hide() { el.classList.remove('open'); el.innerHTML = ''; picking = null; }
  function isOpen() { return el.classList.contains('open'); }

  function emblemGrid() {
    return `<div class="emblem-grid">
      ${(data.emblems || []).map((x) => `<button data-emblem="${esc(x)}" data-tip="Use this emblem">${x}</button>`).join('')}
      <button class="emblem-cancel" data-pick-cancel>Cancel</button>
    </div>`;
  }

  function row(title, emblem, name, action, field, squad) {
    const pickCfg = esc(JSON.stringify({ action, squad }));
    const saveCfg = esc(JSON.stringify({ action, field, squad }));
    return `<div class="identity-row">
      <button class="identity-emblem" data-pick="${pickCfg}" data-tip="Change emblem">${emblem}</button>
      <div class="identity-fields">
        <small>${esc(title)}</small>
        ${name === null
          ? '<b class="identity-fixed">emblem only</b>'
          : `<div class="identity-input"><input data-name-for="${field}" value="${esc(name)}" maxlength="40" /><button data-save="${saveCfg}">Save</button></div>`}
      </div>
    </div>`;
  }

  function render() {
    if (!data) return;
    const d = data;
    const rows = [
      row('Stronghold name', d.stronghold.emblem, d.stronghold.name, 'stronghold', 'stronghold'),
      row(`Commander · ${d.player.name}`, d.player.emblem, null, 'player', 'player'),
      ...(d.squads || []).map((s) => row(`Squad`, s.emblem, s.name, 'squad', `squad${s.id}`, s.id)),
    ].join('');
    el.innerHTML = `<div class="identity-card">
      <header title="Drag to move"><div><small>SETTLEMENT IDENTITY</small><h2>Names & emblems</h2></div><button data-identity-close aria-label="Close">✕</button></header>
      ${picking ? `<div class="identity-picking"><b>Choose an emblem</b>${emblemGrid()}</div>` : ''}
      <div class="identity-list">${rows}</div>
      <p class="identity-note">Your stronghold emblem flies in the header; squad emblems mark their markers on the world map.</p>
    </div>`;
    el.classList.add('open');
    dragger.restore();
  }
  function show(d) { data = d; render(); }
  return { show, hide, isOpen };
}
