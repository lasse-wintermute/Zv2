// OG menu.php live queue: a docked box listing every running job with a live
// countdown and (where the OG allowed it) a Cancel that refunds half. Sits
// under the header on the left; collapses to a chip when empty-minded players
// want the map clear.
import { fmtDuration } from './config.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICONS = { build: '🏗', research: '🔬', production: '🔧', training: '🎯', treatment: '🏥', travel: '🚶' };
const TIPS = {
  build: 'Construction — cancel refunds half the resources',
  research: 'Research — cancel refunds half the RP',
  production: 'Toolshop production',
  training: 'Attribute training',
  treatment: 'Hospital treatment',
  travel: 'Squad traveling',
};

export function createQueue(el, opts = {}) {
  const onCancel = opts.onCancel || (() => {});   // (type, ref)
  let jobs = [];
  let collapsed = localStorage.getItem('zv2.queue.collapsed') === '1';

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-queue-toggle]')) {
      collapsed = !collapsed;
      try { localStorage.setItem('zv2.queue.collapsed', collapsed ? '1' : '0'); } catch { /* ignore */ }
      render();
      return;
    }
    const c = e.target.closest('[data-queue-cancel]');
    if (c && !c.disabled) { c.disabled = true; const j = jobs[Number(c.dataset.queueCancel)]; if (j) onCancel(j.type, j.ref); }
  });

  function render() {
    if (!jobs.length) { el.classList.remove('open'); el.innerHTML = ''; return; }
    el.classList.add('open');
    if (collapsed) {
      el.innerHTML = `<button class="queue-chip" data-queue-toggle data-tip="Show the ${jobs.length} running job${jobs.length === 1 ? '' : 's'}">⏳ ${jobs.length}</button>`;
      return;
    }
    const now = Date.now() / 1000;
    const rows = jobs.map((j, i) => {
      const left = Math.max(0, j.due - now);
      return `<li data-tip="${esc(TIPS[j.type] || '')}"><span class="q-ic">${ICONS[j.type] || '⏳'}</span>
        <span class="q-label">${esc(j.label)}</span>
        <time data-queue-due="${j.due}">${left > 0 ? fmtDuration(left) : 'finishing…'}</time>
        ${j.cancelable ? `<button data-queue-cancel="${i}" data-tip="Cancel — 50% refund">✕</button>` : ''}
      </li>`;
    }).join('');
    el.innerHTML = `<div class="queue-hd"><small>ACTIVE JOBS</small><button data-queue-toggle data-tip="Collapse">−</button></div><ul>${rows}</ul>`;
  }

  function show(list) { jobs = list || []; render(); }

  // tick the countdowns in place without a rebuild
  setInterval(() => {
    if (!jobs.length || collapsed) return;
    const now = Date.now() / 1000;
    el.querySelectorAll('[data-queue-due]').forEach((t) => {
      const left = Math.max(0, Number(t.dataset.queueDue) - now);
      t.textContent = left > 0 ? fmtDuration(left) : 'finishing…';
    });
  }, 1000);

  return { show };
}
