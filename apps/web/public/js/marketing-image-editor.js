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
  const DEFAULT_HERO_HEIGHT = 220;
  const DEFAULT_SHOWCASE_MAX = 680;
  const DEFAULT_PARTS_SHOWCASE_MAX = 400;

  let displayMap = {};
  let adjustPanel = null;
  let adjustTargetImg = null;
  let adjustActiveBtn = null;

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
    const reservedSlot =
      normalizeSlot(img.dataset.cdSlot || '') ||
      normalizeSlot(img.getAttribute('data-original-src') || '');
    if (reservedSlot) return true;
    const src = img.getAttribute('src') || '';
    if (!src || SKIP_SRC.test(src)) return false;
    return Boolean(normalizeSlot(src));
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
      .cd-mkt-img-frame {
        position: relative;
        width: 100%;
        display: block;
        padding: 4px 6px 0;
        overflow: hidden;
      }
      .cd-mkt-host:not(.cd-mkt-img-frame) {
        padding: 4px 6px 0;
        overflow: hidden;
      }
      .interface-image.cd-mkt-host,
      .parts-showcase-image.cd-mkt-host {
        overflow: hidden;
      }
      .parts-showcase-image.cd-mkt-host {
        padding: 0;
      }
      .interface-image.cd-mkt-host {
        padding: 4px 6px 0;
      }
      #cd-mkt-global-adjust-panel {
        display: none;
        position: fixed;
        left: 50%;
        bottom: 20px;
        transform: translateX(-50%);
        width: min(440px, calc(100vw - 32px));
        max-height: min(72vh, 560px);
        overflow-y: auto;
        z-index: 10001;
        background: rgba(15,23,42,.96);
        color: #fff;
        border-radius: 14px;
        padding: 14px 16px 16px;
        box-shadow: 0 20px 50px rgba(0,0,0,.45);
        font: 500 11px/1.3 Inter, system-ui, sans-serif;
      }
      #cd-mkt-global-adjust-panel.open {
        display: block;
      }
      #cd-mkt-global-adjust-panel .cd-mkt-adjust-target {
        font: 600 12px/1.3 Inter, system-ui, sans-serif;
        margin: 0 0 10px;
        color: rgba(255,255,255,.88);
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
      .cd-mkt-adjust-btn {
        position: absolute;
        top: 10px;
        left: 10px;
        z-index: 5;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 11px;
        border: 0;
        border-radius: 999px;
        cursor: pointer;
        background: rgba(99,102,241,.92);
        color: #fff;
        font: 600 12px/1 Inter, system-ui, sans-serif;
        box-shadow: 0 8px 20px rgba(99,102,241,.28);
        opacity: 0;
        transition: opacity .18s ease, transform .18s ease;
      }
      .cd-mkt-host:hover > .cd-mkt-adjust-btn,
      .cd-mkt-adjust-btn:focus {
        opacity: 1;
        transform: translateY(-1px);
      }
      .cd-mkt-adjust-btn.is-active {
        opacity: 1;
        transform: translateY(-1px);
      }
      .cd-mkt-adjust-panel {
        display: none;
      }
      .cd-mkt-adjust-panel label {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }
      .cd-mkt-adjust-panel input[type="range"] { flex: 1; min-width: 0; }
      .cd-mkt-adjust-panel select {
        width: 100%;
        margin-bottom: 8px;
        border-radius: 8px;
        border: 0;
        padding: 6px 8px;
        font: inherit;
      }
      .cd-mkt-adjust-actions {
        display: flex;
        gap: 6px;
        margin-top: 4px;
      }
      .cd-mkt-adjust-actions button {
        flex: 1;
        border: 0;
        border-radius: 8px;
        padding: 7px 8px;
        cursor: pointer;
        font: 600 11px/1 Inter, system-ui, sans-serif;
      }
      .cd-mkt-adjust-save { background: #10b981; color: #fff; }
      .cd-mkt-adjust-reset { background: rgba(255,255,255,.15); color: #fff; }
      .cd-mkt-adjust-close { background: rgba(255,255,255,.08); color: #fff; }
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

  function slotForImage(img) {
    return (
      img.dataset.cdSlot ||
      normalizeSlot(img.getAttribute('data-original-src') || '') ||
      normalizeSlot(img.getAttribute('src') || '')
    );
  }

  function legacyFlatSlot(slot) {
    const hero = slot && slot.match(/^images\/auto-system\/hero\/(.+)$/);
    if (hero) return `images/auto-system/${hero[1]}`;
    const mod = slot && slot.match(/^images\/auto-system\/modules\/(.+)$/);
    if (mod) return `images/auto-system/${mod[1]}`;
    return null;
  }

  function lookupOverride(slot, overrides) {
    if (!slot || !overrides) return undefined;
    if (overrides[slot]) return overrides[slot];
    const legacy = legacyFlatSlot(slot);
    return legacy ? overrides[legacy] : undefined;
  }

  function imageContext(img) {
    const isHero = Boolean(img.closest('.hero-image-card'));
    const isPartsGrid = Boolean(img.closest('.parts-showcase-image'));
    const isShowcase = img.classList.contains('showcase-image');
    const isModuleShowcase = isShowcase && Boolean(img.closest('.interface-image'));
    return { isHero, isPartsGrid, isModuleShowcase, isShowcase };
  }

  function buttonHostForImage(img) {
    if (!img.parentElement || img.closest(SKIP_ANCESTOR)) return null;

    const partsFrame = img.closest('.parts-showcase-image');
    if (partsFrame) {
      partsFrame.classList.add('cd-mkt-host');
      if (window.getComputedStyle(partsFrame).position === 'static') {
        partsFrame.style.position = 'relative';
      }
      return partsFrame;
    }

    const moduleFrame = img.closest('.interface-image');
    if (moduleFrame) {
      moduleFrame.classList.add('cd-mkt-host');
      if (window.getComputedStyle(moduleFrame).position === 'static') {
        moduleFrame.style.position = 'relative';
      }
      return moduleFrame;
    }

    const host = ensureImageFrame(img);
    if (!host) return null;
    host.classList.add('cd-mkt-host');
    if (window.getComputedStyle(host).position === 'static') {
      host.style.position = 'relative';
    }
    return host;
  }

  function removeLegacyAdjustPanels() {
    document.querySelectorAll('.cd-mkt-adjust-panel').forEach((panel) => {
      if (panel.id !== 'cd-mkt-global-adjust-panel') panel.remove();
    });
  }

  function showcaseHeightLimits(img) {
    const { isPartsGrid } = imageContext(img);
    if (isPartsGrid) {
      return { min: 200, max: 560, defaultValue: DEFAULT_PARTS_SHOWCASE_MAX };
    }
    return { min: 240, max: 920, defaultValue: DEFAULT_SHOWCASE_MAX };
  }

  function defaultDisplayForImage(img) {
    const { isHero, isPartsGrid, isShowcase } = imageContext(img);
    const heightLimits = showcaseHeightLimits(img);
    return {
      objectFit: isHero || isPartsGrid ? 'cover' : 'contain',
      posX: 50,
      posY: isHero ? 12 : isPartsGrid ? 0 : 50,
      heroHeight: isHero ? DEFAULT_HERO_HEIGHT : undefined,
      showcaseMaxHeight: isShowcase ? heightLimits.defaultValue : undefined,
      scale: 1,
    };
  }

  function mergeDisplay(img, saved) {
    const base = defaultDisplayForImage(img);
    if (!saved) return base;
    const { isPartsGrid } = imageContext(img);
    const limits = showcaseHeightLimits(img);
    const merged = {
      objectFit: saved.objectFit || base.objectFit,
      posX: saved.posX ?? base.posX,
      posY: saved.posY ?? base.posY,
      heroHeight: saved.heroHeight ?? base.heroHeight,
      showcaseMaxHeight: saved.showcaseMaxHeight ?? base.showcaseMaxHeight,
      scale: saved.scale ?? base.scale,
    };
    if (isPartsGrid) {
      if (merged.objectFit === 'contain') {
        merged.objectFit = 'cover';
        merged.posY = saved.posY ?? 0;
      }
      if (merged.showcaseMaxHeight > limits.max || merged.showcaseMaxHeight < limits.min) {
        merged.showcaseMaxHeight = limits.defaultValue;
      }
    }
    return merged;
  }

  function applyDisplayToImage(img, display) {
    if (!img || !display) return;
    const posX = display.posX ?? 50;
    const posY = display.posY ?? 50;
    const partsFrame = img.closest('.parts-showcase-image');
    const host = img.closest('.cd-mkt-img-frame, .cd-mkt-host, .interface-image, .parts-showcase-image');
    img.style.objectFit = display.objectFit || 'cover';
    img.style.objectPosition = `${posX}% ${posY}%`;
    if (host) {
      host.style.overflow = 'hidden';
    }
    if (img.closest('.hero-image-card') && display.heroHeight) {
      img.style.height = `${display.heroHeight}px`;
      img.style.width = '100%';
      if (host) host.style.height = `${display.heroHeight}px`;
    } else if (host && img.closest('.hero-image-card')) {
      host.style.removeProperty('height');
      img.style.removeProperty('height');
    }
    if (partsFrame && img.classList.contains('showcase-image')) {
      const frameH = display.showcaseMaxHeight || DEFAULT_PARTS_SHOWCASE_MAX;
      partsFrame.style.width = '100%';
      partsFrame.style.height = `${frameH}px`;
      partsFrame.style.maxHeight = `${frameH}px`;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.maxWidth = 'none';
      img.style.maxHeight = 'none';
      const innerFrame = img.closest('.cd-mkt-img-frame');
      if (innerFrame && innerFrame !== partsFrame) {
        innerFrame.style.width = '100%';
        innerFrame.style.height = '100%';
        innerFrame.style.maxHeight = 'none';
      }
    } else if (img.classList.contains('showcase-image') && display.showcaseMaxHeight) {
      const frameH = display.showcaseMaxHeight;
      img.style.width = '100%';
      img.style.maxWidth = '720px';
      img.style.height = `${frameH}px`;
      img.style.maxHeight = 'none';
      const moduleFrame = img.closest('.interface-image');
      const frameHost = moduleFrame || (host && !partsFrame ? host : null);
      if (frameHost && frameHost !== partsFrame) {
        frameHost.style.height = `${frameH}px`;
        frameHost.style.maxHeight = `${frameH}px`;
        frameHost.style.width = '100%';
      }
    } else if (host && img.classList.contains('showcase-image')) {
      host.style.removeProperty('height');
      host.style.removeProperty('max-height');
      img.style.removeProperty('height');
      img.style.removeProperty('max-height');
    }
    const scale = display.scale || 1;
    if (scale !== 1) {
      img.style.transform = `scale(${scale})`;
      img.style.transformOrigin = `${posX}% ${posY}%`;
    } else {
      img.style.removeProperty('transform');
      img.style.removeProperty('transform-origin');
    }
  }

  function applyAllDisplay() {
    candidateImages().forEach((img) => {
      const slot = slotForImage(img);
      if (!slot) return;
      applyDisplayToImage(img, mergeDisplay(img, displayMap[slot]));
    });
  }

  function imagesForSlot(slot) {
    return candidateImages().filter((img) => slotForImage(img) === slot);
  }

  async function saveDisplay(slot, display) {
    const res = await fetch('/api/marketing-images', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ slot, display }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Could not save display settings');
    }
    displayMap = data.displayMap || {};
    applyAllDisplay();
    return data;
  }

  function closeAdjustPanel() {
    if (adjustPanel) adjustPanel.classList.remove('open');
    if (adjustActiveBtn) {
      adjustActiveBtn.classList.remove('is-active');
      adjustActiveBtn = null;
    }
    adjustPanel = null;
    adjustTargetImg = null;
  }

  function ensureGlobalAdjustPanel() {
    let panel = document.getElementById('cd-mkt-global-adjust-panel');
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'cd-mkt-global-adjust-panel';
    panel.className = 'cd-mkt-adjust-panel';
    panel.innerHTML =
      '<p class="cd-mkt-adjust-target" id="cdMktAdjustTarget">Adjust image</p>' +
      '<label>Fit <select data-field="objectFit"><option value="cover">Cover</option><option value="contain">Contain</option></select></label>' +
      '<label class="cd-mkt-adjust-hero">Height <span data-val="heroHeight"></span><input type="range" data-field="heroHeight" min="140" max="360" step="4"></label>' +
      '<label class="cd-mkt-adjust-showcase">Display height <span data-val="showcaseMaxHeight"></span><input type="range" data-field="showcaseMaxHeight" min="240" max="920" step="8" title="Frame height on the page — use Zoom to crop inside the frame"></label>' +
      '<label class="cd-mkt-adjust-zoom">Zoom <span data-val="scale"></span><input type="range" data-field="scale" min="1" max="1.6" step="0.02" title="Zoom inside the frame (does not overlap text)"></label>' +
      '<label>Horizontal <span data-val="posX"></span><input type="range" data-field="posX" min="0" max="100" step="1"></label>' +
      '<label>Vertical <span data-val="posY"></span><input type="range" data-field="posY" min="0" max="100" step="1"></label>' +
      '<div class="cd-mkt-adjust-actions">' +
      '<button type="button" class="cd-mkt-adjust-save">Save</button>' +
      '<button type="button" class="cd-mkt-adjust-reset">Reset</button>' +
      '<button type="button" class="cd-mkt-adjust-close">Close</button>' +
      '</div>';
    document.body.appendChild(panel);

    panel.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    panel.querySelector('.cd-mkt-adjust-close').addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeAdjustPanel();
      applyAllDisplay();
    });

    panel.querySelector('.cd-mkt-adjust-reset').onclick = async (event) => {
      event.stopPropagation();
      if (!adjustTargetImg) return;
      const slot = slotForImage(adjustTargetImg);
      if (!slot) return;
      const saveBtn = panel.querySelector('.cd-mkt-adjust-save');
      saveBtn.disabled = true;
      try {
        await saveDisplay(slot, null);
        closeAdjustPanel();
        toast('Display reset');
      } catch (err) {
        toast(err && err.message ? err.message : 'Reset failed', true);
        applyAllDisplay();
      } finally {
        saveBtn.disabled = false;
      }
    };

    panel.querySelector('.cd-mkt-adjust-save').onclick = async (event) => {
      event.stopPropagation();
      if (!adjustTargetImg) return;
      const slot = slotForImage(adjustTargetImg);
      if (!slot) return;
      const { isHero, isShowcase } = imageContext(adjustTargetImg);
      const saveBtn = panel.querySelector('.cd-mkt-adjust-save');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      try {
        const payload = {
          objectFit: panel.querySelector('[data-field="objectFit"]').value,
          scale: Number(panel.querySelector('[data-field="scale"]').value),
          posX: Number(panel.querySelector('[data-field="posX"]').value),
          posY: Number(panel.querySelector('[data-field="posY"]').value),
        };
        if (isHero) {
          payload.heroHeight = Number(panel.querySelector('[data-field="heroHeight"]').value);
        }
        if (isShowcase) {
          payload.showcaseMaxHeight = Number(panel.querySelector('[data-field="showcaseMaxHeight"]').value);
        }
        await saveDisplay(slot, payload);
        closeAdjustPanel();
        toast('Display saved');
      } catch (err) {
        toast(err && err.message ? err.message : 'Save failed', true);
        applyAllDisplay();
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    };

    return panel;
  }

  function updateAdjustPanelLabels(panel, values) {
    panel.querySelectorAll('[data-val]').forEach((el) => {
      const field = el.getAttribute('data-val');
      const val = values[field];
      if (field === 'scale') el.textContent = `${Number(val || 1).toFixed(2)}×`;
      else if (field === 'heroHeight' || field === 'showcaseMaxHeight') el.textContent = `${Math.round(val || 0)}px`;
      else el.textContent = `${Math.round(val || 0)}%`;
    });
  }

  function openAdjustPanel(img, triggerBtn) {
    closeAdjustPanel();
    const panel = ensureGlobalAdjustPanel();
    const slot = slotForImage(img);
    if (!slot) return;
    adjustPanel = panel;
    adjustTargetImg = img;
    if (triggerBtn) {
      adjustActiveBtn = triggerBtn;
      adjustActiveBtn.classList.add('is-active');
    }

    const targetLabel = panel.querySelector('#cdMktAdjustTarget');
    if (targetLabel) {
      targetLabel.textContent = `Adjust: ${img.alt || slot.split('/').pop() || 'image'}`;
    }

    const { isHero, isPartsGrid, isShowcase } = imageContext(img);
    const heightLimits = showcaseHeightLimits(img);
    panel.querySelectorAll('.cd-mkt-adjust-hero').forEach((el) => {
      el.style.display = isHero ? '' : 'none';
    });
    panel.querySelectorAll('.cd-mkt-adjust-showcase').forEach((el) => {
      el.style.display = isShowcase ? '' : 'none';
    });
    panel.querySelectorAll('.cd-mkt-adjust-zoom').forEach((el) => {
      el.style.display = isHero || isShowcase ? '' : 'none';
    });

    const showcaseField = panel.querySelector('[data-field="showcaseMaxHeight"]');
    if (showcaseField) {
      showcaseField.min = String(heightLimits.min);
      showcaseField.max = String(heightLimits.max);
      showcaseField.title = isPartsGrid
        ? 'Grid tile height — use Zoom to crop inside the tile'
        : 'Frame height on the page — use Zoom to crop inside the frame';
    }

    const current = mergeDisplay(img, displayMap[slot]);
    panel.querySelectorAll('[data-field]').forEach((el) => {
      const field = el.getAttribute('data-field');
      if (field === 'objectFit') {
        el.value = current.objectFit || 'cover';
        return;
      }
      if (field in current && current[field] != null) {
        el.value = String(current[field]);
      }
    });
    updateAdjustPanelLabels(panel, current);

    panel.oninput = (event) => {
      if (!event.target.matches('[data-field]') || !adjustTargetImg) return;
      const activeSlot = slotForImage(adjustTargetImg);
      if (!activeSlot) return;
      const next = {
        objectFit: panel.querySelector('[data-field="objectFit"]').value,
        heroHeight: Number(panel.querySelector('[data-field="heroHeight"]').value),
        showcaseMaxHeight: Number(panel.querySelector('[data-field="showcaseMaxHeight"]').value),
        scale: Number(panel.querySelector('[data-field="scale"]').value),
        posX: Number(panel.querySelector('[data-field="posX"]').value),
        posY: Number(panel.querySelector('[data-field="posY"]').value),
      };
      imagesForSlot(activeSlot).forEach((target) => applyDisplayToImage(target, mergeDisplay(target, next)));
      updateAdjustPanelLabels(panel, next);
    };

    panel.classList.add('open');
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
      const next = lookupOverride(original, map);
      if (next && img.getAttribute('src') !== next) {
        img.setAttribute('src', next);
      }
    });
    applyAllDisplay();
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

  function isEditorChrome(el) {
    return (
      el &&
      (el.classList.contains('cd-mkt-edit-btn') ||
        el.classList.contains('cd-mkt-adjust-btn') ||
        el.classList.contains('cd-mkt-adjust-panel') ||
        (el.tagName === 'INPUT' && el.type === 'file' && el.hidden))
    );
  }

  /** Keep Edit/Adjust on the image only when siblings include text (hero cards, etc.). */
  function ensureImageFrame(img) {
    const parent = img.parentElement;
    if (!parent) return null;
    if (parent.classList.contains('cd-mkt-img-frame')) return parent;

    const contentSiblings = Array.from(parent.children).filter(
      (el) => el !== img && !isEditorChrome(el)
    );
    if (contentSiblings.length === 0) return parent;

    const frame = document.createElement('div');
    frame.className = 'cd-mkt-img-frame';
    parent.insertBefore(frame, img);
    frame.appendChild(img);
    return frame;
  }

  function hostForImage(img) {
    return buttonHostForImage(img);
  }

  function attachEditor(img) {
    if (!isEditableImage(img)) return;
    const host = buttonHostForImage(img);
    if (!host) return;

    if (!host.querySelector(':scope > .cd-mkt-edit-btn')) {
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
        closeAdjustPanel();
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

    if (!host.querySelector(':scope > .cd-mkt-adjust-btn')) {
      const adjustBtn = document.createElement('button');
      adjustBtn.type = 'button';
      adjustBtn.className = 'cd-mkt-adjust-btn';
      adjustBtn.title = 'Adjust image size and crop';
      adjustBtn.innerHTML = '<i class="fas fa-crop-alt" aria-hidden="true"></i><span>Adjust</span>';
      adjustBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openAdjustPanel(img, adjustBtn);
      });
      host.appendChild(adjustBtn);
    }
  }

  async function init() {
    ensureStyles();
    repairHeader();
    removeLegacyAdjustPanels();

    candidateImages().forEach((img) => {
      const slot =
        normalizeSlot(img.dataset.cdSlot || '') ||
        normalizeSlot(img.getAttribute('data-original-src') || '') ||
        normalizeSlot(img.getAttribute('src') || '');
      if (slot) {
        img.dataset.cdSlot = slot;
        img.setAttribute('data-original-src', slot);
      }
    });

    try {
      let data = window.__cdMarketingImagesData || null;
      if (!data && window.__cdMarketingImagesPromise) {
        data = await window.__cdMarketingImagesPromise;
      }
      if (!data) {
        const overrideRes = await fetch('/api/marketing-images', { credentials: 'same-origin' });
        if (overrideRes.ok) data = await overrideRes.json();
      }
      if (data && data.overrides && !window.__cdMarketingImagesApplied) {
        applyOverrides(data.overrides);
      }
      if (data && data.display) {
        displayMap = data.display;
        applyAllDisplay();
      }
    } catch {
      /* static preview or API unavailable — page still works */
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
