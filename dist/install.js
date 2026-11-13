(() => {
  let pendingPrompt;
  let installed = false;
  let installing = false;
  let updateButton = () => {};

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    pendingPrompt = event;
    updateButton();
  });

  window.addEventListener('appinstalled', () => {
    installed = true;
    pendingPrompt = undefined;
    updateButton();
  });

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('installApp');
    const hint = document.getElementById('installHint');
    const dialog = document.getElementById('installHelp');
    const standalone = matchMedia('(display-mode: standalone)');
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/i.test(ua) ||
      (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    const platform = ios ? 'ios' : /Android/i.test(ua) ? 'android' :
      /Windows/i.test(ua) ? 'windows' : /Macintosh/i.test(ua) ? 'mac' : '';
    const nativeOnly = platform === 'android' || platform === 'windows';

    updateButton = () => {
      button.hidden = installed || standalone.matches || navigator.standalone === true;
      button.disabled = installing || (nativeOnly && !pendingPrompt);
      hint.hidden = button.hidden || !nativeOnly || Boolean(pendingPrompt) || installing;
    };

    standalone.addEventListener?.('change', updateButton);
    updateButton();

    button.addEventListener('click', async () => {
      if (button.hidden || button.disabled) return;
      if (!pendingPrompt) {
        dialog.querySelectorAll('[data-install-platform]').forEach(item => {
          item.hidden = Boolean(platform) && item.dataset.installPlatform !== platform;
        });
        dialog.showModal();
        return;
      }

      const prompt = pendingPrompt;
      pendingPrompt = undefined;
      installing = true;
      updateButton();
      try {
        const result = await prompt.prompt();
        const choice = result ?? await prompt.userChoice;
        if (choice?.outcome === 'accepted') installed = true;
      } catch {
        hint.textContent = 'O navegador não abriu a instalação. Recarregue para tentar de novo.';
      } finally {
        installing = false;
        updateButton();
      }
    });
  }, {once:true});
})();
