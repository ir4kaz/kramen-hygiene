// Espace Admin : appareils et employés. Réservé à la responsable.
import { db, firebaseConfig, LOGIN_DOMAIN } from '../firebase.js';
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js';
import {
  getAuth, createUserWithEmailAndPassword, signOut, inMemoryPersistence, setPersistence,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';
import {
  collection, onSnapshot, doc, addDoc, updateDoc, setDoc, deleteDoc, serverTimestamp,
  query, where, limit, getDocs,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import {
  esc, slug, toast, rangeLabel, TYPES, TYPE_ORDER,
} from '../util.js';

const num = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(',', '.').replace('−', '-'));
  return Number.isFinite(n) ? n : null;
};

// Deuxième connexion Firebase « en mémoire » : permet de créer un compte employé
// sans déconnecter la responsable.
async function secondaryAuth() {
  const existing = getApps().find((a) => a.name === 'creation-comptes');
  const sec = existing || initializeApp(firebaseConfig, 'creation-comptes');
  const a = getAuth(sec);
  await setPersistence(a, inMemoryPersistence);
  return a;
}

export function renderAdmin(view, { sub, session }) {
  const tab = sub === 'employes' ? 'employes' : 'appareils';
  let appareils = [];
  let users = [];
  let editing = null;

  function tabs() {
    return `<div class="tabs" role="tablist">
      <a href="#/admin/appareils" class="${tab === 'appareils' ? 'on' : ''}">Appareils</a>
      <a href="#/admin/employes" class="${tab === 'employes' ? 'on' : ''}">Employés</a>
    </div>`;
  }

  function appareilsHtml() {
    const e = appareils.find((a) => a.id === editing);
    const typeOpts = TYPE_ORDER.map((t) => `<option value="${t}" ${e?.type === t ? 'selected' : ''}>${TYPES[t].one}</option>`).join('');
    const list = [...appareils].sort((a, b) => (TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)) || ((a.ordre ?? 0) - (b.ordre ?? 0)));
    return `
    <form class="card pad stack" id="fa" style="gap:14px">
      <strong>${e ? `Modifier « ${esc(e.nom)} »` : 'Ajouter un appareil'}</strong>
      <div class="form-grid">
        <div class="field"><label for="an">Nom</label><input id="an" required value="${esc(e?.nom || '')}" placeholder="ex. Frigo à boissons"></div>
        <div class="field"><label for="at">Type</label><select id="at">${typeOpts}</select></div>
        <div class="field"><label for="amin">Min (°C)</label><input id="amin" inputmode="decimal" value="${esc(e?.min ?? '')}" placeholder="vide = pas de min"></div>
        <div class="field"><label for="amax">Max (°C)</label><input id="amax" inputmode="decimal" value="${esc(e?.max ?? '')}" placeholder="vide = pas de max"></div>
      </div>
      <div class="row" style="flex-wrap:wrap">
        <button class="btn primary" type="submit">${e ? 'Enregistrer' : 'Ajouter'}</button>
        ${e ? '<button class="btn" type="button" data-cancel>Annuler</button>' : ''}
      </div>
    </form>
    <div class="card tablewrap">
      <table class="table">
        <thead><tr><th>Appareil</th><th>Température attendue</th><th>État</th><th></th></tr></thead>
        <tbody>${list.map((a) => `<tr>
          <td><strong>${esc(a.nom)}</strong><br><span class="small muted">${esc(TYPES[a.type]?.one || '')}</span></td>
          <td>${esc(rangeLabel(a.min, a.max))}</td>
          <td>${a.actif === false ? '<span class="badge todo">Désactivé</span>' : '<span class="badge ok">Actif</span>'}</td>
          <td style="white-space:nowrap">
            <button class="btn small" type="button" data-edit="${esc(a.id)}">Modifier</button>
            <button class="btn small" type="button" data-toggle-app="${esc(a.id)}">${a.actif === false ? 'Réactiver' : 'Désactiver'}</button>
            <button class="btn small" type="button" data-del-app="${esc(a.id)}">Supprimer</button>
          </td></tr>`).join('')}</tbody>
      </table>
    </div>
    <p class="small muted" style="margin:0">« Supprimer » n’est possible que pour un appareil qui n’a encore aucun relevé (ex. ajouté par erreur). Un appareil avec des relevés se désactive : il disparaît de l’écran Températures mais son historique reste, pour les contrôles.</p>`;
  }

  function employesHtml() {
    const list = [...users].sort((a, b) => (a.prenom || '').localeCompare(b.prenom || ''));
    return `
    <form class="card pad stack" id="fe" style="gap:14px" novalidate>
      <strong>Ajouter un employé</strong>
      <div class="form-grid">
        <div class="field"><label for="ep">Prénom</label><input id="ep" required autocapitalize="words" placeholder="ex. Minh"></div>
        <div class="field"><label for="ec">Code (6 chiffres)</label><input id="ec" inputmode="numeric" maxlength="6" pattern="[0-9]*" required></div>
        <div class="field"><label for="er">Rôle</label><select id="er"><option value="employe">Employé</option><option value="admin">Responsable (accès Admin)</option></select></div>
      </div>
      <p class="small muted" style="margin:0">L’employé se connecte avec son prénom et ce code. Deux personnes avec le même prénom : ajoutez l’initiale du nom (ex. « Minh B »).</p>
      <p class="error hidden" id="eerr"></p>
      <div><button class="btn primary" type="submit" id="ego">Créer le compte</button></div>
    </form>
    <div class="card tablewrap">
      <table class="table">
        <thead><tr><th>Prénom</th><th>Rôle</th><th>État</th><th></th></tr></thead>
        <tbody>${list.map((u) => `<tr>
          <td><strong>${esc(u.prenom)}</strong>${u.id === session.user.uid ? ' <span class="small muted">(vous)</span>' : ''}</td>
          <td>${u.role === 'admin' ? 'Responsable' : 'Employé'}</td>
          <td>${u.actif === false ? '<span class="badge todo">Désactivé</span>' : '<span class="badge ok">Actif</span>'}</td>
          <td>${u.id === session.user.uid ? '' : `<button class="btn small" type="button" data-toggle-user="${esc(u.id)}">${u.actif === false ? 'Réactiver' : 'Désactiver'}</button>`}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
    <p class="small muted" style="margin:0">Un employé qui part : désactivez son compte. Ses anciens relevés restent dans l’historique.</p>`;
  }

  function draw() {
    view.innerHTML = `<h1 class="title">Admin</h1>${tabs()}${tab === 'appareils' ? appareilsHtml() : employesHtml()}`;
  }

  view.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.edit) { editing = b.dataset.edit; draw(); view.querySelector('#an')?.focus(); }
    else if (b.hasAttribute('data-cancel')) { editing = null; draw(); }
    else if (b.dataset.toggleApp) {
      const a = appareils.find((x) => x.id === b.dataset.toggleApp);
      updateDoc(doc(db, 'appareils', a.id), { actif: a.actif === false }).catch((e) => toast(e.message));
    } else if (b.dataset.delApp) {
      const a = appareils.find((x) => x.id === b.dataset.delApp);
      if (!a) return;
      b.disabled = true;
      try {
        const used = await getDocs(query(collection(db, 'releves'), where('appareilId', '==', a.id), limit(1)));
        if (!used.empty) {
          toast(`« ${a.nom} » a déjà des relevés : désactivez-le plutôt.`, 4500);
          b.disabled = false;
          return;
        }
        if (!window.confirm(`Supprimer définitivement « ${a.nom} » ?`)) { b.disabled = false; return; }
        await deleteDoc(doc(db, 'appareils', a.id));
        if (editing === a.id) editing = null;
        toast('Appareil supprimé.');
      } catch (e) {
        console.error(e);
        toast(`Suppression impossible : ${e.message}`, 4500);
        b.disabled = false;
      }
    } else if (b.dataset.toggleUser) {
      const u = users.find((x) => x.id === b.dataset.toggleUser);
      updateDoc(doc(db, 'users', u.id), { actif: u.actif === false }).catch((e) => toast(e.message));
    }
  });

  view.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    if (f.id === 'fa') {
      const data = {
        nom: f.an.value.trim(), type: f.at.value, min: num(f.amin.value), max: num(f.amax.value),
      };
      if (!data.nom) { toast('Donnez un nom à l’appareil.'); return; }
      if (data.min !== null && data.max !== null && data.min > data.max) { toast('Le min doit être plus petit que le max.'); return; }
      if (editing) {
        updateDoc(doc(db, 'appareils', editing), data).catch((e) => toast(e.message));
        toast('Appareil modifié.');
      } else {
        addDoc(collection(db, 'appareils'), { ...data, actif: true, ordre: appareils.length, createdAt: serverTimestamp() })
          .catch((e) => toast(e.message));
        toast('Appareil ajouté.');
      }
      editing = null;
      draw();
    }
    if (f.id === 'fe') {
      const err = f.querySelector('#eerr');
      const show = (m) => { err.textContent = m; err.classList.remove('hidden'); };
      err.classList.add('hidden');
      const prenom = f.ep.value.trim();
      const code = f.ec.value.trim();
      if (!slug(prenom)) return show('Entrez un prénom.');
      if (!/^\d{6}$/.test(code)) return show('Le code doit faire exactement 6 chiffres.');
      if (!navigator.onLine) return show('Il faut Internet pour créer un compte.');
      f.ego.disabled = true;
      try {
        const sec = await secondaryAuth();
        const cred = await createUserWithEmailAndPassword(sec, `${slug(prenom)}@${LOGIN_DOMAIN}`, code);
        await setDoc(doc(db, 'users', cred.user.uid), {
          prenom, role: f.er.value, actif: true, createdAt: serverTimestamp(), createdBy: session.user.uid,
        });
        await signOut(sec);
        toast(`Compte de ${prenom} créé.`);
        f.reset();
      } catch (e) {
        console.error(e);
        show(e?.code?.includes('email-already-in-use')
          ? 'Ce prénom existe déjà. Ajoutez l’initiale du nom (ex. « Minh B »).'
          : `Erreur : ${e.message}`);
      } finally { f.ego.disabled = false; }
    }
  });

  draw();
  const un1 = onSnapshot(collection(db, 'appareils'), (s) => { appareils = s.docs.map((d) => ({ id: d.id, ...d.data() })); if (tab === 'appareils' && !editing) draw(); });
  const un2 = onSnapshot(collection(db, 'users'), (s) => { users = s.docs.map((d) => ({ id: d.id, ...d.data() })); if (tab === 'employes') draw(); });
  return () => { un1(); un2(); };
}
