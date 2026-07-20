import { makeDraggable } from './draggable.js';
import { fmtNum } from './config.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const labels = { materials: 'Materials', salvaging: 'Salvaging', food: 'Food', medicine: 'Medicine', electricity: 'Electricity', leadership: 'Leadership', chemistry: 'Chemistry', weapons: 'Weapons', field: 'Field', communication: 'Communication', defense: 'Defense' };

export function createResearch(el, opts = {}) {
  const onStart = opts.onStart || (() => {});
  const dragger = makeDraggable(el, { handle: '.research-card header', target: '.research-card', storageKey: 'zv2.window.research' });
  let activeFilter = 'all';
  let lastData = null;

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-research-close]')) { hide(); return; }
    const filter = e.target.closest('[data-research-filter]');
    if (filter && lastData) {
      activeFilter = filter.dataset.researchFilter;
      show(lastData);
      return;
    }
    const button = e.target.closest('[data-tech]');
    if (button && !button.disabled) { button.disabled = true; onStart(Number(button.dataset.tech)); }
  });

  function hide() { el.classList.remove('open'); el.innerHTML = ''; }
  function isOpen() { return el.classList.contains('open'); }

  function show(d) {
    lastData = d;
    const entries = Object.entries(d.branches || {});
    if (activeFilter !== 'all' && !entries.some(([key]) => key === activeFilter)) activeFilter = 'all';
    const previousTree = el.querySelector('.tech-tree');
    const scrollTop = previousTree?.scrollTop ?? 0;
    const scrollLeft = previousTree?.scrollLeft ?? 0;
    const filters = [['all', 'All topics'], ...entries.map(([key]) => [key, labels[key] || key])]
      .map(([key, label]) => `<button data-research-filter="${esc(key)}" class="${activeFilter === key ? 'active' : ''}">${esc(label)}</button>`).join('');
    const visibleEntries = activeFilter === 'all' ? entries : entries.filter(([key]) => key === activeFilter);
    const branches = visibleEntries.map(([key, nodes]) => `<section class="tech-branch"><h3>${esc(labels[key] || key)}</h3><div class="tech-line">${nodes.map((n) => `<article class="tech-node ${n.complete ? 'complete' : n.active ? 'active' : n.canResearch ? 'available' : 'locked'}"><div class="tech-tier">TIER ${n.tier}</div><b>${esc(n.name)}</b><p>${esc(n.description)}</p><small data-tip="Cost: ${n.cost} research points\nTime: ${n.duration}s${n.centerLevel ? `\nResearch center L${n.centerLevel}` : ''}${n.reqFacilityName ? `\n${esc(n.reqFacilityName)} L${n.reqLevel}` : ''}">${fmtNum(n.cost)} RP · ${n.duration}s${n.centerLevel ? ` · Center L${n.centerLevel}` : ''}${n.reqFacilityName ? ` · ${esc(n.reqFacilityName)} L${n.reqLevel}` : ''}</small><button data-tech="${n.id}"${n.canResearch ? '' : ' disabled'}>${n.complete ? 'Recovered' : n.active ? 'Researching…' : n.canResearch ? 'Research' : esc(n.reason || 'Locked')}</button></article>`).join('<i class="tech-link"></i>')}</div></section>`).join('');
    const job = d.job ? `<div class="research-job">Recovering <b>${esc(d.job.name)}</b> · <span data-research-countdown data-due="${d.job.due}"></span></div>` : '';
    el.innerHTML = `<div class="research-card"><header title="Drag to move"><div><small>RECOVERED KNOWLEDGE</small><h2>Technology tree</h2></div><button data-research-close aria-label="Close">✕</button></header><div class="research-summary" data-tip="Research points: ${d.points}\nProduction: +${d.rate}/hour\nScientists assigned: ${d.workers}"><strong>${fmtNum(d.points)} RP</strong><span>+${fmtNum(d.rate)}/hour · ${d.workers} scientist${d.workers === 1 ? '' : 's'} · Research center L${d.centerLevel}</span></div>${d.centerLevel ? job : '<div class="research-warning">Construct a Research center to begin recovering technology.</div>'}<nav class="topic-filters research-filters" aria-label="Filter research topics">${filters}</nav><div class="tech-tree">${branches}</div></div>`;
    el.classList.add('open');
    dragger.restore();
    const nextTree = el.querySelector('.tech-tree');
    if (nextTree) { nextTree.scrollTop = activeFilter === 'all' ? scrollTop : 0; nextTree.scrollLeft = activeFilter === 'all' ? scrollLeft : 0; }
    tick();
  }

  function tick() {
    const countdown = el.querySelector('[data-research-countdown]');
    if (!countdown) return;
    const seconds = Math.max(0, Number(countdown.dataset.due) - Math.floor(Date.now() / 1000));
    countdown.textContent = seconds ? `${seconds}s remaining` : 'finishing…';
  }

  setInterval(tick, 1000);
  return { show, hide, isOpen };
}
