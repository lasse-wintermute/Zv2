import { makeDraggable } from './draggable.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const labels = { ammunition: 'Ammunition', defenses: 'Compound defenses', firearms: 'Firearms', medical: 'Medical supplies', melee: 'Melee weapons', tools: 'Tools & equipment' };

export function createToolshop(el, opts = {}) {
  const onProduce = opts.onProduce || (() => {});
  const dragger = makeDraggable(el, { handle: '.toolshop-card header', target: '.toolshop-card', storageKey: 'zv2.window.toolshop' });
  let activeFilter = 'all';
  let lastData = null;

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-toolshop-close]')) { hide(); return; }
    const filter = e.target.closest('[data-toolshop-filter]');
    if (filter && lastData) {
      activeFilter = filter.dataset.toolshopFilter;
      show(lastData);
      return;
    }
    const button = e.target.closest('[data-produce]');
    if (button && !button.disabled) { button.disabled = true; onProduce(Number(button.dataset.produce)); }
  });

  function hide() { el.classList.remove('open'); el.innerHTML = ''; }
  function isOpen() { return el.classList.contains('open'); }

  function show(data) {
    lastData = data;
    const previousCatalog = el.querySelector('.production-catalog');
    const scrollTop = previousCatalog?.scrollTop ?? 0;
    const shop = data.toolshop || { level: 0, technicians: 0, job: null };
    const groups = {};
    for (const recipe of data.recipes || []) (groups[recipe.category] ??= []).push(recipe);
    const entries = Object.entries(groups);
    if (activeFilter !== 'all' && !entries.some(([key]) => key === activeFilter)) activeFilter = 'all';
    const filters = [['all', 'All topics'], ...entries.map(([key]) => [key, labels[key] || key])]
      .map(([key, label]) => `<button data-toolshop-filter="${esc(key)}" class="${activeFilter === key ? 'active' : ''}">${esc(label)}</button>`).join('');
    const visibleEntries = activeFilter === 'all' ? entries : entries.filter(([key]) => key === activeFilter);
    const sections = visibleEntries.map(([category, recipes]) => `<section class="production-group"><h3>${esc(labels[category] || category)}</h3><div class="production-list">${recipes.map((recipe) => `<article class="production-item ${recipe.canCraft ? 'ready' : 'locked'}"><div class="production-level">TOOLSHOP L${recipe.toolshopLevel} · ${recipe.techniciansRequired} TECH</div><b>${esc(recipe.result.amount + '× ' + recipe.result.name)}</b><small>${esc(recipe.name)} · ${recipe.duration}s base time</small><ul>${recipe.ingredients.map((ingredient) => `<li class="${ingredient.owned < ingredient.amount ? 'missing' : ''}">${esc(ingredient.name)} <span>${ingredient.owned}/${ingredient.amount}</span></li>`).join('')}</ul><div class="production-tech">${recipe.requiredTech ? 'Research: ' + esc(recipe.requiredTech) : 'Basic workshop design'}</div><button data-produce="${recipe.id}"${recipe.canCraft ? '' : ' disabled'}>${recipe.canCraft ? 'Produce' : esc(recipe.reason || 'Unavailable')}</button></article>`).join('')}</div></section>`).join('');
    const job = shop.job ? `<div class="production-job"><div><small>PRODUCTION ACTIVE</small><b>${esc(shop.job.name)} → ${esc(shop.job.result)}</b></div><span data-production-countdown data-due="${shop.job.due}"></span></div>` : '';
    const staffing = shop.level ? `<div class="toolshop-warning">${shop.technicians} rested technician${shop.technicians === 1 ? '' : 's'} assigned · at least one is required</div>` : '';
    el.innerHTML = `<div class="toolshop-card"><header title="Drag to move"><div><small>COMPOUND MANUFACTURING</small><h2>Toolshop · Level ${shop.level}</h2></div><button data-toolshop-close aria-label="Close">✕</button></header>${shop.level ? job : '<div class="toolshop-warning">Construct and place the Toolshop before producing equipment.</div>'}${staffing}<nav class="topic-filters toolshop-filters" aria-label="Filter production topics">${filters}</nav><div class="production-catalog">${sections}</div></div>`;
    el.classList.add('open');
    dragger.restore();
    const nextCatalog = el.querySelector('.production-catalog');
    if (nextCatalog) nextCatalog.scrollTop = activeFilter === 'all' ? scrollTop : 0;
    tick();
  }

  function tick() {
    const countdown = el.querySelector('[data-production-countdown]');
    if (!countdown) return;
    const seconds = Math.max(0, Number(countdown.dataset.due) - Math.floor(Date.now() / 1000));
    countdown.textContent = seconds ? `${seconds}s remaining` : 'finishing…';
  }

  setInterval(tick, 1000);
  return { show, hide, isOpen };
}
