// Context-aware hover tooltips (SOTD/OG pattern): one reusable element,
// attribute-driven, edge-flipping. Any element with [data-tip] shows its text
// on hover; \n becomes a line break. Listens to BOTH pointermove and mousemove
// (some embedded webviews deliver only one), re-reads the attribute every move
// so live-updating hosts (canvas map hover) refresh in place.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function initTooltips() {
  const tip = document.createElement('div');
  tip.className = 'ui-tip';
  tip.style.display = 'none';
  document.body.appendChild(tip);
  let current = null;
  let currentText = '';

  function place(x, y) {
    const m = 8, w = tip.offsetWidth, h = tip.offsetHeight;
    let left = x + 14, top = y + 16;
    if (left + w > window.innerWidth - m) left = x - w - 14;      // flip horizontally
    if (top + h > window.innerHeight - m) top = y - h - 16;       // flip vertically
    tip.style.left = Math.max(m, left) + 'px';
    tip.style.top = Math.max(m, top) + 'px';
  }

  function onMove(e) {
    if (e.pointerType === 'touch') return;
    const host = e.target.closest?.('[data-tip]');
    const text = host?.getAttribute('data-tip') || '';
    if (!host || !text) {
      if (current) { current = null; currentText = ''; tip.style.display = 'none'; }
      return;
    }
    if (host !== current || text !== currentText) {               // re-read on change (canvas hover)
      current = host; currentText = text;
      tip.innerHTML = text.split('\n').map((line) => `<div>${esc(line)}</div>`).join('');
      tip.style.display = 'block';
    }
    if (e.buttons) { tip.style.display = 'none'; return; }        // hidden while dragging
    place(e.clientX, e.clientY);
  }

  document.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('mousemove', onMove, { passive: true });   // webview fallback

  const hide = () => { if (current) { current = null; currentText = ''; tip.style.display = 'none'; } };
  document.addEventListener('pointerdown', hide, { passive: true });
  window.addEventListener('blur', hide);
}
