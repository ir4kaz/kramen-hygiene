// Point d'entrée : connexion, menu et navigation entre les écrans.
import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import { esc, icon, toast } from './util.js';
import { renderLogin } from './views/login.js';
import { renderHome } from './views/home.js';
import { renderTemperatures } from './views/temperatures.js';
import { renderAdmin } from './views/admin.js';
import { renderSoon } from './views/soon.js';

const app = document.getElementById('app');

// Profil de la personne connectée : { uid, prenom, role, actif }
export const session = { user: null };

const NAV = [
  { id: 'accueil', label: 'Accueil', icon: 'home' },
  { id: 'temperatures', label: 'Températures', icon: 'thermo' },
  { id: 'nettoyage', label: 'Nettoyage', icon: 'clean' },
  { id: 'reception', label: 'Réception', icon: 'truck' },
  { id: 'documents', label: 'Documents', icon: 'folder' },
  { id: 'historique', label: 'Historique', icon: 'history' },
  { id: 'admin', label: 'Admin', icon: 'admin', adminOnly: true },
];
// Sur téléphone, le menu du bas garde l'essentiel.
const BOTTOM = ['accueil', 'temperatures', 'historique', 'admin'];

const ROUTES = {
  accueil: renderHome,
  temperatures: renderTemperatures,
  admin: renderAdmin,
};

let cleanup = null; // désabonnement de l'écran précédent (écoutes temps réel)

function currentRoute() {
  const [id, ...rest] = (location.hash.replace(/^#\/?/, '') || 'accueil').split('/');
  return { id, sub: rest.join('/') };
}

function layout(active) {
  const isAdmin = session.user?.role === 'admin';
  const items = NAV.filter((n) => !n.adminOnly || isAdmin);
  const side = items.map((n) => `<a href="#/${n.id}" class="${n.id === active ? 'on' : ''}">${icon(n.icon, 22)}<span>${n.label}</span></a>`).join('');
  const bottom = items.filter((n) => BOTTOM.includes(n.id))
    .map((n) => `<a href="#/${n.id}" class="${n.id === active ? 'on' : ''}">${icon(n.icon, 22)}<span>${n.label}</span></a>`).join('');
  return `
  <div class="layout">
    <nav class="sidenav" aria-label="Menu">
      <div class="brandbox"><span class="brand">K-RAMEN</span><span class="muted small">Hygiène</span></div>
      ${side}
      <div class="who">
        <strong>${esc(session.user?.prenom)}</strong>
        <button class="btn small" id="logout2" type="button">${icon('logout', 18)} Se déconnecter</button>
      </div>
    </nav>
    <header class="topbar">
      <div class="brandbox"><span class="brand">K-RAMEN</span><span class="muted small">Hygiène</span></div>
      <button class="iconbtn" id="logout" type="button" aria-label="Se déconnecter">${icon('logout', 22)}</button>
    </header>
    <main class="content" id="view"></main>
    <nav class="bottomnav" aria-label="Menu">${bottom}</nav>
  </div>`;
}

async function route() {
  if (!session.user) return;
  if (cleanup) { try { cleanup(); } catch (e) { /* rien */ } cleanup = null; }
  const { id, sub } = currentRoute();
  const isAdmin = session.user.role === 'admin';
  const target = (id === 'admin' && !isAdmin) ? 'accueil' : id;
  app.innerHTML = layout(target);
  for (const b of app.querySelectorAll('#logout, #logout2')) {
    b.addEventListener('click', async () => { await signOut(auth); location.hash = ''; });
  }
  const view = document.getElementById('view');
  const render = ROUTES[target] || renderSoon;
  try {
    cleanup = (await render(view, { sub, session, id: target, nav: NAV })) || null;
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="alertbox"><span class="ic">${icon('alert')}</span><div>Un problème est survenu. Rechargez la page.<br><span class="small muted">${esc(err.message)}</span></div></div>`;
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);

onAuthStateChanged(auth, async (fbUser) => {
  if (cleanup) { try { cleanup(); } catch (e) { /* rien */ } cleanup = null; }
  if (!fbUser) {
    session.user = null;
    renderLogin(app);
    return;
  }
  try {
    const snap = await getDoc(doc(db, 'users', fbUser.uid));
    if (!snap.exists()) {
      // Compte en cours de création (première installation) : on attend.
      return;
    }
    const p = snap.data();
    if (p.actif === false) {
      await signOut(auth);
      toast('Ce compte est désactivé. Demandez à la responsable.', 4000);
      return;
    }
    session.user = { uid: fbUser.uid, ...p };
    route();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="auth"><div class="card"><strong>Impossible de charger le profil.</strong><span class="muted">${esc(err.message)}</span><button class="btn" onclick="location.reload()">Réessayer</button></div></div>`;
  }
});

// Appelé après la première installation, quand le profil admin vient d'être créé.
export async function reloadProfile() {
  const u = auth.currentUser;
  if (!u) return;
  const snap = await getDoc(doc(db, 'users', u.uid));
  if (snap.exists()) { session.user = { uid: u.uid, ...snap.data() }; location.hash = '#/accueil'; route(); }
}
