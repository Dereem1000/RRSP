/**
 * CAPTCHA gate for marketing links (Open Live Demo, Access POS, etc.).
 * When CAPTCHA is enabled, external links with data-cd-link-slot require verification
 * before opening in a new tab.
 */
(function (global) {
  const MODAL_ID = 'cd-marketing-link-captcha-modal';
  const MOUNT_ID = 'cd-marketing-link-captcha-mount';

  function isExternalHref(href) {
    if (!href || href === '#') return false;
    if (href.charAt(0) === '#') return false;
    return /^https?:\/\//i.test(href);
  }

  function slotForLink(link) {
    return (
      link.getAttribute('data-cd-demo-slug') ||
      link.getAttribute('data-cd-link-slot') ||
      'marketing-link'
    );
  }

  function ensureModal() {
    let overlay = document.getElementById(MODAL_ID);
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.style.cssText =
      'display:none;position:fixed;inset:0;z-index:10060;background:rgba(15,23,42,0.65);align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML =
      '<div style="background:#fff;border-radius:14px;padding:24px;max-width:360px;width:100%;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,0.25)">' +
      '<p style="margin:0 0 16px;font-weight:600;color:#0f172a">Verify you are human to continue</p>' +
      '<div id="' + MOUNT_ID + '" style="display:flex;justify-content:center;margin-bottom:16px"></div>' +
      '<div style="display:flex;gap:10px;justify-content:center">' +
      '<button type="button" id="cd-marketing-link-captcha-cancel" style="padding:10px 16px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer">Cancel</button>' +
      '<button type="button" id="cd-marketing-link-captcha-confirm" style="padding:10px 16px;border:none;border-radius:8px;background:#6366f1;color:#fff;font-weight:600;cursor:pointer">Continue</button>' +
      '</div></div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  async function verifyAccess(slug) {
    let captchaToken = '';
    if (global.CDPublicCaptcha) {
      try {
        captchaToken = global.CDPublicCaptcha.requireToken();
      } catch (err) {
        if (String(err.message || err).includes('CAPTCHA')) {
          alert('Please complete the CAPTCHA verification.');
          return false;
        }
      }
    }

    const res = await fetch('/api/public/live-demo-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, captchaToken: captchaToken || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      alert(data.message || 'Verification failed. Please try again.');
      if (global.CDPublicCaptcha) global.CDPublicCaptcha.reset();
      return false;
    }
    return true;
  }

  function openVerified(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function promptAndOpen(link) {
    if (!global.CDPublicCaptcha) {
      openVerified(link.href);
      return;
    }

    const cfg = await global.CDPublicCaptcha.loadConfig();
    if (!cfg.enabled) {
      openVerified(link.href);
      return;
    }

    const overlay = ensureModal();
    const mount = document.getElementById(MOUNT_ID);
    const cancelBtn = document.getElementById('cd-marketing-link-captcha-cancel');
    const confirmBtn = document.getElementById('cd-marketing-link-captcha-confirm');
    const slug = slotForLink(link);
    const targetUrl = link.href;

    function cleanup() {
      overlay.style.display = 'none';
      if (global.CDPublicCaptcha) global.CDPublicCaptcha.reset();
    }

    cancelBtn.onclick = function () {
      cleanup();
    };

    confirmBtn.onclick = async function () {
      confirmBtn.disabled = true;
      try {
        const ok = await verifyAccess(slug);
        if (!ok) return;
        cleanup();
        openVerified(targetUrl);
      } catch (e) {
        alert('Verification failed. Please try again.');
        if (global.CDPublicCaptcha) global.CDPublicCaptcha.reset();
      } finally {
        confirmBtn.disabled = false;
      }
    };

    overlay.style.display = 'flex';
    if (mount && global.CDPublicCaptcha) {
      await global.CDPublicCaptcha.render(mount);
    }
  }

  function bindLinks() {
    document.querySelectorAll('a[data-cd-link-slot]').forEach(function (link) {
      if (link.dataset.cdLinkGuardBound === '1') return;

      link.dataset.cdLinkGuardBound = '1';
      link.addEventListener('click', function (e) {
        const href = link.getAttribute('href') || '';
        if (!isExternalHref(href)) return;

        e.preventDefault();
        promptAndOpen(link);
      });
    });
  }

  function init() {
    bindLinks();
    document.addEventListener('cd-marketing-links-updated', bindLinks);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
