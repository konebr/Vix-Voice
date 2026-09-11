(() => {
  const history = [];
  const root = document.createElement('div');
  root.id = 'vix-toast-region';
  root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-atomic', 'false');
  document.body.append(root);

  const loader = document.createElement('div'); loader.id = 'vix-global-loader'; loader.hidden = true; document.body.append(loader);
  let requests = 0;
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (...args) => {
    requests++; loader.hidden = false;
    try { return await nativeFetch(...args); }
    finally { requests = Math.max(0, requests - 1); if (!requests) loader.hidden = true; }
  };

  function toast(message, type = 'info', title = '') {
    const item = { message: String(message || ''), type, title: title || (type === 'error' ? 'Algo deu errado' : type === 'success' ? 'Concluído' : 'Vix Voice'), time: Date.now() };
    history.unshift(item); history.splice(40);
    const node = document.createElement('article'); node.className = `vix-toast is-${type}`; node.innerHTML = `<span class="vix-toast-mark"></span><div><strong></strong><p></p></div><button aria-label="Fechar notificação">×</button>`;
    node.querySelector('strong').textContent = item.title; node.querySelector('p').textContent = item.message; node.querySelector('button').onclick = () => node.remove(); root.append(node);
    requestAnimationFrame(() => node.classList.add('is-visible')); setTimeout(() => { node.classList.remove('is-visible'); setTimeout(() => node.remove(), 220); }, type === 'error' ? 7000 : 4200);
    return item;
  }

  function dialog({ title = 'Vix Voice', message = '', value, placeholder = '', confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false, input = false }) {
    return new Promise(resolve => {
      const overlay = document.createElement('div'); overlay.className = 'vix-dialog-overlay'; overlay.innerHTML = `<section class="vix-dialog" role="dialog" aria-modal="true" aria-labelledby="vix-dialog-title"><span class="vix-dialog-kicker">VIX VOICE</span><h2 id="vix-dialog-title"></h2><p></p><label hidden><span>Informação</span><input maxlength="160"></label><div class="vix-dialog-actions"><button class="vix-dialog-cancel"></button><button class="vix-dialog-confirm"></button></div></section>`;
      overlay.querySelector('h2').textContent = title; overlay.querySelector('p').textContent = message;
      const label = overlay.querySelector('label'), field = overlay.querySelector('input'), cancel = overlay.querySelector('.vix-dialog-cancel'), confirm = overlay.querySelector('.vix-dialog-confirm');
      label.hidden = !input; field.value = value || ''; field.placeholder = placeholder; cancel.textContent = cancelText; confirm.textContent = confirmText; confirm.classList.toggle('is-danger', danger);
      const close = result => { overlay.classList.remove('is-visible'); setTimeout(() => overlay.remove(), 180); resolve(result); };
      cancel.onclick = () => close(input ? null : false); confirm.onclick = () => close(input ? field.value : true); overlay.onclick = event => { if (event.target === overlay) close(input ? null : false); };
      overlay.onkeydown = event => { if (event.key === 'Escape') { event.preventDefault(); close(input ? null : false); } if (event.key === 'Enter' && (input || event.target === confirm)) { event.preventDefault(); confirm.click(); } };
      document.body.append(overlay); requestAnimationFrame(() => overlay.classList.add('is-visible')); (input ? field : confirm).focus(); if (input) field.select();
    });
  }

  globalThis.vixToast = toast;
  globalThis.vixAlert = (message, options = {}) => { toast(message, options.type || 'error', options.title); return Promise.resolve(); };
  globalThis.vixConfirm = (message, options = {}) => dialog({ title: options.title || 'Confirmar ação', message, confirmText: options.confirmText || 'Confirmar', danger: options.danger !== false });
  globalThis.vixPrompt = (message, value = '', options = {}) => dialog({ title: options.title || 'Informe os dados', message, value, placeholder: options.placeholder || '', confirmText: options.confirmText || 'Continuar', input: true });
  globalThis.alert = message => toast(message, 'error');

  const themeKey = 'vix-interface-theme';
  function applyTheme(theme) { document.documentElement.dataset.theme = ['dark', 'midnight', 'light'].includes(theme) ? theme : 'dark'; localStorage.setItem(themeKey, document.documentElement.dataset.theme); }
  globalThis.vixApplyTheme = applyTheme; applyTheme(localStorage.getItem(themeKey) || 'dark');

  const bell = document.querySelector('.header-actions [title="Notificações"]');
  if (bell) {
    bell.tabIndex = 0; bell.setAttribute('role', 'button'); bell.setAttribute('aria-label', 'Abrir central de notificações');
    const openCenter = () => {
      document.querySelector('.vix-notification-center')?.remove(); const panel = document.createElement('aside'); panel.className = 'vix-notification-center'; panel.innerHTML = '<header><div><small>CENTRAL</small><strong>Notificações</strong></div><button aria-label="Fechar">×</button></header><div class="vix-notification-list"></div>';
      const list = panel.querySelector('.vix-notification-list'); if (!history.length) list.innerHTML = '<div class="vix-empty-state"><span>✓</span><strong>Tudo em dia</strong><p>Novas notificações aparecerão aqui.</p></div>';
      for (const item of history) { const row = document.createElement('article'); row.innerHTML = `<span class="vix-toast-mark"></span><div><strong></strong><p></p><small></small></div>`; row.className = `is-${item.type}`; row.querySelector('strong').textContent = item.title; row.querySelector('p').textContent = item.message; row.querySelector('small').textContent = new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); list.append(row); }
      panel.querySelector('button').onclick = () => panel.remove(); document.body.append(panel); requestAnimationFrame(() => panel.classList.add('is-visible'));
    };
    bell.onclick = openCenter; bell.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openCenter(); } };
  }

  addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); const target = document.querySelector('#settings-search:not([hidden]), #message'); target?.focus(); }
    if (event.key === 'Escape') document.querySelector('.vix-notification-center')?.remove();
  });
  addEventListener('unhandledrejection', event => { if (event.reason?.message) toast(event.reason.message, 'error'); });
})();
