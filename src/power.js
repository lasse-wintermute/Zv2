// Power grid screen — the OG power.php: generator output vs total drain, the
// efficiency percentage that scales ALL production, and a per-facility drain
// breakdown so you can see exactly what is eating the grid.
import { makeDraggable } from './draggable.js';
import { facInfo, fmtNum } from './config.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createPower(el, opts = {}) {
  const onFacility = opts.onFacility || (() => {});
  const dragger = makeDraggable(el, { handle: '.power-card header', target: '.power-card', storageKey: 'zv2.window.power' });
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-power-close]')) { hide(); return; }
    const row = e.target.closest('[data-power-fac]');
    if (row) onFacility(Number(row.dataset.powerFac));
  });
  function hide() { el.classList.remove('open'); el.innerHTML = ''; }
  function isOpen() { return el.classList.contains('open'); }

  function show(state) {
    const p = state?.power || { generated: 0, used: 0, level: 100 };
    const level = p.level ?? 100;
    const spare = Math.round((p.generated - p.used) * 10) / 10;
    const gen = (state?.facilities || []).find((f) => f.slot === 9);
    // consumers, biggest first
    const consumers = (state?.facilities || []).filter((f) => (f.drain || 0) > 0).sort((a, b) => b.drain - a.drain);
    const rows = consumers.length ? consumers.map((f) => {
      const share = p.used ? (f.drain / p.used) * 100 : 0;
      return `<li data-power-fac="${f.slot}" data-tip="${esc(facInfo(f.type).name)} — level ${f.level}\nDraws ${f.drain} power (${Math.round(share)}% of the grid)\nClick to open this facility">
        <span class="pw-name">${esc(facInfo(f.type).name)}<small>Level ${f.level}</small></span>
        <b>${fmtNum(f.drain)}</b>
        <i class="pw-share"><em style="width:${Math.min(100, share)}%"></em></i>
      </li>`;
    }).join('') : '<li class="pw-empty">No facility is drawing power yet.</li>';

    const state6 = level >= 100 ? 'ok' : level >= 60 ? 'warn' : 'bad';
    el.innerHTML = `<div class="power-card">
      <header title="Drag to move"><div><small>COMPOUND GRID</small><h2>Power generator${gen ? ` · Level ${gen.level}` : ''}</h2></div><button data-power-close aria-label="Close">✕</button></header>
      <div class="power-gauges">
        <div class="pw-gauge" data-tip="Total generation from the Power generator and assigned engineers"><small>OUTPUT</small><b>${fmtNum(p.generated)}</b></div>
        <div class="pw-gauge" data-tip="Total draw of every powered facility at its current level"><small>DRAIN</small><b>${fmtNum(p.used)}</b></div>
        <div class="pw-gauge ${spare < 0 ? 'bad' : 'ok'}" data-tip="Spare capacity — build more facilities while this stays positive"><small>SPARE</small><b>${spare >= 0 ? '+' : ''}${fmtNum(spare)}</b></div>
        <div class="pw-gauge pw-${state6}" data-tip="Grid efficiency multiplies ALL resource production.\n100% = full output; a brownout slows everything down."><small>EFFICIENCY</small><b>${level}%</b></div>
      </div>
      <div class="pw-bar ${state6}"><em style="width:${Math.min(100, level)}%"></em></div>
      ${level < 100
        ? `<p class="pw-warn">⚠ Brownout — every facility is producing at <b>${level}%</b>. Upgrade the Power generator, assign engineers to it, or the grid stays throttled.</p>`
        : '<p class="pw-note">Grid stable — all facilities run at full output.</p>'}
      <div class="pw-sec">Consumers</div>
      <ul class="pw-list">${rows}</ul>
    </div>`;
    el.classList.add('open');
    dragger.restore();
  }
  return { show, hide, isOpen };
}
