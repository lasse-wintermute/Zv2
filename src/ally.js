// Alliance page — the OG ally.php: banner + name + founded date + points,
// the member roster, an editable charter, and the ally event log. Founding is
// gated on the Communication centre exactly like the original.
import { makeDraggable } from './draggable.js';
import { fmtNum } from './config.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = (t) => new Date(t * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const RANKS = { 2: 'Founder', 1: 'Admin', 0: 'Member' };

export function createAlly(el, opts = {}) {
  const onAction = opts.onAction || (() => {});   // (action, payload)
  const dragger = makeDraggable(el, { handle: '.ally-card header', target: '.ally-card', storageKey: 'zv2.window.ally' });
  let data = null;
  let picking = false;

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-ally-close]')) { hide(); return; }
    if (e.target.closest('[data-ally-pick]')) { picking = true; render(); return; }
    if (e.target.closest('[data-ally-pick-cancel]')) { picking = false; render(); return; }
    const emb = e.target.closest('[data-ally-emblem]');
    if (emb) { picking = false; onAction(data.ally ? 'emblem' : 'found-emblem', { emblem: emb.dataset.allyEmblem }); return; }
    const act = e.target.closest('[data-ally-act]');
    if (!act || act.disabled) return;
    const a = act.dataset.allyAct;
    if (a === 'found') {
      const name = el.querySelector('[data-ally-name]')?.value.trim();
      const emblem = el.querySelector('[data-ally-found-emblem]')?.dataset.chosen || '🛡';
      if (!name) return;
      onAction('found', { name, emblem });
    } else if (a === 'rename') {
      const name = el.querySelector('[data-ally-rename]')?.value.trim();
      if (name) onAction('rename', { name });
    } else if (a === 'description') {
      onAction('description', { description: el.querySelector('[data-ally-desc]')?.value ?? '' });
    } else { act.disabled = true; onAction(a, {}); }
  });

  function hide() { el.classList.remove('open'); el.innerHTML = ''; picking = false; }
  function isOpen() { return el.classList.contains('open'); }

  function emblemGrid(attr) {
    return `<div class="emblem-grid">${(data.emblems || []).map((x) => `<button data-${attr}="${esc(x)}">${x}</button>`).join('')}<button class="emblem-cancel" data-ally-pick-cancel>Cancel</button></div>`;
  }

  function foundView() {
    const blocked = !data.canFound;
    return `<div class="ally-found">
      <p class="ally-lead">An alliance is a banner other survivors can rally to — a shared name, charter and roll of members.</p>
      ${blocked ? `<div class="ally-blocked">🔒 ${esc(data.reason || 'You already belong to an alliance.')}</div>` : ''}
      <label class="ally-field"><small>ALLIANCE NAME</small>
        <input data-ally-name maxlength="40" placeholder="The Ashfall Compact"${blocked ? ' disabled' : ''} /></label>
      <button class="ally-primary" data-ally-act="found"${blocked ? ' disabled' : ''} data-tip="${blocked ? esc(data.reason || '') : 'Found the alliance'}">Found alliance</button>
      <p class="ally-note">Requires a Communication center${data.commLevel ? ` — yours is level ${data.commLevel}` : ''}.</p>
    </div>`;
  }

  function allyView() {
    const a = data.ally;
    const members = a.members.map((m) => `<li class="${m.isYou ? 'you' : ''}" data-tip="${esc(m.stronghold || m.name)}\n${fmtNum(m.points)} points · joined ${when(m.joinedAt)}">
        <span class="ally-emb">${m.emblem}</span>
        <span class="ally-who"><b>${esc(m.name)}${m.isYou ? ' (you)' : ''}</b><small>${esc(m.stronghold || '')}</small></span>
        <em class="ally-rank rank-${m.rank}">${RANKS[m.rank] || 'Member'}</em>
        <b class="ally-pts">★ ${fmtNum(m.points)}</b>
      </li>`).join('');
    const events = (a.events || []).length
      ? a.events.map((e) => `<li><span>${esc(e.message)}</span><time>${when(e.time)}</time></li>`).join('')
      : '<li class="ally-empty">No alliance events yet.</li>';
    return `
      <div class="ally-banner">
        <button class="ally-crest" data-ally-pick data-tip="${a.isAdmin ? 'Change the alliance banner' : 'Alliance banner'}"${a.isAdmin ? '' : ' disabled'}>${a.emblem}</button>
        <div>
          <h3>${esc(a.name)}</h3>
          <small>Founded ${when(a.createdAt)} · ${a.members.length} member${a.members.length === 1 ? '' : 's'} · ★ ${fmtNum(a.points)} points</small>
        </div>
      </div>
      ${picking ? `<div class="identity-picking"><b>Choose a banner</b>${emblemGrid('ally-emblem')}</div>` : ''}
      ${a.isAdmin ? `<div class="ally-admin">
        <label class="ally-field"><small>RENAME</small><div class="identity-input"><input data-ally-rename value="${esc(a.name)}" maxlength="40" /><button data-ally-act="rename">Save</button></div></label>
        <label class="ally-field"><small>CHARTER</small><textarea data-ally-desc rows="3" maxlength="1000" placeholder="What does this alliance stand for?">${esc(a.description)}</textarea></label>
        <button class="ally-secondary" data-ally-act="description">Save charter</button>
      </div>` : (a.description ? `<p class="ally-charter">${esc(a.description)}</p>` : '')}
      <div class="ally-sec">Members</div>
      <ul class="ally-members">${members}</ul>
      <div class="ally-sec">Alliance log</div>
      <ul class="ally-log">${events}</ul>
      <div class="ally-danger">
        ${a.isFounder
          ? '<button data-ally-act="disband" data-tip="Permanently disband this alliance">Disband alliance</button>'
          : '<button data-ally-act="leave" data-tip="Leave this alliance">Leave alliance</button>'}
      </div>`;
  }

  function render() {
    if (!data) return;
    el.innerHTML = `<div class="ally-card">
      <header title="Drag to move"><div><small>ALLIANCE</small><h2>${data.ally ? esc(data.ally.name) : 'Found an alliance'}</h2></div><button data-ally-close aria-label="Close">✕</button></header>
      <div class="ally-body">${data.ally ? allyView() : foundView()}</div>
    </div>`;
    el.classList.add('open');
    dragger.restore();
  }
  function show(d) { data = d; render(); }
  return { show, hide, isOpen };
}
