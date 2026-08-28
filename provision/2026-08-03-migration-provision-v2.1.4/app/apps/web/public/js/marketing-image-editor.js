/**
 * Marketing page image editor.
 * - Applies saved overrides for everyone.
 * - Shows Edit only for admins on product screenshots (never header/logo/nav).
 * - Does not wrap images (wrapping broke the fixed header logo/menu).
 */
(function () {
  const STYLE_ID = 'cd-marketing-image-editor-style';
  const SKIP_SRC = /(logo\.png|logo\.svg|fontawesome|cdnjs|googleapis|data:image\/svg|favicon)/i;
  const SKIP_ANCESTOR = '.header, header, .nav, nav, .logo, .site-header, .navbar';

  function normalizeSlot(src) {
    if (!src) return null;
    try {
      const url = new URL(src, window.location.origin);
      let path = decodeURIComponent(url.pathname).replace(/^\/+/, '').replace(/\\/g, '/');
      if (path.startsWith('images/marketing-overrides/')) return null;
      if (SKIP_SRC.test(path)) return null;
      if (!path.startsWith('images/')) return null;
      if (path.includes('..')) return null;
      return path;
    } catch {
      return null;
    }
  }

  function isEditableImage(img) {
    if (!img || img.tagName !== 'IMG') return false;
    if (img.closest(SKIP_ANCESTOR)) return false;
    const src = img.getAttribute('src') || '';
    if (!src || SKIP_SRC.test(src)) return false;
    return Boolean(normalizeSlot(src) || normalizeSlot(img.dataset.cdSlot || ''));
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* Never let editor chrome break the site header */
      .header .cd-mkt-img-wrap,
      header .cd-mkt-img-wrap,
      .nav .cd-mkt-img-wrap,
      nav .cd-mkt-img-wrap,
      .logo .cd-mkt-img-wrap {
        display: contents !important;
      }
      .header .cd-mkt-edit-btn,
      header .cd-mkt-edit-btn,
      .nav .cd-mkt-edit-btn,
      nav .cd-mkt-edit-btn,
      .logo .cd-mkt-edit-btn {
        display: none !important;
      }
      .header .logo img,
      header .logo img,
      .logo img {
        height: 50px !important;
        width: auto !important;
        max-width: 200px !important;
        object-fit: contain !important;
      }

      .cd-mkt-host {
        position: relative;
      }
      .cd-mkt-edit-btn {
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 5;
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
      }
      .cd-mkt-host:hover > .cd-mkt-edit-btn,
      .cd-mkt-edit-btn:focus {
        opacity: 1;
        transform: translateY(-1px);
      }
      .cd-mkt-edit-btn[disabled] { opacity: .7; cursor: wait; }
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

  function toast(message, isError) {
    const el = document.createElement('div');
    el.className = 'cd-mkt-toast' + (isError ? ' error' : '');
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  /** Undo damage from older editor versions that wrapped the logo. */
  function repairHeader() {
    document.querySelectorAll('.header .cd-mkt-img-wrap, header .cd-mkt-img-wrap, .logo .cd-mkt-img-wrap, .nav .cd-mkt-img-wrap').forEach((wrap) => {
      const parent = wrap.parentNode;
      if (!parent) return;
      while (wrap.firstChild) parent.insertBefore(wrap.firstChild, wrap);
      wrap.remove();
    });
    document.querySelectorAll('.header .cd-mkt-edit-btn, header .cd-mkt-edit-btn, .logo .cd-mkt-edit-btn, .nav .cd-mkt-edit-btn').forEach((btn) => {
      const input = btn.parentElement && btn.parentElement.querySelector('input[type="file"][hidden]');
      btn.remove();
      if (input) input.remove();
    });
    document.querySelectorAll('.header img, .logo img').forEach((img) => {
      img.removeAttribute('data-cd-slot');
      delete img.dataset.cdSlot;
    });
  }

  function candidateImages() {
    return Array.from(document.querySelectorAll('img')).filter(isEditableImage);
  }

  function applyOverrides(overrides) {
    const map = overrides || {};
    candidateImages().forEach((img) => {
      const original =
        img.dataset.cdSlot ||
        normalizeSlot(img.getAttribute('data-original-src') || '') ||
        normalizeSlot(img.getAttribute('src') || '');
      if (!original) return;
      img.dataset.cdSlot = original;
      if (!img.getAttribute('data-original-src')) {
        img.setAttribute('data-original-src', img.getAttribute('src') || original);
      }
      const next = map[original];
      if (next && img.getAttribute('src') !== next) {
        img.setAttribute('src', next);
      }
    });
  }

  async function uploadForImage(img, file) {
    const slot = img.dataset.cdSlot || normalizeSlot(img.getAttribute('data-original-src') || img.src);
    if (!slot) throw new Error('Could not resolve image slot');
    const body = new FormData();
    body.append('slot', slot);
    body.append('file', file);
    const res = await fetch('/api/marketing-images', { method: 'POST', body, credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Upload failed');
    }
    applyOverrides(data.overrides || { [slot]: data.url });
    return data;
  }

  function hostForImage(img) {
    const parent = img.parentElement;
    if (!parent || parent.closest(SKIP_ANCESTOR)) return null;
    parent.classList.add('cd-mkt-host');
    const computed = window.getComputedStyle(parent);
    if (computed.position === 'static') {
      parent.style.position = 'relative';
    }
    return parent;
  }

  function attachEditor(img) {
    if (!isEditableImage(img)) return;
    const host = hostForImage(img);
    if (!host || host.querySelector(':scope > .cd-mkt-edit-btn')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cd-mkt-edit-btn';
    btn.title = 'Replace image';
    btn.innerHTML = '<i class="fas fa-pen" aria-hidden="true"></i><span>Edit</span>';

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.hidden = true;

    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      input.click();
    });

    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.value = '';
      if (!file) return;
      btn.disabled = true;
      btn.querySelector('span').textContent = 'Saving…';
      try {
        await uploadForImage(img, file);
        toast('Image updated');
      } catch (err) {
        toast(err && err.message ? err.message : 'Upload failed', true);
      } finally {
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Edit';
      }
    });

    host.appendChild(btn);
    host.appendChild(input);
  }

  async function init() {
    ensureStyles();
    repairHeader();

    candidateImages().forEach((img) => {
      const slot = normalizeSlot(img.getAttribute('src') || '');
      if (slot) {
        img.dataset.cdSlot = slot;
        if (!img.getAttribute('data-original-src')) {
          img.setAttribute('data-original-src', img.getAttribute('src') || '');
        }
      }
    });

    try {
      const overrideRes = await fetch('/api/marketing-images', { credentials: 'same-origin' });
      if (overrideRes.ok) {
        const data = await overrideRes.json();
        if (data && data.overrides) applyOverrides(data.overrides);
      }
    } catch {
      /* public pages still work without overrides */
    }

    repairHeader();

    let isAdmin = false;
    try {
      const meRes = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (meRes.ok) {
        const me = await meRes.json();
        isAdmin = Boolean(me && me.success && me.user && me.user.role === 'admin');
      }
    } catch {
      isAdmin = false;
    }

    if (!isAdmin) return;
    candidateImages().forEach(attachEditor);
    repairHeader();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
