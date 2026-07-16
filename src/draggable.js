// Pointer-based dragging for floating game windows. Positions persist locally.
export function makeDraggable(root, options = {}) {
  const handleSelector = options.handle || 'header';
  const targetSelector = options.target || null;
  const storageKey = options.storageKey || '';
  const margin = 8;
  let drag = null;

  const target = () => targetSelector ? root.querySelector(targetSelector) : root;
  const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

  function position(el, left, top) {
    el.style.left = `${clamp(left, margin, window.innerWidth - el.offsetWidth - margin)}px`;
    el.style.top = `${clamp(top, margin, window.innerHeight - el.offsetHeight - margin)}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.transform = 'none';
  }

  function save(el) {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ left: parseFloat(el.style.left), top: parseFloat(el.style.top) }));
    } catch { /* storage may be disabled */ }
  }

  function restore() {
    const el = target();
    if (!el || !storageKey) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) position(el, saved.left, saved.top);
    } catch { /* ignore invalid local data */ }
  }

  root.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest(handleSelector);
    const el = target();
    if (!handle || !el || !root.contains(handle) || event.target.closest('button, a, input, select, textarea')) return;
    const rect = el.getBoundingClientRect();
    position(el, rect.left, rect.top);
    drag = { el, pointerId: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    el.classList.add('dragging');
    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });

  root.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    position(drag.el, event.clientX - drag.dx, event.clientY - drag.dy);
  });

  const finish = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    save(drag.el);
    drag.el.classList.remove('dragging');
    drag = null;
  };
  root.addEventListener('pointerup', finish);
  root.addEventListener('pointercancel', finish);
  window.addEventListener('resize', () => {
    const el = target();
    if (el && el.offsetParent !== null) {
      const rect = el.getBoundingClientRect();
      position(el, rect.left, rect.top);
      save(el);
    }
  });

  return { restore };
}
