// Shared movement and native two-axis resizing for floating game windows.
// Position and dimensions persist locally for each window type.
export function makeDraggable(root, options = {}) {
  const handleSelector = options.handle || 'header';
  const targetSelector = options.target || null;
  const storageKey = options.storageKey || '';
  const margin = 8;
  const minWidth = options.minWidth || 260;
  const minHeight = options.minHeight || 160;
  let drag = null;
  const observed = new WeakSet();

  const target = () => targetSelector ? root.querySelector(targetSelector) : root;
  const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
  function safeViewportBottom() {
    // Only clamp above the HUD when it actually sits in the lower half (legacy
    // bottom-bar layout); with the SOTD top bar the full height is usable.
    const hud = document.querySelector('.hud');
    const hudRect = hud?.getBoundingClientRect();
    const hudAtBottom = hudRect && hudRect.height > 0 && hudRect.top > window.innerHeight / 2;
    return hudAtBottom ? Math.min(window.innerHeight - margin, hudRect.top - 6) : window.innerHeight - margin;
  }

  function grip() { return Array.from(root.children).find((child) => child.classList?.contains('window-resizer')) || null; }
  function syncGrip(el) {
    const handle = grip();
    if (!handle) return;
    const rect = el.getBoundingClientRect();
    const safeBottom = safeViewportBottom();
    handle.style.left = `${Math.max(0, rect.right - 19)}px`;
    handle.style.top = `${Math.max(0, Math.min(rect.bottom, safeBottom) - 19)}px`;
    handle.classList.toggle('hud-lifted', rect.bottom > safeBottom);
  }
  function ensureGrip(el) {
    let handle = grip();
    if (!handle) {
      handle = document.createElement('span');
      handle.className = 'window-resizer';
      handle.title = 'Drag to resize';
      handle.setAttribute('aria-label', 'Resize window');
      root.appendChild(handle);
    }
    syncGrip(el);
  }

  function position(el, left, top) {
    el.style.left = `${clamp(left, margin, window.innerWidth - el.offsetWidth - margin)}px`;
    el.style.top = `${clamp(top, margin, window.innerHeight - el.offsetHeight - margin)}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.transform = 'none';
    syncGrip(el);
  }

  function size(el, width, height) {
    const rect = el.getBoundingClientRect();
    const maxWidth = Math.max(minWidth, window.innerWidth - Math.max(margin, rect.left) - margin);
    const maxHeight = Math.max(minHeight, safeViewportBottom() - Math.max(margin, rect.top));
    el.style.width = `${clamp(width, Math.min(minWidth, maxWidth), maxWidth)}px`;
    el.style.height = `${clamp(height, Math.min(minHeight, maxHeight), maxHeight)}px`;
    el.style.maxWidth = 'none';
    el.style.maxHeight = 'none';
    syncGrip(el);
  }

  function save(el) {
    if (!storageKey) return;
    try {
      const rect = el.getBoundingClientRect();
      localStorage.setItem(storageKey, JSON.stringify({ left: parseFloat(el.style.left), top: parseFloat(el.style.top), width: rect.width, height: rect.height }));
    } catch { /* storage may be disabled */ }
  }

  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => {
    for (const entry of entries) if (entry.target.offsetParent !== null) { syncGrip(entry.target); save(entry.target); }
  }) : null;

  function prepare(el) {
    el.classList.add('zv2-resizable-window');
    el.style.minWidth = `${minWidth}px`;
    el.style.minHeight = `${minHeight}px`;
    ensureGrip(el);
    if (resizeObserver && !observed.has(el)) { observed.add(el); resizeObserver.observe(el); }
  }

  function restore() {
    const el = target();
    if (!el) return;
    prepare(el);
    if (!storageKey) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (Number.isFinite(saved?.width) && Number.isFinite(saved?.height)) size(el, saved.width, saved.height);
      if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) position(el, saved.left, saved.top);
      syncGrip(el);
    } catch { /* ignore invalid local data */ }
  }

  root.addEventListener('pointerdown', (event) => {
    const resizeHandle = event.target.closest('.window-resizer');
    const el = target();
    if (resizeHandle && el) {
      const rect = el.getBoundingClientRect();
      position(el, rect.left, rect.top);
      size(el, rect.width, rect.height);
      drag = { mode: 'resize', el, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, width: rect.width, height: rect.height };
      el.classList.add('resizing');
      root.classList.add('window-interacting');
      resizeHandle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      return;
    }
    const handle = event.target.closest(handleSelector);
    if (!handle || !el || !root.contains(handle) || event.target.closest('button, a, input, select, textarea')) return;
    const rect = el.getBoundingClientRect();
    position(el, rect.left, rect.top);
    drag = { mode: 'move', el, pointerId: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    el.classList.add('dragging');
    root.classList.add('window-interacting');
    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });

  root.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (drag.mode === 'resize') size(drag.el, drag.width + event.clientX - drag.startX, drag.height + event.clientY - drag.startY);
    else position(drag.el, event.clientX - drag.dx, event.clientY - drag.dy);
  });

  const finish = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    save(drag.el);
    drag.el.classList.remove('dragging', 'resizing');
    root.classList.remove('window-interacting');
    drag = null;
  };
  root.addEventListener('pointerup', finish);
  root.addEventListener('pointercancel', finish);
  window.addEventListener('resize', () => {
    const el = target();
    if (el && el.offsetParent !== null) {
      const rect = el.getBoundingClientRect();
      size(el, rect.width, rect.height);
      position(el, rect.left, rect.top);
      save(el);
    }
  });

  return { restore, isInteracting: () => !!drag };
}
