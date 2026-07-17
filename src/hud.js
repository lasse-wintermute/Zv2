// Resource, power, and world-clock HUD. Updates on a 1s timer so the
// interpolated resource amounts tick live (SOTD feel) without a canvas loop.
import { RES } from './config.js';
import { resourceAmount, brownout } from './game.js';

function fmt(n) {
  n = Math.floor(n);
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return '' + n;
}

export function createHud(el) {
  function render(state) {
    if (!state) { el.innerHTML = ''; return; }
    const res = RES.map((r) => {
      const amt = resourceAmount(state, r.key);
      const info = state.resources[r.key] || { cap: 0, perHour: 0 };
      const pct = info.cap ? Math.min(100, (amt / info.cap) * 100) : 0;
      const rate = (info.perHour >= 0 ? '+' : '') + info.perHour + '/h';
      return `<div class="pill" style="--c:${r.color}">
        <span class="lbl">${r.name}</span>
        <span class="val">${fmt(amt)}<span class="cap">/${fmt(info.cap)}</span></span>
        <span class="rate">${rate}</span>
        <span class="bar"><i style="width:${pct}%"></i></span>
      </div>`;
    }).join('');

    const p = state.power || { generated: 0, used: 0 };
    const power = `<div class="pill ${brownout(state) ? 'warn' : ''}" style="--c:#e6c200">
      <span class="lbl">Power</span>
      <span class="val">${p.used}<span class="cap">/${p.generated}</span></span>
    </div>`;
    const w = state.world;
    const phaseSeconds = w ? Math.max(0, w.nextPhaseAt - Date.now() / 1000) : 0;
    const phaseClock = `${Math.floor(phaseSeconds / 60)}:${String(Math.floor(phaseSeconds % 60)).padStart(2, '0')}`;
    const worldPill = w ? `<div class="pill ${w.phase === 'night' ? 'night' : ''}" style="--c:${w.phase === 'night' ? '#7786bd' : '#d4a84f'}">
      <span class="lbl">${w.phase === 'night' ? 'Night' : 'Day'} ${w.day}</span>
      <span class="val">${w.defense}<span class="cap">/${w.threat}</span></span>
      <span class="rate">${phaseClock}</span>
    </div>` : '';
    const starter=Number(state.gathering?.starterMultiplier||1);const boost=starter>1?`<div class="pill gathering-boost" style="--c:#d5a84d"><span class="lbl">Starter gathering</span><span class="val">×${starter}</span><span class="rate">temporary</span></div>`:'';

    el.innerHTML = res + boost + power + worldPill;
  }
  return { render };
}
