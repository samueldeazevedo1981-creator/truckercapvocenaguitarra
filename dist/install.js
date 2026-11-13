(() => {
  let pendingPrompt;
  let installed = false;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    pendingPrompt = event;
  });

  window.addEventListener('appinstalled', () => {
    installed = true;
    pendingPrompt = undefined;
  });

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('installApp');
    const dialog = document.getElementById('installHelp');
    const steps = document.getElementById('installSteps');
    const status = document.getElementById('installStatus');
    const standalone = window.matchMedia('(display-mode: standalone)');
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/i.test(ua) ||
      (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    const platform = ios ? 'ios' : /Android/i.test(ua) ? 'android' :
      /Macintosh/i.test(ua) ? 'mac' : 'desktop';

    function showHelp(message, alreadyInstalled = false) {
      status.textContent = message;
      status.hidden = !message;
      steps.hidden = alreadyInstalled;
      steps.querySelectorAll('[data-install-platform]').forEach(item => {
        item.hidden = item.getAttribute('data-install-platform') !== platform;
      });
      document.getElementById('installBrowserTip').hidden = alreadyInstalled;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else {
        dialog.setAttribute('open', '');
        dialog.querySelector('button').focus();
      }
    }

    dialog.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      button.focus();
    });

    button.addEventListener('click', async () => {
      if (installed || standalone.matches || navigator.standalone === true) {
        showHelp('O app já está instalado neste navegador.', true);
        return;
      }
      if (!pendingPrompt) {
        showHelp('');
        return;
      }

      const prompt = pendingPrompt;
      pendingPrompt = undefined;
      button.disabled = true;
      try {
        const result = await prompt.prompt();
        const choice = result || await prompt.userChoice;
        if (choice && choice.outcome === 'accepted') installed = true;
      } catch {
        showHelp('Use o menu do navegador para instalar.');
      } finally {
        button.disabled = false;
      }
    });
  }, {once: true});
})();
