/**
 * Shared "Request Demo" modal for product marketing pages.
 * Requires public-captcha.js (load it before this script).
 */
(function (global) {
  let productName = 'Product Demo';
  let defaultSubtitle = '';
  let modalEl = null;
  let formEl = null;
  let captchaMounted = false;

  const STYLES = `
#cdDemoRequestModal.cd-demo-modal-overlay {
  display: none; position: fixed; inset: 0; z-index: 10050;
  background: rgba(15, 23, 42, 0.65); align-items: center; justify-content: center;
  padding: 20px;
}
#cdDemoRequestModal.cd-demo-modal-overlay.active { display: flex; }
#cdDemoRequestModal .cd-demo-modal-content {
  position: relative; width: 100%; max-width: 520px; max-height: 90vh; overflow-y: auto;
  background: #fff; border-radius: 16px; padding: 28px 24px 24px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.25);
}
#cdDemoRequestModal .cd-demo-close {
  position: absolute; top: 14px; right: 14px; width: 36px; height: 36px;
  border: none; border-radius: 50%; background: #e2e8f0; color: #475569;
  cursor: pointer; font-size: 18px; line-height: 1;
}
#cdDemoRequestModal .cd-demo-close:hover { background: #fecaca; color: #b91c1c; }
#cdDemoRequestModal h2 { margin: 0 0 6px; font-size: 1.5rem; color: #0f172a; }
#cdDemoRequestModal p.cd-demo-subtitle { margin: 0 0 20px; color: #64748b; font-size: 0.95rem; }
#cdDemoRequestModal .cd-demo-form-group { margin-bottom: 14px; }
#cdDemoRequestModal label { display: block; margin-bottom: 6px; font-weight: 600; font-size: 0.875rem; color: #334155; }
#cdDemoRequestModal input, #cdDemoRequestModal textarea {
  width: 100%; box-sizing: border-box; padding: 11px 14px;
  border: 2px solid #e2e8f0; border-radius: 8px; font: inherit; font-size: 1rem;
}
#cdDemoRequestModal input:focus, #cdDemoRequestModal textarea:focus {
  outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}
#cdDemoRequestModal textarea { min-height: 96px; resize: vertical; }
#cdDemoRequestModal .cd-demo-submit {
  width: 100%; margin-top: 8px; padding: 14px 20px; border: none; border-radius: 8px;
  background: #6366f1; color: #fff; font-weight: 600; font-size: 1rem; cursor: pointer;
}
#cdDemoRequestModal .cd-demo-submit:hover:not(:disabled) { background: #4f46e5; }
#cdDemoRequestModal .cd-demo-submit:disabled { opacity: 0.65; cursor: not-allowed; }
#cdDemoRequestCaptcha { margin: 12px 0; display: none; }
`;

  function injectStyles() {
    if (document.getElementById('cd-demo-request-styles')) return;
    const style = document.createElement('style');
    style.id = 'cd-demo-request-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  function ensureModal() {
    if (modalEl) return modalEl;
    injectStyles();
    const wrap = document.createElement('div');
    wrap.innerHTML = `
<div class="cd-demo-modal-overlay" id="cdDemoRequestModal" aria-hidden="true">
  <div class="cd-demo-modal-content" role="dialog" aria-labelledby="cdDemoRequestTitle">
    <button type="button" class="cd-demo-close" id="cdDemoRequestClose" aria-label="Close">&times;</button>
    <h2 id="cdDemoRequestTitle">Request a Demo</h2>
    <p class="cd-demo-subtitle" id="cdDemoRequestSubtitle"></p>
    <form id="cdDemoRequestForm">
      <input type="text" name="website" tabindex="-1" autocomplete="off"
        style="position:absolute;left:-9999px;opacity:0;" aria-hidden="true">
      <div class="cd-demo-form-group">
        <label for="cdDemoName">Full Name *</label>
        <input type="text" id="cdDemoName" name="name" required autocomplete="name">
      </div>
      <div class="cd-demo-form-group">
        <label for="cdDemoEmail">Email Address *</label>
        <input type="email" id="cdDemoEmail" name="email" required autocomplete="email">
      </div>
      <div class="cd-demo-form-group">
        <label for="cdDemoPhone">Contact Number</label>
        <input type="tel" id="cdDemoPhone" name="phone" autocomplete="tel">
      </div>
      <div class="cd-demo-form-group">
        <label for="cdDemoMessage">Additional Information</label>
        <textarea id="cdDemoMessage" name="message" placeholder="Tell us about your business and requirements..."></textarea>
      </div>
      <div id="cdDemoRequestCaptcha"></div>
      <button type="submit" class="cd-demo-submit" id="cdDemoSubmitBtn">Send Demo Request</button>
    </form>
  </div>
</div>`;
    document.body.appendChild(wrap.firstElementChild);
    modalEl = document.getElementById('cdDemoRequestModal');
    formEl = document.getElementById('cdDemoRequestForm');
    if (global.CDPhoneInput) global.CDPhoneInput.init(modalEl);

    document.getElementById('cdDemoRequestClose').addEventListener('click', close);
    modalEl.addEventListener('click', function (e) {
      if (e.target === modalEl) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modalEl.classList.contains('active')) close();
    });
    formEl.addEventListener('submit', onSubmit);
    return modalEl;
  }

  function close() {
    if (!modalEl) return;
    modalEl.classList.remove('active');
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (formEl) formEl.reset();
    if (global.CDPublicCaptcha) global.CDPublicCaptcha.reset();
  }

  async function open(opts) {
    ensureModal();
    const title = (opts && opts.title) || 'Request a Demo';
    const subtitle =
      (opts && opts.subtitle) ||
      defaultSubtitle ||
      'Schedule a personalized demonstration of our ' + productName + '.';
    document.getElementById('cdDemoRequestTitle').textContent = title;
    document.getElementById('cdDemoRequestSubtitle').textContent = subtitle;
    modalEl.classList.add('active');
    modalEl.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    if (global.CDPublicCaptcha && !captchaMounted) {
      await global.CDPublicCaptcha.render(document.getElementById('cdDemoRequestCaptcha'));
      captchaMounted = true;
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('cdDemoSubmitBtn');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sending…';

    try {
      const fd = new FormData(formEl);
      const payload = {
        name: String(fd.get('name') || '').trim(),
        email: String(fd.get('email') || '').trim(),
        phone: String(fd.get('phone') || '').trim(),
        message: String(fd.get('message') || '').trim(),
        product: productName,
        website: String(fd.get('website') || ''),
      };

      if (global.CDPublicCaptcha) {
        try {
          payload.captchaToken = global.CDPublicCaptcha.requireToken() || undefined;
        } catch (err) {
          if (String(err.message || err).includes('CAPTCHA')) {
            alert('Please complete the CAPTCHA verification.');
            return;
          }
        }
      }

      const res = await fetch('/api/public/demo-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to send demo request');
      }

      alert(data.message || 'Demo request sent! We will contact you within 24 hours.');
      close();
    } catch (err) {
      alert(err.message || 'There was an error sending your request. Please try again.');
      if (global.CDPublicCaptcha) global.CDPublicCaptcha.reset();
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  function bindTriggers() {
    document.querySelectorAll('[data-cd-demo-request]').forEach(function (el) {
      if (el.dataset.cdDemoBound) return;
      el.dataset.cdDemoBound = '1';
      el.addEventListener('click', function (e) {
        e.preventDefault();
        open();
      });
    });
  }

  function init(opts) {
    opts = opts || {};
    if (opts.product) productName = opts.product;
    if (opts.subtitle) defaultSubtitle = opts.subtitle;
    ensureModal();
    bindTriggers();
    if (typeof opts.onReady === 'function') opts.onReady();
  }

  global.CDDemoRequest = { init: init, open: open, close: close };
})(typeof window !== 'undefined' ? window : globalThis);
