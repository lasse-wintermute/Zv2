// Toast + docked corner panel (SOTD's ov-events): a persistent, draggable,
// tabbed Events | Facilities panel at the bottom-right, plus a toast stack.
// Events keep timestamps/tones; the Facilities tab lists every built facility
// and jumps the camera to it on click (SOTD's buildings-list QoL).
// Public: notify(message, {tone, icon, silent}), openLog/toggleLog,
// setFacilities(rows, onJump).
import { makeDraggable } from './draggable.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TONE = { info: '#d9c9a8', good: '#8cc63f', warn: '#e6c200', bad: '#ff9a9a' };
const ICON = { info: 'ℹ', good: '✓', warn: '▲', bad: '✕' };
const LOG_CAP = 60;

let ctrl = null;

export function createNotify() {
  const toastWrap = document.createElement('div');
  toastWrap.className = 'toast-wrap';
  toastWrap.setAttribute('aria-live', 'polite');
  document.body.appendChild(toastWrap);

  const logEl = document.createElement('div');
  logEl.className = 'eventlog';
  document.body.appendChild(logEl);

  const log = [];              // {t, message, tone, icon}
  let open = false;
  let tab = 'events';          // 'events' | 'facilities'
  let lastSig = '';
  let facilities = [];         // [{slot,name,level,staff,gridX,gridY,constructing}]
  let onJump = () => {};
  const dragger = makeDraggable(logEl, { handle: '.eventlog-hd', storageKey: 'zv2.window.eventlog', minWidth: 240, minHeight: 180 });

  logEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-log-close]')) { close(); return; }
    if (e.target.closest('[data-log-clear]')) { log.length = 0; lastSig = ''; renderPanel(true); return; }
    const t = e.target.closest('[data-log-tab]');
    if (t) { tab = t.dataset.logTab; lastSig = ''; renderPanel(true); return; }
    const row = e.target.closest('[data-fac-jump]');
    if (row) onJump(Number(row.dataset.facJump), Number(row.dataset.gx), Number(row.dataset.gy));
  });

  function fmtTime(ms) {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function body() {
    if (tab === 'facilities') {
      return facilities.length
        ? facilities.map((f) => `<li class="fac-row" data-fac-jump="${f.slot}" data-gx="${f.gridX}" data-gy="${f.gridY}" data-tip="Jump to ${esc(f.name)}"><span class="log-msg"><b>${esc(f.name)}</b>${f.constructing ? ' <i class="fac-busy">🏗</i>' : ''}</span><em>Lv ${f.level}</em><time>${f.staff ? f.staff + '👤' : ''}</time></li>`).join('')
        : '<li class="log-empty">No facilities built yet.</li>';
    }
    return log.length
      ? log.map((e) => `<li style="--c:${TONE[e.tone] || TONE.info}"><span class="log-ic">${e.icon || ICON[e.tone] || ICON.info}</span><span class="log-msg">${esc(e.message)}</span><time>${fmtTime(e.t)}</time></li>`).join('')
      : '<li class="log-empty">No events yet.</li>';
  }

  function renderPanel(force) {
    if (!open) return;
    const sig = tab + ':' + (tab === 'events' ? log.length + ':' + (log[0]?.t || 0) : facilities.map((f) => f.slot + '.' + f.level + '.' + f.staff + (f.constructing ? 'c' : '')).join(','));
    if (!force && sig === lastSig) return;      // signature-cached rebuild
    lastSig = sig;
    logEl.innerHTML = `<div class="eventlog-hd">
        <div class="eventlog-tabs">
          <button data-log-tab="events" class="${tab === 'events' ? 'on' : ''}">Events</button>
          <button data-log-tab="facilities" class="${tab === 'facilities' ? 'on' : ''}">Facilities</button>
        </div>
        <div class="eventlog-tools">${tab === 'events' ? '<button data-log-clear title="Clear log">Clear</button>' : ''}<button data-log-close aria-label="Close">✕</button></div>
      </div><ul class="eventlog-list">${body()}</ul>`;
  }

  function open_() { open = true; logEl.classList.add('open'); lastSig = ''; renderPanel(true); dragger.restore(); }
  function close() { open = false; logEl.classList.remove('open'); logEl.innerHTML = ''; }
  function toggle() { open ? close() : open_(); }

  function toast(message, tone, icon) {
    const t = document.createElement('div');
    t.className = 'toast toast-' + tone;
    t.style.setProperty('--c', TONE[tone] || TONE.info);
    t.innerHTML = `<span class="toast-ic">${icon || ICON[tone] || ICON.info}</span><span>${esc(message)}</span>`;
    toastWrap.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    const life = tone === 'bad' ? 6000 : 3600;
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 320);
    }, life);
    while (toastWrap.children.length > 5) toastWrap.firstChild.remove();
  }

  function notify(message, opts = {}) {
    if (!message) return;
    const tone = opts.tone || 'info';
    const icon = opts.icon || ICON[tone] || ICON.info;
    log.unshift({ t: Date.now(), message, tone, icon });
    if (log.length > LOG_CAP) log.length = LOG_CAP;
    renderPanel();
    if (!opts.silent) toast(message, tone, icon);
  }

  function setFacilities(rows, jumpCb) {
    facilities = rows || [];
    if (jumpCb) onJump = jumpCb;
    renderPanel();
  }

  ctrl = { notify, openLog: open_, toggleLog: toggle, isLogOpen: () => open, setFacilities };
  return ctrl;
}

// Convenience for modules that don't hold the controller reference.
export function notify(message, opts) { ctrl?.notify(message, opts); }
