/**
 * Trinidad & Tobago phone input: fixed "1 (868)" prefix + local "000-0000" entry.
 * Auto-enhances input[type="tel"][name="phone"] on DOMContentLoaded.
 */
(function (global) {
  const PREFIX = '1 (868)';

  const STYLES = `
.cd-phone-input { display: flex; align-items: stretch; width: 100%; }
.cd-phone-prefix {
  display: flex; align-items: center; white-space: nowrap;
  padding: 0 12px; background: #f1f5f9; color: #475569; font-weight: 500;
  border: 2px solid #e2e8f0; border-right: none; border-radius: 12px 0 0 12px;
}
.cd-phone-input .cd-phone-local {
  flex: 1; min-width: 0; border-radius: 0 12px 12px 0 !important;
  border-left: none !important;
}
.cd-phone-input:focus-within .cd-phone-prefix,
.cd-phone-input:focus-within .cd-phone-local {
  border-color: #6366f1;
}
.cd-phone-input:focus-within .cd-phone-local {
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}
`;

  function injectStyles() {
    if (document.getElementById('cd-phone-input-styles')) return;
    const style = document.createElement('style');
    style.id = 'cd-phone-input-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  function formatLocal(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 7);
    if (digits.length <= 3) return digits;
    return digits.slice(0, 3) + '-' + digits.slice(3);
  }

  function parseToLocal(phone) {
    if (!phone) return '';
    let digits = String(phone).replace(/\D/g, '');
    if (digits.startsWith('1868') && digits.length >= 11) digits = digits.slice(4);
    else if (digits.startsWith('868') && digits.length >= 10) digits = digits.slice(3);
    else if (digits.startsWith('1') && digits.length >= 11) {
      digits = digits.slice(1);
      if (digits.startsWith('868')) digits = digits.slice(3);
    }
    return formatLocal(digits.slice(0, 7));
  }

  function buildFull(local) {
    const digits = String(local || '').replace(/\D/g, '').slice(0, 7);
    if (!digits) return '';
    return '+1-868-' + formatLocal(digits);
  }

  function syncHidden(localInput, hiddenInput) {
    hiddenInput.value = buildFull(localInput.value);
  }

  function enhanceInput(input) {
    if (input.dataset.cdPhoneEnhanced) return;
    input.dataset.cdPhoneEnhanced = '1';

    const parent = input.parentElement;
    const wrapper = document.createElement('div');
    wrapper.className = 'cd-phone-input';

    const prefix = document.createElement('span');
    prefix.className = 'cd-phone-prefix';
    prefix.textContent = PREFIX;
    prefix.setAttribute('aria-hidden', 'true');

    const localInput = document.createElement('input');
    localInput.type = 'tel';
    localInput.className = 'cd-phone-local' + (input.className ? ' ' + input.className : '');
    localInput.placeholder = '000-0000';
    localInput.inputMode = 'numeric';
    localInput.autocomplete = input.autocomplete || 'tel-national';
    localInput.maxLength = 8;
    if (input.id) localInput.id = input.id;
    if (input.required) localInput.required = true;
    if (input.disabled) localInput.disabled = true;
    localInput.value = parseToLocal(input.value);

    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'hidden';
    hiddenInput.name = input.name || 'phone';
    syncHidden(localInput, hiddenInput);

    localInput.addEventListener('input', function () {
      const formatted = formatLocal(localInput.value);
      if (localInput.value !== formatted) localInput.value = formatted;
      syncHidden(localInput, hiddenInput);
    });

    wrapper.appendChild(prefix);
    wrapper.appendChild(localInput);
    wrapper.appendChild(hiddenInput);

    if (parent) {
      parent.insertBefore(wrapper, input);
      parent.removeChild(input);
    }

    const form = wrapper.closest('form');
    if (form && !form.dataset.cdPhoneSubmitBound) {
      form.dataset.cdPhoneSubmitBound = '1';
      form.addEventListener('submit', function () {
        form.querySelectorAll('.cd-phone-input').forEach(function (group) {
          const local = group.querySelector('.cd-phone-local');
          const hidden = group.querySelector('input[type="hidden"][name="phone"]');
          if (local && hidden) syncHidden(local, hidden);
        });
      });
      form.addEventListener('reset', function () {
        form.querySelectorAll('.cd-phone-input').forEach(function (group) {
          const local = group.querySelector('.cd-phone-local');
          const hidden = group.querySelector('input[type="hidden"][name="phone"]');
          if (local) local.value = '';
          if (hidden) hidden.value = '';
        });
      });
    }
  }

  function init(root) {
    injectStyles();
    const scope = root || document;
    scope.querySelectorAll('input[type="tel"][name="phone"]:not([data-cd-phone-skip])').forEach(enhanceInput);
  }

  global.CDPhoneInput = { init: init, buildFull: buildFull, parseToLocal: parseToLocal };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(document); });
  } else {
    init(document);
  }
})(typeof window !== 'undefined' ? window : globalThis);
