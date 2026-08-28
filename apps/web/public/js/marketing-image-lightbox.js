/**
 * Click-to-enlarge for marketing page screenshots.
 * Binds all product images except the hero gallery and site chrome (logo/nav).
 */
(function () {
  const STYLE_ID = 'cd-marketing-lightbox-style';
  const SKIP_ANCESTOR =
    '.header, header, .nav, nav, .logo, .site-header, .navbar, .hero-gallery';
  const EDITOR_CHROME = '.cd-mkt-edit-btn, .cd-mkt-adjust-btn, .cd-mkt-adjust-panel';
  const SKIP_SRC = /(logo\.png|logo\.svg|fontawesome|cdnjs|googleapis|favicon)/i;

  let modalBound = false;

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      'img[data-cd-lightbox-bound]{cursor:zoom-in}' +
      '#cdMarketingLightbox.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:20000;align-items:center;justify-content:center;padding:24px}' +
      '#cdMarketingLightbox.modal-overlay.active,#cdMarketingLightbox.modal-overlay.is-open{display:flex}' +
      '#cdMarketingLightbox .modal-content{background:#fff;border-radius:20px;padding:28px 32px;max-width:min(96vw,1400px);max-height:92vh;position:relative;text-align:center}' +
      '#cdMarketingLightbox .modal-close{position:absolute;top:14px;right:14px;background:none;border:none;font-size:24px;color:#64748b;cursor:pointer;line-height:1}' +
      '#cdMarketingLightbox #cdMarketingLightboxImage{max-width:100%;max-height:78vh;border-radius:12px;display:block;margin:0 auto 14px}' +
      '#cdMarketingLightbox .modal-title{font-size:1.2rem;font-weight:700;color:#0f172a;margin:0}';
    document.head.appendChild(style);
  }

  function resolveModalSrc(img) {
    if (!img) return '';
    const current = img.getAttribute('src') || img.src || '';
    if (
      current &&
      !/^data:image\/svg/i.test(current) &&
      !/^data:image\/gif/i.test(current)
    ) {
      return current;
    }
    const slot = img.dataset.cdSlot || img.getAttribute('data-original-src') || '';
    if (!slot) return current;
    return slot.startsWith('/') ? slot : '/' + slot.replace(/^\/+/, '');
  }

  function getModalElements() {
    let modal = document.getElementById('imageModal');
    let modalImage = document.getElementById('modalImage');
    let modalTitle = document.getElementById('modalTitle');
    let modalClose = document.getElementById('modalClose');

    if (!modal) {
      modal = document.getElementById('cdMarketingLightbox');
    }
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'cdMarketingLightbox';
      modal.className = 'modal-overlay';
      modal.innerHTML =
        '<div class="modal-content">' +
        '<button type="button" class="modal-close" id="cdMarketingLightboxClose" aria-label="Close">&times;</button>' +
        '<img id="cdMarketingLightboxImage" src="" alt="">' +
        '<h3 class="modal-title" id="cdMarketingLightboxTitle">Image Preview</h3>' +
        '</div>';
      document.body.appendChild(modal);
      modalImage = modal.querySelector('#cdMarketingLightboxImage');
      modalTitle = modal.querySelector('#cdMarketingLightboxTitle');
      modalClose = modal.querySelector('#cdMarketingLightboxClose');
    }

    return { modal, modalImage, modalTitle, modalClose };
  }

  function showModal(modal) {
    modal.classList.add('active', 'is-open');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function hideModal(modal) {
    modal.classList.remove('active', 'is-open');
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  function bindModalChrome() {
    if (modalBound) return;
    const { modal, modalClose } = getModalElements();
    if (!modal) return;
    modalBound = true;

    const close = () => hideModal(modal);

    if (modalClose && !modalClose.dataset.cdLightboxBound) {
      modalClose.dataset.cdLightboxBound = '1';
      modalClose.addEventListener('click', close);
    }

    if (!modal.dataset.cdLightboxOverlayBound) {
      modal.dataset.cdLightboxOverlayBound = '1';
      modal.addEventListener('click', (event) => {
        if (event.target === modal) close();
      });
    }

    if (!window.__cdMarketingLightboxEscapeBound) {
      window.__cdMarketingLightboxEscapeBound = true;
      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        const active = document.getElementById('imageModal') || document.getElementById('cdMarketingLightbox');
        if (active && (active.classList.contains('active') || active.classList.contains('is-open') || active.style.display === 'flex')) {
          hideModal(active);
        }
      });
    }
  }

  function openLightbox(img, title) {
    if (!img) return;
    ensureStyles();
    bindModalChrome();
    const { modal, modalImage, modalTitle } = getModalElements();
    const label = title || img.alt || 'Image Preview';
    modalImage.src = resolveModalSrc(img);
    modalImage.alt = img.alt || label;
    modalTitle.textContent = label;
    modalImage.onerror = function onLightboxImageError() {
      if (typeof window.placeholderImg === 'function') {
        window.placeholderImg(this, label);
      }
    };
    showModal(modal);
  }

  function isCandidate(img) {
    if (!img || img.tagName !== 'IMG') return false;
    if (img.dataset.cdLightbox === 'off') return false;
    if (img.closest(SKIP_ANCESTOR)) return false;

    const src = img.getAttribute('src') || '';
    if (SKIP_SRC.test(src)) return false;

    if (img.classList.contains('showcase-image')) return true;
    if (img.classList.contains('feature-image')) return true;
    if (img.dataset.cdSlot || img.getAttribute('data-original-src')) return true;

    const normalized = src.replace(/^\//, '');
    if (/^images\//i.test(normalized)) return true;
    if (/\/images\//i.test(src)) return true;

    return false;
  }

  function bindImages(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('img').forEach((img) => {
      if (!isCandidate(img)) return;
      if (img.dataset.cdLightboxBound) return;
      img.dataset.cdLightboxBound = '1';
      img.addEventListener('click', (event) => {
        if (event.target.closest(EDITOR_CHROME)) return;
        openLightbox(img, img.alt || 'Image Preview');
      });
    });
  }

  function init() {
    ensureStyles();
    bindModalChrome();
    bindImages();
  }

  window.cdOpenMarketingLightbox = openLightbox;
  window.cdResolveMarketingImageSrc = resolveModalSrc;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('load', () => bindImages());

  if (window.__cdMarketingImagesPromise) {
    window.__cdMarketingImagesPromise.then(() => {
      setTimeout(() => bindImages(), 0);
    });
  }
})();
