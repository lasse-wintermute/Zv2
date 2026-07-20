// Objectives window — the original quests_tasks chains (Greenhorn → Old Hand,
// Lumberjack → Precision engineer, Zombie killer…) with live progress bars and
// one-click reward claims. Draggable + resizable like every Zv2 window.
import { makeDraggable } from './draggable.js';
import { fmtNum } from './config.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CHAIN_LABELS = {
  rank: 'Settlement rank', toolshop: 'Toolshop', comms: 'Communication',
  gov: 'Governance', armory: 'Armory', facility: 'Facility marks', kills: 'Zombie killer',
};

export function createObjectives(el, opts = {}) {
  const onClaim = opts.onClaim || (() => {});
  const dragger = makeDraggable(el, { handle: '.objectives-card header', target: '.objectives-card', storageKey: 'zv2.window.objectives' });
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-objectives-close]')) { hide(); return; }
    const b = e.target.closest('[data-claim]');
    if (b && !b.disabled) { b.disabled = true; onClaim(Number(b.dataset.claim)); }
  });

  function hide() { el.classList.remove('open'); el.innerHTML = ''; }
  function isOpen() { return el.classList.contains('open'); }

  function show(d) {
    const chains = Object.entries(d.chains || {}).map(([key, list]) => {
      const rows = list.map((o) => {
        const reqs = (o.requirements || []).map((r) => {
          const pct = r.need ? Math.min(100, (r.have / r.need) * 100) : 100;
          return `<div class="obj-req ${r.done ? 'done' : ''}"><span>${esc(r.label)}</span><b>${fmtNum(r.have)}/${fmtNum(r.need)}</b><i><em style="width:${pct}%"></em></i></div>`;
        }).join('');
        const state = o.claimed ? '<span class="obj-claimed">✓ Claimed</span>'
          : o.locked ? '<span class="obj-locked">Chain locked</span>'
          : `<button data-claim="${o.id}"${o.claimable ? '' : ' disabled'} data-tip="Reward: ${o.reward.amount}× ${esc(o.reward.name)}">${o.claimable ? 'Claim reward' : 'In progress'}</button>`;
        return `<article class="obj-row ${o.claimed ? 'claimed' : o.claimable ? 'claimable' : o.locked ? 'locked' : ''}">
          <div class="obj-head"><b>${esc(o.name)}</b><small>Tier ${o.tier} · ${o.reward.amount}× ${esc(o.reward.name)}</small></div>
          <p>${esc(o.description)}</p>${reqs}<div class="obj-state">${state}</div>
        </article>`;
      }).join('');
      return `<section class="obj-chain"><h3>${esc(CHAIN_LABELS[key] || key)}</h3>${rows}</section>`;
    }).join('');
    el.innerHTML = `<div class="objectives-card">
      <header title="Drag to move"><div><small>SETTLEMENT RECORDS</small><h2>Objectives</h2></div><button data-objectives-close aria-label="Close">✕</button></header>
      <div class="objectives-summary"><strong>${d.claimed}/${d.total} complete</strong><span>${fmtNum(d.kills)} infected put down</span></div>
      <div class="obj-list">${chains}</div>
    </div>`;
    el.classList.add('open');
    dragger.restore();
  }
  return { show, hide, isOpen };
}
