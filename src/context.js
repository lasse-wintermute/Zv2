// Right-click context menu (SOTD ctxpanel pattern): one reusable floating card,
// positioned at the cursor and clamped to the viewport, auto-closing after a
// one-shot action or on any outside click / Esc.
// Items support: label, small, tip (hover tooltip), key (keyboard shortcut,
// shown as a chip and live while the menu is open), disabled, info (non-
// clickable info row), onClick.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createContext() {
  const el = document.createElement('div');
  el.className = 'ctxmenu';
  el.style.display = 'none';
  document.body.appendChild(el);
  let items = [];
  let tag = null;              // which menu is showing, so callers can refresh only their own

  function close() { el.style.display = 'none'; el.innerHTML = ''; items = []; tag = null; }
  function isOpen() { return el.style.display !== 'none'; }
  function openTag() { return isOpen() ? tag : null; }

  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ctx]');
    if (!b || b.disabled) return;
    const item = items[Number(b.dataset.ctx)];
    close();                       // one-shot: close before running so it never covers the result
    item?.onClick?.();
  });
  document.addEventListener('pointerdown', (e) => { if (!el.contains(e.target)) close(); }, true);
  document.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') { close(); return; }
    const t = e.target;
    if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable))) return;
    const k = e.key.toLowerCase();
    const item = items.find((it) => !it.info && it.key === k && !it.disabled);
    if (item) { e.preventDefault(); e.stopPropagation(); close(); item.onClick?.(); }
  }, true);

  function openAt(x, y, title, list, subtitle = '', menuTag = null) {
    items = (list || []).filter(Boolean);
    if (!items.length) { close(); return; }
    tag = menuTag;
    el.innerHTML = `<header><b>${esc(title)}</b>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</header>
      ${items.map((it, i) => it.info
        ? `<div class="ctx-info"${it.tip ? ` data-tip="${esc(it.tip)}"` : ''}>${it.html || `<span>${esc(it.label)}</span>${it.small ? `<small>${esc(it.small)}</small>` : ''}`}</div>`
        : `<button data-ctx="${i}"${it.disabled ? ' disabled' : ''}${it.tip ? ` data-tip="${esc(it.tip)}"` : ''}><span>${esc(it.label)}${it.key ? ` <i class="keyhint">(${esc(it.key.toUpperCase())})</i>` : ''}</span>${it.smallHtml ? `<small>${it.smallHtml}</small>` : it.small ? `<small>${esc(it.small)}</small>` : ''}</button>`).join('')}`;
    el.style.display = 'block';
    // clamp to viewport after measuring
    const m = 8, w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = Math.max(m, Math.min(window.innerWidth - w - m, x + 4)) + 'px';
    el.style.top = Math.max(m, Math.min(window.innerHeight - h - m, y + 4)) + 'px';
  }

  return { openAt, close, isOpen, openTag };
}
