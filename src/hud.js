// Resource, power, and world-clock HUD. Updates on a 1s timer so the
// interpolated resource amounts tick live (SOTD feel) without a canvas loop.
import { RES, fmtNum as fmt } from './config.js';
import { resourceAmount, brownout } from './game.js';

export function createHud(el) {
  function render(state) {
    if (!state) { el.innerHTML = ''; return; }
    const res = RES.map((r) => {
      const amt = resourceAmount(state, r.key);
      const info = state.resources[r.key] || { cap: 0, perHour: 0 };
      const pct = info.cap ? Math.min(100, (amt / info.cap) * 100) : 0;
      const rate = (info.perHour >= 0 ? '+' : '') + info.perHour + '/h';
      const capTip = info.cap >= 1e6 ? 'uncapped' : `max ${Math.round(info.cap).toLocaleString()}`;
      // OG resource bar: food shows NET with production/consumption breakdown
      const tip = r.key === 'food' && info.consumptionPerHour != null
        ? `${r.name}: ${Math.round(amt).toLocaleString()} (${capTip})\nProduction: +${info.productionPerHour}/h\nConsumption: −${info.consumptionPerHour}/h (survivors eat 3/day)\nNet: ${rate}`
        : `${r.name}: ${Math.round(amt).toLocaleString()} (${capTip})\nProduction: ${rate}`;
      const atZero = amt <= 0;
      const atCap = info.cap && info.cap < 1e6 && amt >= info.cap - 0.5;
      return `<div class="pill" style="--c:${r.color}" data-tip="${tip}">
        <span class="lbl"><em class="res-ic">${r.icon || ''}</em> ${r.name}</span>
        <span class="val${atZero ? ' res-zero' : ''}">${fmt(amt)}<span class="cap">/${fmt(info.cap)}</span></span>
        ${atCap ? '<span class="res-max" data-tip="Storage full — production is wasted">!</span>' : ''}
        <span class="rate${info.perHour < 0 ? ' res-neg' : ''}">${rate}</span>
        <span class="bar"><i style="width:${pct}%"></i></span>
      </div>`;
    }).join('');

    const p = state.power || { generated: 0, used: 0, level: 100 };
    const dim = brownout(state);
    const power = `<div class="pill ${dim ? 'warn' : ''}" style="--c:#e6c200"
      data-tip="Power drain: ${p.used}\nPower output: ${p.generated}\nEfficiency: ${p.level ?? 100}%${dim ? '\n⚠ Brownout — ALL production runs at ' + p.level + '%' : ''}">
      <span class="lbl">Power</span>
      <span class="val${dim ? ' res-zero' : ''}">${p.used}<span class="cap">/${p.generated}</span></span>
      ${p.level != null && p.level < 100 ? `<span class="rate res-neg">${p.level}%</span>` : ''}
    </div>`;
    const w = state.world;
    const phaseSeconds = w ? Math.max(0, w.nextPhaseAt - Date.now() / 1000) : 0;
    const phaseClock = `${Math.floor(phaseSeconds / 60)}:${String(Math.floor(phaseSeconds % 60)).padStart(2, '0')}`;
    // SOTD-style sky arc: the sun (or moon) travels the arc as the phase advances.
    let worldPill = '';
    if (w) {
      const night = w.phase === 'night';
      const progress = Math.max(0, Math.min(1, 1 - phaseSeconds / 600));
      const theta = progress * Math.PI;
      const ox = 55 - 47 * Math.cos(theta), oy = 27 - 23 * Math.sin(theta);
      worldPill = `<div class="pill skypill ${night ? 'night' : ''}" style="--c:${night ? '#7786bd' : '#d4a84f'}"
        data-tip="${night ? 'Night' : 'Day'} ${w.day} — ${night ? 'raid at dawn' : 'night falls'} in ${phaseClock}\nDefence ${w.defense} vs threat ${w.threat}">
        <span class="skyarc">
          <svg viewBox="0 0 110 30" aria-hidden="true"><path d="M8 28 A 50 50 0 0 1 102 28" fill="none" stroke="${night ? 'rgba(119,134,189,.45)' : 'rgba(212,168,79,.5)'}" stroke-width="1.6" stroke-dasharray="3 3"/></svg>
          <b class="skyorb" style="left:${(ox / 110) * 100}%;top:${oy}px">${night ? '🌙' : '☀️'}</b>
        </span>
        <span class="lbl">${night ? 'Night' : 'Day'} ${w.day}</span>
        <span class="val">${w.defense}<span class="cap">/${w.threat}</span></span>
        <span class="rate">${phaseClock}</span>
      </div>`;
    }
    const starter=Number(state.gathering?.starterMultiplier||1);const boost=starter>1?`<div class="pill gathering-boost" style="--c:#d5a84d"><span class="lbl">Starter gathering</span><span class="val">×${starter}</span><span class="rate">temporary</span></div>`:'';

    el.innerHTML = res + boost + power + worldPill;
  }
  return { render };
}
