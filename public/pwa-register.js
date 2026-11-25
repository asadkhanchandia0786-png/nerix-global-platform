// Registers the service worker. Kept as its own file because the app's security policy does not allow inline scripts.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () { /* installing is optional; the site works without it */ });
  });
}
