/**
 * Marketing page link editor.
 * - Applies saved overrides for everyone.
 * - Shows Edit only for admins on marked links (data-cd-link-slot).
 */
(function (global) {
  const STYLE_ID = 'cd-marketing-link-editor-style';
  let overridesCache = {};
  let isAdminFlag = false;

  function toast(message, isError) {
    const el = document.createElement('div');
    el.className = 'cd-mkt-toast' + (isError ? ' error' : '');
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .cd-mkt-link-wrap {
        display: inline-flex !important;
        align-items: center;
        position: relative;
        vertical-align: middle;
      }
      .cd-mkt-link-wrap > .cd-mkt-edit-btn,
      .cd-mkt-link-wrap > .cd-mkt-link-edit-btn {
        position: absolute;
        top: 4px;
        right: 4px;
        z-index: 12;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 11px;
        border: 0;
        border-radius: 999px;
        cursor: pointer;
        background: rgba(15,23,42,.88);
        color: #fff;
        font: 600 12px/1 Inter, system-ui, sans-serif;
        box-shadow: 0 8px 20px rgba(15,23,42,.28);
        opacity: 0;
        transition: opacity .18s ease, transform .18s ease;
        line-height: 1;
        pointer-events: auto;
      }
      .cd-mkt-link-wrap:hover > .cd-mkt-edit-btn,
      .cd-mkt-link-wrap:hover > .cd-mkt-link-edit-btn,
      .cd-mkt-link-wrap > .cd-mkt-edit-btn:focus,
      .cd-mkt-link-wrap > .cd-mkt-link-edit-btn:focus {
        opacity: 1;
        transform: translateY(-1px);
      }
      .cd-mkt-link-modal {
        display: none;
        position: fixed;
        inset: 0;
        z-index: 10050;
        background: rgba(15,23,42,.65);
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      .cd-mkt-link-modal.open { display: flex; }
      .cd-mkt-link-modal-card {
        background: #fff;
        border-radius: 16px;
        padding: 24px;
        max-width: 480px;
        width: 100%;
        box-shadow: 0 20px 50px rgba(0,0,0,.25);
      }
      .cd-mkt-link-modal-card h3 {
        margin: 0 0 8px;
        font: 700 18px/1.3 Inter, system-ui, sans-serif;
        color: #0f172a;
      }
      .cd-mkt-link-modal-card p {
        margin: 0 0 16px;
        font: 400 14px/1.5 Inter, system-ui, sans-serif;
        color: #64748b;
      }
      .cd-mkt-link-modal-card input {
        width: 100%;
        padding: 12px 14px;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        font: 400 14px/1.4 Inter, system-ui, sans-serif;
        margin-bottom: 16px;
      }
      .cd-mkt-link-modal-actions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
      }
      .cd-mkt-link-modal-actions button {
        padding: 10px 16px;
        border-radius: 10px;
        font: 600 14px/1 Inter, system-ui, sans-serif;
        cursor: pointer;
      }
      .cd-mkt-link-modal-cancel {
        border: 1px solid #cbd5e1;
        background: #fff;
        color: #334155;
      }
      .cd-mkt-link-modal-save {
        border: 0;
        background: #6366f1;
        color: #fff;
      }
      .cd-mkt-link-modal-save[disabled] { opacity: .7; cursor: wait; }
      .cd-mkt-toast {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 10000;
        background: #0f172a;
        color: #fff;
        padding: 12px 16px;
        border-radius: 12px;
        font: 500 13px/1.4 Inter, system-ui, sans-serif;
        box-shadow: 0 12px 30px rgba(0,0,0,.25);
      }
      .cd-mkt-toast.error { background: #991b1b; }
    `;
    document.head.appendChild(style);
  }

  function candidateLinks() {
    return Array.from(document.querySelectorAll('a[data-cd-link-slot]'));
  }

  function getCurrentUrl(el) {
    const slot = el.getAttribute('data-cd-link-slot');
    if (slot && overridesCache[slot]) return overridesCache[slot];
    const href = el.getAttribute('href');
    if (href && href !== '#') return href;
    return el.getAttribute('data-cd-link-default') || '';
  }

  function applyOverrides(overrides) {
    overridesCache = overrides || {};
    candidateLinks().forEach((el) => {
      const slot = el.getAttribute('data-cd-link-slot');
      if (!slot) return;
      const next = overridesCache[slot];
      if (!next) return;
      if (!el.getAttribute('data-cd-link-default')) {
        el.setAttribute('data-cd-link-default', el.getAttribute('href') || '');
      }
      if (el.tagName === 'A') {
        el.setAttribute('href', next);
      }
    });
  }

  function wrapForEdit(link) {
    if (link.parentElement && link.parentElement.classList.contains('cd-mkt-link-wrap')) {
      return link.parentElement;
    }
    const wrap = document.createElement('span');
    wrap.className = 'cd-mkt-link-wrap cd-mkt-host';
    link.parentNode.insertBefore(wrap, link);
    wrap.appendChild(link);
    return wrap;
  }

  let modal;
  let modalInput;
  let modalSave;
  let pendingLink = null;

  function ensureModal() {
    if (modal) return;
    modal = document.createElement('div');
    modal.className = 'cd-mkt-link-modal';
    modal.innerHTML =
      '<div class="cd-mkt-link-modal-card" role="dialog" aria-labelledby="cd-mkt-link-modal-title">' +
      '<h3 id="cd-mkt-link-modal-title">Edit link</h3>' +
      '<p>Enter the URL this button should open.</p>' +
      '<input type="url" placeholder="https://example.com" autocomplete="off" spellcheck="false">' +
      '<div class="cd-mkt-link-modal-actions">' +
      '<button type="button" class="cd-mkt-link-modal-cancel">Cancel</button>' +
      '<button type="button" class="cd-mkt-link-modal-save">Save</button>' +
      '</div></div>';
    document.body.appendChild(modal);
    modalInput = modal.querySelector('input');
    modalSave = modal.querySelector('.cd-mkt-link-modal-save');
    modal.querySelector('.cd-mkt-link-modal-cancel').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    modalSave.addEventListener('click', saveModal);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
    });
  }

  function openModal(link) {
    ensureModal();
    pendingLink = link;
    modalInput.value = getCurrentUrl(link);
    modal.classList.add('open');
    modalInput.focus();
    modalInput.select();
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('open');
    pendingLink = null;
  }

  async function saveModal() {
    if (!pendingLink) return;
    const slot = pendingLink.getAttribute('data-cd-link-slot');
    const url = modalInput.value.trim();
    if (!slot || !url) {
      toast('Enter a valid URL', true);
      return;
    }
    modalSave.disabled = true;
    modalSave.textContent = 'Saving…';
    try {
      const res = await fetch('/api/marketing-links', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot, url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Update failed');
      }
      applyOverrides(data.overrides || { [slot]: data.url });
      document.dispatchEvent(new CustomEvent('cd-marketing-links-updated'));
      toast('Link updated');
      closeModal();
    } catch (err) {
      toast(err && err.message ? err.message : 'Update failed', true);
    } finally {
      modalSave.disabled = false;
      modalSave.textContent = 'Save';
    }
  }

  function attachEditor(link) {
    const slot = link.getAttribute('data-cd-link-slot');
    if (!slot) return;
    if (link.dataset.cdLinkEditAttached === '1') return;

    const wrap = wrapForEdit(link);
    if (wrap.querySelector('.cd-mkt-link-edit-btn')) {
      link.dataset.cdLinkEditAttached = '1';
      return;
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cd-mkt-link-edit-btn';
    btn.title = 'Edit link';
    btn.innerHTML = '<i class="fas fa-link" aria-hidden="true"></i><span>Edit</span>';
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openModal(link);
    });
    wrap.appendChild(btn);
    link.dataset.cdLinkEditAttached = '1';
  }

  function attachAllEditors() {
    candidateLinks().forEach(attachEditor);
  }

  async function init() {
    ensureStyles();

    candidateLinks().forEach((el) => {
      if (!el.getAttribute('data-cd-link-default') && el.tagName === 'A') {
        el.setAttribute('data-cd-link-default', el.getAttribute('href') || '');
      }
    });

    try {
      const res = await fetch('/api/marketing-links', { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.overrides) applyOverrides(data.overrides);
      }
    } catch {
      /* public pages still work without overrides */
    }

    document.dispatchEvent(new CustomEvent('cd-marketing-links-updated'));

    try {
      const meRes = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (meRes.ok) {
        const me = await meRes.json();
        isAdminFlag = Boolean(me && me.success && me.user && me.user.role === 'admin');
      }
    } catch {
      isAdminFlag = false;
    }

    if (!isAdminFlag) return;

    attachAllEditors();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
