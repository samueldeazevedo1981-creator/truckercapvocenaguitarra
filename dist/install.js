const installButton = document.getElementById('installApp');
const dialog = document.getElementById('installHelp');
const installed = matchMedia('(display-mode: standalone)');
let installPrompt;

function updateInstallButton() {
  installButton.hidden = installed.matches || navigator.standalone === true;
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
});
window.addEventListener('appinstalled', () => {
  installPrompt = undefined;
  installButton.hidden = true;
  if (dialog.open) dialog.close();
});
installed.addEventListener?.('change', updateInstallButton);
updateInstallButton();

installButton.addEventListener('click', async () => {
  if (!installPrompt) {
    dialog.showModal();
    return;
  }
  const prompt = installPrompt;
  installPrompt = undefined;
  installButton.disabled = true;
  try {
    await prompt.prompt();
    if ((await prompt.userChoice).outcome === 'accepted') installButton.hidden = true;
  } catch {
    dialog.showModal();
  } finally {
    installButton.disabled = false;
  }
});
