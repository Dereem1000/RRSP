/**
 * Product installer buttons — uses cached static manifest for instant display.
 */
(function () {
  const STYLE_ID = 'cd-product-installer-style';
  const MODAL_ID = 'cd-product-installer-trust-modal';
  const SESSION_KEY = 'cd-product-installer-manifest-v1';
  const TRUST_NOTICE_SKIP_KEY = 'cd-product-installer-trust-notice-skip-v1';
  const SESSION_TTL_MS = 5 * 60 * 1000;

  function installHelpImageSrc(fileName) {
    const path = 'images/install-help/' + fileName;
    try {
      return new URL(path, window.location.href).href;
    } catch {
      return '/' + path;
    }
  }

  const INSTALL_HELP_IMAGES = [
    {
      file: 'step-1-browser-keep.svg',
      alt: 'Browser download with Keep button highlighted',
      caption: 'Keep the file',
    },
    {
      file: 'step-2-more-info.svg',
      alt: 'Windows screen with More info highlighted',
      caption: 'More info',
    },
    {
      file: 'step-3-run-anyway.svg',
      alt: 'Windows screen with Run anyway highlighted',
      caption: 'Run anyway',
    },
  ];

  function installHelpGalleryHtml() {
    return (
      '<div class="cd-installer-trust-gallery">' +
      INSTALL_HELP_IMAGES
        .map(function (img) {
          return (
            '<figure><img src="' +
            installHelpImageSrc(img.file) +
            '" width="400" height="220" alt="' +
            escapeHtml(img.alt) +
            '" loading="lazy"><figcaption>' +
            escapeHtml(img.caption) +
            '</figcaption></figure>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '.cd-product-installer-pending{pointer-events:none;opacity:.88}' +
      '.cd-product-installer-unavailable{display:none!important}' +
      '.cd-installer-trust-backdrop{position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,.55);' +
      'display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box}' +
      '.cd-installer-trust-dialog{max-width:min(720px,100%);width:100%;max-height:min(90vh,820px);overflow:auto;' +
      'background:#fff;border-radius:16px;box-shadow:0 24px 60px rgba(15,23,42,.35);padding:24px 26px 20px;' +
      'font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1e293b;line-height:1.55}' +
      '.cd-installer-trust-gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:0 0 16px}' +
      '@media(max-width:560px){.cd-installer-trust-gallery{grid-template-columns:1fr}}' +
      '.cd-installer-trust-gallery figure{margin:0;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;' +
      'box-shadow:0 4px 12px rgba(15,23,42,.08);background:#f8fafc}' +
      '.cd-installer-trust-gallery img{display:block;width:100%;height:auto}' +
      '.cd-installer-trust-gallery figcaption{font-size:.7rem;font-weight:600;color:#475569;text-align:center;' +
      'padding:6px 4px 8px;background:#fff}' +
      '.cd-installer-trust-dialog h2{margin:0 0 10px;font-size:1.25rem;font-weight:700;color:#0f172a}' +
      '.cd-installer-trust-dialog p{margin:0 0 12px;font-size:.9375rem;color:#475569}' +
      '.cd-installer-trust-file{font-size:.875rem;background:#f1f5f9;border-radius:8px;padding:8px 12px;' +
      'margin:0 0 14px;word-break:break-all;color:#334155}' +
      '.cd-installer-trust-steps{margin:0 0 16px;padding-left:1.25rem;font-size:.9rem;color:#334155}' +
      '.cd-installer-trust-steps li{margin-bottom:8px}' +
      '.cd-installer-trust-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:8px}' +
      '.cd-installer-trust-btn{border:none;border-radius:10px;padding:10px 18px;font-weight:600;font-size:.9rem;' +
      'cursor:pointer;font-family:inherit}' +
      '.cd-installer-trust-btn-primary{background:#4f46e5;color:#fff}' +
      '.cd-installer-trust-btn-primary:hover{background:#4338ca}' +
      '.cd-installer-trust-btn-ghost{background:transparent;color:#64748b;padding:10px 12px}' +
      '.cd-installer-trust-link{font-size:.875rem;color:#4f46e5;text-decoration:none;font-weight:500}' +
      '.cd-installer-trust-link:hover{text-decoration:underline}';
    document.head.appendChild(style);
  }

  function pageFileName() {
    const parts = (window.location.pathname || '').split('/');
    const last = parts[parts.length - 1] || '';
    return last.endsWith('.html') ? last : '';
  }

  function parseFeatures(el) {
    const multi = el.getAttribute('data-cd-product-features');
    if (multi) {
      return multi
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    const single = el.getAttribute('data-cd-product-feature');
    return single ? [single.trim()] : [];
  }

  function readSessionManifest() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      if (Date.now() - Number(parsed.cachedAt || 0) > SESSION_TTL_MS) return null;
      return parsed.manifest || null;
    } catch {
      return null;
    }
  }

  function writeSessionManifest(manifest) {
    try {
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ cachedAt: Date.now(), manifest }),
      );
    } catch {
      /* ignore quota */
    }
  }

  async function fetchManifest() {
    const cached = readSessionManifest();
    if (cached) return cached;

    try {
      const staticRes = await fetch('/product-installer-manifest.json', {
        credentials: 'same-origin',
        cache: 'default',
      });
      if (staticRes.ok) {
        const data = await staticRes.json();
        if (data && data.features) {
          writeSessionManifest(data);
          return data;
        }
      }
    } catch {
      /* try API */
    }

    const apiRes = await fetch('/api/public/product-installer/manifest', {
      credentials: 'same-origin',
      cache: 'default',
    });
    if (!apiRes.ok) return null;
    const data = await apiRes.json();
    if (!data || !data.success || !data.features) return null;
    writeSessionManifest(data);
    return data;
  }

  function pickEntry(manifest, features, page) {
    if (!manifest) return null;
    const pageEntry = page && manifest.pages && manifest.pages[page];
    if (pageEntry) return pageEntry;
    for (const feature of features) {
      const row = manifest.features && manifest.features[feature];
      if (row && row.downloadUrl) {
        return {
          feature,
          fileName: row.fileName,
          downloadUrl: row.downloadUrl,
        };
      }
    }
    return null;
  }

  function isInstallerDownloadUrl(url) {
    if (!url || url === '#') return false;
    return (
      url.indexOf('/product-installer/') !== -1 ||
      url.indexOf('product-installer/download') !== -1
    );
  }

  function trustNoticeEnabled(el) {
    if (!el) return true;
    return el.getAttribute('data-cd-installer-trust-notice') !== 'off';
  }

  function trustNoticeSkipped() {
    try {
      return sessionStorage.getItem(TRUST_NOTICE_SKIP_KEY) === '1';
    } catch {
      return false;
    }
  }

  function setTrustNoticeSkipped() {
    try {
      sessionStorage.setItem(TRUST_NOTICE_SKIP_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  function closeTrustModal() {
    const existing = document.getElementById(MODAL_ID);
    if (existing) existing.remove();
    document.body.style.overflow = '';
  }

  function showTrustModal(fileName) {
    if (trustNoticeSkipped()) return;
    closeTrustModal();
    const safeName = fileName || 'the setup file (.exe)';
    const backdrop = document.createElement('div');
    backdrop.id = MODAL_ID;
    backdrop.className = 'cd-installer-trust-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'cd-installer-trust-title');

    const dialog = document.createElement('div');
    dialog.className = 'cd-installer-trust-dialog';
    dialog.innerHTML =
      '<h2 id="cd-installer-trust-title">Your download started</h2>' +
      '<p>Windows or your antivirus may ask you to confirm first. Match what you see on screen to the pictures below.</p>' +
      '<p class="cd-installer-trust-file"><strong>Look for this file in Downloads:</strong> ' +
      escapeHtml(safeName) +
      '</p>' +
      installHelpGalleryHtml() +
      '<ol class="cd-installer-trust-steps">' +
      '<li>Open the file from your <strong>Downloads</strong> folder.</li>' +
      '<li>If antivirus blocks it, choose <strong>Allow</strong> or <strong>Restore</strong> (check the file name matches the one above).</li>' +
      '<li>Follow the on-screen setup steps. When setup finishes, your browser will open so you can register your license.</li>' +
      '</ol>' +
      '<p style="font-size:.875rem">Need help? ' +
      '<a class="cd-installer-trust-link" href="https://wa.me/18683168851?text=Hi! I need help installing the POS on my PC." target="_blank" rel="noopener noreferrer">Message us on WhatsApp</a>.</p>' +
      '<div class="cd-installer-trust-actions">' +
      '<button type="button" class="cd-installer-trust-btn cd-installer-trust-btn-primary" data-cd-trust-got-it>Got it</button>' +
      '<button type="button" class="cd-installer-trust-btn cd-installer-trust-btn-ghost" data-cd-trust-skip>Don\u2019t show again this visit</button>' +
      '</div>';

    backdrop.appendChild(dialog);
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) closeTrustModal();
    });
    dialog.querySelector('[data-cd-trust-got-it]').addEventListener('click', closeTrustModal);
    dialog.querySelector('[data-cd-trust-skip]').addEventListener('click', function () {
      setTrustNoticeSkipped();
      closeTrustModal();
    });
    document.addEventListener(
      'keydown',
      function onKey(e) {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', onKey);
          closeTrustModal();
        }
      },
      { once: true },
    );

    document.body.appendChild(backdrop);
    document.body.style.overflow = 'hidden';
    dialog.querySelector('[data-cd-trust-got-it]').focus();
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function triggerInstallerDownload(url, fileName, showNotice) {
    const link = document.createElement('a');
    link.href = url;
    if (fileName) link.setAttribute('download', fileName);
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    if (showNotice) {
      window.setTimeout(function () {
        showTrustModal(fileName);
      }, 400);
    }
  }

  function bindDownloadClick(el) {
    if (el.dataset.cdInstallerClickBound === '1') return;
    el.dataset.cdInstallerClickBound = '1';
    el.addEventListener(
      'click',
      function (e) {
        const url = el.getAttribute('href') || '';
        if (!isInstallerDownloadUrl(url)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        triggerInstallerDownload(
          url,
          el.getAttribute('download') || '',
          trustNoticeEnabled(el),
        );
      },
      true,
    );
  }

  function bindDelegatedInstallerLinks() {
    if (document.documentElement.dataset.cdInstallerDelegateBound === '1') return;
    document.documentElement.dataset.cdInstallerDelegateBound = '1';
    document.addEventListener(
      'click',
      function (e) {
        const anchor = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (!anchor || anchor.dataset.cdInstallerClickBound === '1') return;
        const url = anchor.getAttribute('href') || '';
        if (!isInstallerDownloadUrl(url)) return;
        if (anchor.classList.contains('cd-product-installer-pending')) return;
        e.preventDefault();
        triggerInstallerDownload(
          url,
          anchor.getAttribute('download') || '',
          trustNoticeEnabled(anchor),
        );
      },
      false,
    );
  }

  function applyButton(el, entry) {
    el.href = entry.downloadUrl;
    if (entry.fileName) {
      el.setAttribute('download', entry.fileName);
    }
    bindDownloadClick(el);
    el.classList.remove('cd-product-installer-pending');
    el.removeAttribute('aria-disabled');
    el.removeAttribute('hidden');
    el.style.display = '';
    if (entry.fileName) {
      const label = el.getAttribute('data-cd-installer-label');
      if (label && label.includes('{file}')) {
        el.innerHTML = label.replace('{file}', entry.fileName);
      }
    }
  }

  function hideButton(el) {
    el.classList.add('cd-product-installer-unavailable');
    el.classList.remove('cd-product-installer-pending');
    el.setAttribute('aria-hidden', 'true');
  }

  function initButtons(manifest) {
    const buttons = Array.from(
      document.querySelectorAll(
        '.cd-product-installer-btn,[data-cd-product-feature],[data-cd-product-features]',
      ),
    );
    if (!buttons.length) return;
    const page = pageFileName();
    for (const el of buttons) {
      if (el.tagName !== 'A') continue;
      const features = parseFeatures(el);
      const entry = pickEntry(manifest, features, page);
      if (entry) applyButton(el, entry);
      else hideButton(el);
    }
  }

  async function init() {
    ensureStyle();
    bindDelegatedInstallerLinks();
    const buttons = document.querySelectorAll('.cd-product-installer-btn');
    if (!buttons.length) return;

    const session = readSessionManifest();
    if (session) initButtons(session);

    try {
      const manifest = await fetchManifest();
      initButtons(manifest);
    } catch {
      if (!session) {
        buttons.forEach((el) => hideButton(el));
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    void init();
  }
})();
