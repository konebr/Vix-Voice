(() => {
  const desktop = window.vixDesktop;
  if (!desktop) return;
  document.documentElement.classList.add('vix-desktop');
  document.documentElement.dataset.desktopPlatform = desktop.platform || 'desktop';

  desktop.onAction(action => {
    if (action === 'toggle-mute') {
      const button = document.getElementById('mute');
      if (!button || button.disabled) return window.vixToast?.('Entre em uma sala de voz para usar o atalho.', 'info');
      button.click();
      window.vixToast?.(microphoneStream?.getAudioTracks?.()[0]?.enabled === false ? 'Microfone silenciado.' : 'Microfone ativado.', 'success');
      return;
    }
    if (action === 'toggle-deafen') {
      const button = [...document.querySelectorAll('#voice-state button')].find(item => item.getAttribute('aria-label') === 'Silenciar áudio recebido');
      if (!button) return window.vixToast?.('Entre em uma sala de voz para usar o atalho.', 'info');
      button.click();
      window.vixToast?.(deafened ? 'Áudio recebido silenciado.' : 'Áudio recebido ativado.', 'success');
    }
  });
})();
