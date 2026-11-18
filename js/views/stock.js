// Stock : ce qu'on a et combien il en reste (savon, serviettes, éponges, sirops, bières…).
// Un bouton envoie un article dans la liste de courses.
import { db } from '../firebase.js';
import {
  collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, increment,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import { esc, icon, toast } from '../util.js';

export const STOCK_CATS = {
  bar: 'Bar',
  cuisine: 'Cuisine',
  entretien: 'Entretien et hygiène',
  salle: 'Salle',
  autre: 'Autre',
};
const CAT_ORDER = ['bar', 'cuisine', 'entretien', 'salle', 'autre'];

// État d'un article : rupture (0), bas (≤ seuil), ok.
export function stockEtat(x) {
  const q = Number(x.quantite) || 0;
  if (q <= 0) return 'rupture';
  if (x.seuil !== null && x.seuil !== undefined && x.seuil !== '' && q <= Number(x.seuil)) return 'bas';
  return 'ok';
}

export function renderStock(view, { session }) {
  let items = [];
  let courses = [];
  let editing = null;
  let showForm = false;
  let filtre = '';

  const enCourses = (nom) => courses.some((c) => !c.achete && c.nom.trim().toLowerCase() === nom.trim().toLowerCase());

  function formHtml() {
    const e = items.find((x) => x.id === editing);
    return `<form id="sf" class="card pad stack" style="gap:12px" novalidate>
      <strong>${e ? `Modifier « ${esc(e.nom)} »` : 'Ajouter un article au stock'}</strong>
      <div class="form-grid">
        <div class="field"><label for="sn">Article</label><input id="sn" value="${esc(e?.nom || '')}" placeholder="ex. Sirop de citron"></div>
        <div class="field"><label for="sc">Catégorie</label><select id="sc">${CAT_ORDER.map((c) => `<option value="${c}" ${(e?.categorie || 'bar') === c ? 'selected' : ''}>${STOCK_CATS[c]}</option>`).join('')}</select></div>
        <div class="field"><label for="sq">Quantité</label><input id="sq" inputmode="numeric" value="${esc(e?.quantite ?? '')}" placeholder="ex. 6"></div>
        <div class="field"><label for="su">Unité (facultatif)</label><input id="su" value="${esc(e?.unite || '')}" placeholder="ex. bouteilles"></div>
        <div class="field"><label for="ss">Prévenir à partir de</label><input id="ss" inputmode="numeric" value="${esc(e?.seuil ?? '')}" placeholder="ex. 2"></div>
      </div>
      <span class="small muted">« Prévenir à partir de » : l’article passe en « Bientôt vide » quand il en reste ce nombre ou moins.</span>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button type="submit" class="btn primary">${e ? 'Enregistrer' : 'Ajouter'}</button>
        <button type="button" class="btn" data-cancel>Annuler</button>
        ${e ? '<button type="button" class="btn" data-del style="color:var(--alert)">Supprimer l’article</button>' : ''}
      </div>
    </form>`;
  }

  function rowHtml(x) {
    const etat = stockEtat(x);
    const badge = etat === 'rupture' ? '<span class="badge alert">Rupture</span>'
      : etat === 'bas' ? '<span class="badge warn">Bientôt vide</span>' : '';
    const dejaCourses = enCourses(x.nom);
    return `<div class="crow stockrow">
      <div class="info">
        <span class="row" style="gap:4px"><span class="nm">${esc(x.nom)}</span>
          <button type="button" class="iconbtn editmini" data-edit="${esc(x.id)}" aria-label="Modifier ${esc(x.nom)}">✎</button></span>
        ${badge}
        ${etat !== 'ok' || dejaCourses ? `<button type="button" class="linkbtn" data-tocourses="${esc(x.id)}" ${dejaCourses ? 'disabled' : ''}>${icon('cart', 16)} ${dejaCourses ? 'Déjà dans les courses' : 'Ajouter aux courses'}</button>` : ''}
      </div>
      <div class="qty">
        <button type="button" class="qbtn" data-dec="${esc(x.id)}" aria-label="Retirer 1 ${esc(x.nom)}" ${(Number(x.quantite) || 0) <= 0 ? 'disabled' : ''}>−</button>
        <span class="qval"><strong>${Number(x.quantite) || 0}</strong>${x.unite ? `<span class="small muted">${esc(x.unite)}</span>` : ''}</span>
        <button type="button" class="qbtn" data-inc="${esc(x.id)}" aria-label="Ajouter 1 ${esc(x.nom)}">+</button>
      </div>
    </div>`;
  }

  function draw() {
    const f = filtre.trim().toLowerCase();
    const list = items.filter((x) => !f || x.nom.toLowerCase().includes(f));
    const alertes = items.filter((x) => stockEtat(x) !== 'ok');
    const groups = CAT_ORDER.map((c) => {
      const g = list.filter((x) => (x.categorie || 'autre') === c).sort((a, b) => a.nom.localeCompare(b.nom));
      if (!g.length) return '';
      return `<section class="stack" style="gap:8px"><h2 style="font-size:15px">${STOCK_CATS[c]} <span class="muted small">(${g.length})</span></h2>
        <div class="card list">${g.map(rowHtml).join('')}</div></section>`;
    }).join('');
    const keepFocus = document.activeElement?.id === 'sq2';
    view.innerHTML = `
      <div class="row between" style="flex-wrap:wrap;gap:12px">
        <div class="stack" style="gap:4px"><h1 class="title">Stock</h1>
          <span class="small muted">Touchez − quand vous prenez un article, + quand il en arrive.</span></div>
        ${showForm ? '' : '<button type="button" class="btn primary" data-new>+ Ajouter un article</button>'}
      </div>
      ${showForm ? formHtml() : ''}
      ${alertes.length ? `<div class="warnbox"><strong>${alertes.length} article${alertes.length > 1 ? 's' : ''} en rupture ou bientôt vide${alertes.length > 1 ? 's' : ''}.</strong>
        <button type="button" class="linkbtn" data-allcourses>${icon('cart', 16)} Tout ajouter aux courses</button></div>` : ''}
      ${items.length > 8 ? `<input id="sq2" class="select-lg" type="search" placeholder="Rechercher un article" value="${esc(filtre)}" aria-label="Rechercher">` : ''}
      ${groups || (items.length ? '<div class="card pad muted">Aucun résultat.</div>' : '<div class="card pad muted">Le stock est vide. Ajoutez vos articles : savon, serviettes, éponges, sirops, bières…</div>')}`;
    if (keepFocus) { const q = view.querySelector('#sq2'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }

  function toCourses(x) {
    if (enCourses(x.nom)) return false;
    addDoc(collection(db, 'courses'), {
      nom: x.nom, quantite: '', achete: false, stockId: x.id, ajouteLe: Date.now(),
      ajoutePar: session.user.uid, ajouteParNom: session.user.prenom, at: serverTimestamp(),
    }).catch((er) => toast(er.message));
    courses = [...courses, { nom: x.nom, achete: false }];
    return true;
  }

  view.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const find = (id) => items.find((x) => x.id === id);
    if (b.dataset.inc || b.dataset.dec) {
      const id = b.dataset.inc || b.dataset.dec;
      const delta = b.dataset.inc ? 1 : -1;
      const x = find(id); if (!x) return;
      if (delta < 0 && (Number(x.quantite) || 0) <= 0) return;
      updateDoc(doc(db, 'stock', id), { quantite: increment(delta), modifiePar: session.user.prenom, modifieLe: Date.now() })
        .catch((er) => toast(er.message));
      x.quantite = (Number(x.quantite) || 0) + delta;
      if (x.quantite === 0) toast(`${x.nom} : rupture ! Pensez à l’ajouter aux courses.`, 4000);
      draw();
    } else if (b.dataset.tocourses) {
      const x = find(b.dataset.tocourses);
      if (x && toCourses(x)) { toast(`« ${x.nom} » ajouté aux courses.`); draw(); }
    } else if (b.hasAttribute('data-allcourses')) {
      const n = items.filter((x) => stockEtat(x) !== 'ok').filter(toCourses).length;
      toast(n ? `${n} article${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} aux courses.` : 'Tout est déjà dans les courses.');
      draw();
    } else if (b.hasAttribute('data-new')) { editing = null; showForm = true; draw(); view.querySelector('#sn')?.focus(); }
    else if (b.dataset.edit) { editing = b.dataset.edit; showForm = true; draw(); window.scrollTo(0, 0); }
    else if (b.hasAttribute('data-cancel')) { editing = null; showForm = false; draw(); }
    else if (b.hasAttribute('data-del')) {
      const x = find(editing);
      if (x && window.confirm(`Supprimer « ${x.nom} » du stock ?`)) {
        deleteDoc(doc(db, 'stock', x.id)).catch((er) => toast(er.message));
        editing = null; showForm = false; draw();
      }
    }
  });
  view.addEventListener('input', (e) => { if (e.target.id === 'sq2') { filtre = e.target.value; draw(); } });
  view.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const nom = f.sn.value.trim();
    if (!nom) { toast('Donnez un nom à l’article.'); return; }
    const q = parseInt(f.sq.value, 10);
    const s = f.ss.value.trim() === '' ? null : parseInt(f.ss.value, 10);
    const data = {
      nom, categorie: f.sc.value, quantite: Number.isFinite(q) && q >= 0 ? q : 0, unite: f.su.value.trim(),
      seuil: Number.isFinite(s) && s >= 0 ? s : null, modifiePar: session.user.prenom, modifieLe: Date.now(),
    };
    if (editing) updateDoc(doc(db, 'stock', editing), data).catch((er) => toast(er.message));
    else addDoc(collection(db, 'stock'), { ...data, createdAt: serverTimestamp() }).catch((er) => toast(er.message));
    toast(editing ? 'Article modifié.' : 'Article ajouté.');
    editing = null; showForm = false; draw();
  });

  const un1 = onSnapshot(collection(db, 'stock'), (s) => {
    items = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!showForm) draw();
  });
  const un2 = onSnapshot(collection(db, 'courses'), (s) => {
    courses = s.docs.map((d) => d.data());
    if (!showForm) draw();
  });
  draw();
  return () => { un1(); un2(); };
}
