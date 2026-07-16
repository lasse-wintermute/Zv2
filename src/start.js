// Start screen — the new-user gameflow. Shown when there's no active player (fresh
// visit / expired session) or when the player hits "New game". Collects a survivor
// name and hands it to onNewGame, which calls POST /api/newgame.

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createStart(el, opts = {}) {
  const onNewGame = opts.onNewGame || (() => {});
  const onCancel = opts.onCancel || null;

  function submit() {
    const input = el.querySelector('.start-input');
    onNewGame((input && input.value ? input.value : '').trim());
  }

  // delegated once — survives innerHTML replacement
  el.addEventListener('click', (e) => {
    if (onCancel && e.target.closest('[data-act="cancel"]')) { onCancel(); return; }
    if (e.target.closest('[data-act="new"]')) submit();
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('start-input')) submit();
  });

  function show(o = {}) {
    el.innerHTML = `
      <div class="start-card">
        <div class="start-mark">Z<span>v2</span></div>
        <p class="start-tag">The dead own the wasteland.<br />Build something that outlives you.</p>
        <label class="start-label" for="survivor">Survivor name</label>
        <input id="survivor" class="start-input" maxlength="20" placeholder="e.g. Mara"
               autocomplete="off" spellcheck="false" />
        <button class="start-btn" data-act="new">Start a new game</button>
        ${o.canCancel ? '<button class="start-cancel" data-act="cancel">Back to my camp</button>' : ''}
        <div class="start-err" role="alert">${o.error ? escapeHtml(o.error) : ''}</div>
        <p class="start-foot">You wake with a handful of survivors, one battered headquarters, and a compound waiting to be rebuilt.</p>
      </div>`;
    el.classList.add('open');
    const input = el.querySelector('.start-input');
    input.value = o.name || '';
    input.focus();
    input.select();
  }

  function hide() { el.classList.remove('open'); el.innerHTML = ''; }

  function busy(msg) {
    const b = el.querySelector('.start-btn');
    if (b) { b.disabled = true; b.textContent = msg || 'Starting…'; }
  }

  return { show, hide, busy };
}
