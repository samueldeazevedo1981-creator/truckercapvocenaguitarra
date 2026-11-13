(() => {
  let pendingPrompt;
  let installationConfirmed = false;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    pendingPrompt = event;
  });

  window.addEventListener('appinstalled', () => {
    installationConfirmed = true;
    pendingPrompt = undefined;
    const button = document.getElementById('installApp');
    const dialog = document.getElementById('installHelp');
    if (button) button.hidden = true;
    if (dialog?.open) dialog.close();
  });

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('installApp');
    const dialog = document.getElementById('installHelp');
    const standalone = matchMedia('(display-mode: standalone)');

    function updateVisibility() {
      button.hidden = installationConfirmed || standalone.matches || navigator.standalone === true;
    }

    function showInstructions() {
      const ua = navigator.userAgent;
      const appleMobile = /iPhone|iPad|iPod/i.test(ua) ||
        (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
      const platform = appleMobile ? 'ios' : /Android/i.test(ua) ? 'android' :
        /Macintosh/i.test(ua) ? 'mac' : /Windows/i.test(ua) ? 'windows' : '';
      dialog.querySelectorAll('[data-install-platform]').forEach(item => {
        item.hidden = Boolean(platform) && item.dataset.installPlatform !== platform;
      });
      if (!dialog.open) dialog.showModal();
    }

    standalone.addEventListener?.('change', updateVisibility);
    updateVisibility();

    button.addEventListener('click', async () => {
      if (button.hidden || button.disabled) return;
      const prompt = pendingPrompt;
      if (!prompt) {
        showInstructions();
        return;
      }

      pendingPrompt = undefined;
      button.disabled = true;
      try {
        const result = await prompt.prompt();
        if (result.outcome === 'accepted') {
          installationConfirmed = true;
          updateVisibility();
        }
      } catch {
        if (!installationConfirmed) showInstructions();
      } finally {
        button.disabled = false;
      }
    });
  }, {once: true});
})();
