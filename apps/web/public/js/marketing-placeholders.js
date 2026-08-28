/** Must load before page images so inline onerror handlers work. */
(function () {
  function placeholderImg(img, label) {
    if (!img) return;
    const slot =
      img.dataset.cdSlot ||
      img.getAttribute('data-original-src') ||
      'images/auto-system/' + String(label || img.alt || 'Screenshot').toLowerCase().replace(/ /g, '-') + '.png';
    const text = encodeURIComponent((label || img.alt || 'Screenshot') + ' — add screenshot');
    const pathHint = encodeURIComponent(slot);
    img.src =
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='240'%3E%3Crect fill='%23e2e8f0' width='400' height='240'/%3E%3Ctext fill='%2364748b' font-family='Inter,sans-serif' font-size='14' x='50%25' y='45%25' text-anchor='middle' dominant-baseline='middle'%3E" +
      text +
      "%3C/text%3E%3Ctext fill='%2394a3b8' font-family='Inter,sans-serif' font-size='11' x='50%25' y='58%25' text-anchor='middle'%3E" +
      pathHint +
      '%3C/text%3E%3C/svg%3E';
    img.onerror = null;
  }

  function repairBrokenMarketingImages() {
    document.querySelectorAll('img[data-cd-slot], img[data-original-src]').forEach(function (img) {
      if (img.closest('.header, header, .nav, nav, .logo')) return;
      const src = img.getAttribute('src') || '';
      if (/^data:image\/svg/i.test(src)) return;
      if (!img.complete || img.naturalWidth === 0) {
        placeholderImg(img, img.alt || 'Screenshot');
      }
    });
  }

  window.placeholderImg = placeholderImg;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', repairBrokenMarketingImages);
  } else {
    repairBrokenMarketingImages();
  }
})();
