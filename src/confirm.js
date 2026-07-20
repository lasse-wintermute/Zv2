// Lightweight confirm dialog for destructive actions (SOTD pattern). Returns a
// Promise<boolean>. Dismissible via Cancel, backdrop click, or Esc. No dependencies.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function confirmAction({ title = 'Are you sure?', body = '', confirm = 'Confirm', cancel = 'Cancel', danger = true } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `<div class="confirm-card" role="dialog" aria-modal="true">
        <h3>${esc(title)}</h3>
        ${body ? `<p>${esc(body)}</p>` : ''}
        <div class="confirm-actions">
          <button data-confirm-cancel>${esc(cancel)}</button>
          <button class="${danger ? 'danger' : 'primary'}" data-confirm-ok>${esc(confirm)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    function done(result) {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(result);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); done(false); }
      if (e.key === 'Enter') { e.preventDefault(); done(true); }
    }
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-confirm-cancel]')) done(false);
      else if (e.target.closest('[data-confirm-ok]')) done(true);
    });
    document.addEventListener('keydown', onKey);
    overlay.querySelector('[data-confirm-ok]')?.focus();
  });
}
