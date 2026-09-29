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

  function waitForGrecaptcha(timeoutMs) {
    timeoutMs = timeoutMs || 15000;
    return new Promise(function (resolve) {
      var start = Date.now();
      function tick() {
        if (window.grecaptcha && typeof window.grecaptcha.render === 'function') {
          resolve(window.grecaptcha);
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          resolve(null);
          return;
        }
        window.setTimeout(tick, 50);
      }
      tick();
    });
  }

  function loadScript() {
    return new Promise(function (resolve, reject) {
      function finish(gr) {
        if (!gr || typeof gr.render !== 'function') {
          reject(new Error('grecaptcha failed to load'));
          return;
        }
        if (typeof gr.ready === 'function') {
          gr.ready(function () {
            resolve(gr);
          });
          return;
        }
        resolve(gr);
      }

      if (window.grecaptcha && typeof window.grecaptcha.render === 'function') {
        finish(window.grecaptcha);
        return;
      }

      var existing = document.querySelector('script[data-cd-recaptcha], script[src*="google.com/recaptcha/api.js"]');
      if (existing) {
        waitForGrecaptcha().then(function (gr) {
          if (gr) finish(gr);
          else reject(new Error('grecaptcha API not ready'));
        });
        return;
      }

      var script = document.createElement('script');
      script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.setAttribute('data-cd-recaptcha', '1');
      script.onload = function () {
        waitForGrecaptcha().then(function (gr) {
          if (gr) finish(gr);
          else reject(new Error('grecaptcha API not ready'));
        });
      };
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
    container.style.display = 'flex';
    container.innerHTML = '';

    const mount = document.createElement('div');
    container.appendChild(mount);

    var attempts = 0;
    while (attempts < 40) {
      try {
        widgetId = window.grecaptcha.render(mount, { sitekey: cfg.siteKey });
        if (widgetId != null) return true;
      } catch (e) {
        if (attempts === 39) throw e;
      }
      attempts += 1;
      await new Promise(function (r) {
        window.setTimeout(r, 150);
      });
    }
    return false;
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
