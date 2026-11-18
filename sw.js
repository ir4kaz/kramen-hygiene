// Service worker : garde l'appli en cache pour qu'elle s'ouvre sans réseau.
// Changer VERSION à chaque mise à jour pour forcer le rafraîchissement.
const VERSION = 'v29';
const CACHE = `kramen-hygiene-${VERSION}`;
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/firebase.js', './js/util.js',
  './js/views/login.js', './js/views/home.js', './js/views/temperatures.js',
  './js/views/admin.js', './js/views/soon.js', './js/views/historique.js', './js/views/aide.js', './js/views/nettoyage.js', './js/views/reception.js', './js/views/documents.js', './js/views/dlc.js', './js/views/courses.js', './js/views/heures.js', './js/views/stock.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Les échanges avec Firebase ne passent pas par le cache.
  if (url.hostname.includes('googleapis.com') && !url.hostname.startsWith('fonts')) return;
  if (url.hostname.includes('firebaseapp.com')) return;

  // Fichiers de l'appli : réseau d'abord (pour avoir les mises à jour), cache si hors ligne.
  if (url.origin === location.origin) {
    e.respondWith(
      // cache: 'no-cache' : on redemande toujours au serveur s'il y a une nouvelle version.
      fetch(req, { cache: 'no-cache' }).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))),
    );
    return;
  }
  // SDK Firebase et polices : cache d'abord.
  if (url.hostname === 'www.gstatic.com' || url.hostname.startsWith('fonts.')) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    })));
  }
});
