window.CDPublicCaptcha = (function () {
  let config = null;
  let widgetId = null;

  async function loadConfig() {
    if (config) return config;
    const endpoints = ['/api/public/captcha-config', '/api/public/demo-security-stats'];
    for (const url of endpoints) {
      try {
        const res = await fetch(url);
        const data = await res.json();
        config = data.captchaConfig || { enabled: Boolean(data.enabled), siteKey: data.siteKey || null };
        return config;
      } catch (e) {
        console.warn('CAPTCHA config load failed for', url, e);
      }
    }
    config = { enabled: false, siteKey: null };
    return config;
  }

  function loadScript() {
    return new Promise(function (resolve, reject) {
      if (window.grecaptcha) {
        resolve(window.grecaptcha);
        return;
      }
      const existing = document.querySelector('script[data-cd-recaptcha]');
      if (existing) {
        existing.addEventListener('load', function () { resolve(window.grecaptcha); });
        existing.addEventListener('error', reject);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.setAttribute('data-cd-recaptcha', '1');
      script.onload = function () { resolve(window.grecaptcha); };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function render(container) {
    const cfg = await loadConfig();
    if (!cfg.enabled || !cfg.siteKey) {
      if (container) container.style.display = 'none';
      return false;
    }

    await loadScript();
    if (!container) return false;
    container.style.display = 'block';
    container.innerHTML = '';

    const mount = document.createElement('div');
    container.appendChild(mount);

    widgetId = window.grecaptcha.render(mount, {
      sitekey: cfg.siteKey,
    });
    return true;
  }

  function getToken() {
    if (!config || !config.enabled || widgetId == null || !window.grecaptcha) return '';
    return window.grecaptcha.getResponse(widgetId) || '';
  }

  function reset() {
    if (widgetId != null && window.grecaptcha) {
      window.grecaptcha.reset(widgetId);
    }
  }

  function requireToken() {
    if (!config || !config.enabled) return '';
    const token = getToken();
    if (!token) {
      throw new Error('CAPTCHA');
    }
    return token;
  }

  return {
    loadConfig: loadConfig,
    render: render,
    getToken: getToken,
    requireToken: requireToken,
    reset: reset,
  };
})();
