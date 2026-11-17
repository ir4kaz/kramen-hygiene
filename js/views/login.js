// Écran de connexion (prénom + code) et première installation.
import { auth, db, LOGIN_DOMAIN } from '../firebase.js';
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';
import {
  doc, getDoc, writeBatch, collection, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import { esc, slug, TYPES } from '../util.js';
import { reloadProfile } from '../app.js';

// Appareils de départ (notes de la patronne).
const SEED = [
  ...[1, 2, 3, 4].map((n) => ({ nom: `Réfrigérateur ${n}`, type: 'frigo' })),
  ...[1, 2].map((n) => ({ nom: `Congélateur ${n}`, type: 'congel' })),
  ...[1, 2, 3, 4].map((n) => ({ nom: `Saladette ${n}`, type: 'saladette' })),
  { nom: 'Chambre froide 1', type: 'chambre' },
];

const CODE_RE = /^\d{6}$/;

function authErrorMessage(err) {
  const c = err?.code || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'Prénom ou code incorrect.';
  if (c.includes('too-many-requests')) return 'Trop d’essais. Attendez quelques minutes.';
  if (c.includes('network')) return 'Pas de réseau. La première connexion demande Internet.';
  if (c.includes('email-already-in-use')) return 'Ce prénom est déjà utilisé.';
  return `Erreur : ${err?.message || c}`;
}

export async function renderLogin(app) {
  app.innerHTML = '<div class="splash"><span class="brand">K-RAMEN</span><span class="muted">Chargement…</span></div>';
  let setupDone = true;
  try {
    const s = await getDoc(doc(db, 'config', 'setup'));
    setupDone = s.exists();
  } catch (e) {
    // Hors ligne au tout premier lancement : on affiche la connexion normale.
  }
  if (!setupDone) return renderSetup(app);

  app.innerHTML = `
  <div class="auth">
    <form class="card" id="f" novalidate>
      <div class="stack" style="gap:2px"><span class="brand">K-RAMEN</span><span class="muted">Hygiène</span></div>
      <h1 class="title" style="font-size:24px">Connexion</h1>
      <div class="field"><label for="p">Prénom</label><input id="p" autocomplete="username" autocapitalize="words" required></div>
      <div class="field"><label for="c">Code (6 chiffres)</label><input id="c" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="current-password" required></div>
      <p class="error hidden" id="err"></p>
      <button class="btn primary block" type="submit" id="go">Se connecter</button>
      <p class="small muted" style="margin:0">Code oublié ? Demandez à la responsable.</p>
    </form>
  </div>`;
  const f = app.querySelector('#f');
  const err = app.querySelector('#err');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.classList.add('hidden');
    const prenom = f.p.value.trim();
    const code = f.c.value.trim();
    if (!prenom || !CODE_RE.test(code)) {
      err.textContent = 'Entrez votre prénom et votre code à 6 chiffres.';
      err.classList.remove('hidden');
      return;
    }
    f.go.disabled = true;
    try {
      await signInWithEmailAndPassword(auth, `${slug(prenom)}@${LOGIN_DOMAIN}`, code);
    } catch (ex) {
      err.textContent = authErrorMessage(ex);
      err.classList.remove('hidden');
      f.go.disabled = false;
    }
  });
}

function renderSetup(app) {
  app.innerHTML = `
  <div class="auth">
    <form class="card" id="f" novalidate>
      <div class="stack" style="gap:2px"><span class="brand">K-RAMEN</span><span class="muted">Hygiène</span></div>
      <h1 class="title" style="font-size:24px">Première installation</h1>
      <p class="muted" style="margin:0">Créez le compte de la responsable. Il pourra ensuite ajouter les employés.</p>
      <div class="field"><label for="p">Prénom de la responsable</label><input id="p" autocapitalize="words" required></div>
      <div class="field"><label for="c">Choisissez un code (6 chiffres)</label><input id="c" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password" required></div>
      <div class="field"><label for="c2">Retapez le code</label><input id="c2" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password" required></div>
      <p class="error hidden" id="err"></p>
      <button class="btn primary block" type="submit" id="go">Créer et commencer</button>
    </form>
  </div>`;
  const f = app.querySelector('#f');
  const err = app.querySelector('#err');
  const show = (m) => { err.textContent = m; err.classList.remove('hidden'); };
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.classList.add('hidden');
    const prenom = f.p.value.trim();
    const code = f.c.value.trim();
    if (!prenom || !slug(prenom)) return show('Entrez un prénom.');
    if (!CODE_RE.test(code)) return show('Le code doit faire exactement 6 chiffres.');
    if (code !== f.c2.value.trim()) return show('Les deux codes ne sont pas identiques.');
    f.go.disabled = true;
    try {
      const cred = await createUserWithEmailAndPassword(auth, `${slug(prenom)}@${LOGIN_DOMAIN}`, code);
      const uid = cred.user.uid;
      const b = writeBatch(db);
      b.set(doc(db, 'users', uid), { prenom, role: 'admin', actif: true, createdAt: serverTimestamp() });
      b.set(doc(db, 'config', 'setup'), { done: true, at: serverTimestamp(), by: uid });
      SEED.forEach((a, i) => {
        const t = TYPES[a.type];
        b.set(doc(collection(db, 'appareils')), {
          nom: a.nom, type: a.type, min: t.min, max: t.max, ordre: i, actif: true, createdAt: serverTimestamp(),
        });
      });
      await b.commit();
      await reloadProfile();
    } catch (ex) {
      console.error(ex);
      show(authErrorMessage(ex));
      f.go.disabled = false;
    }
  });
}

export { esc };
