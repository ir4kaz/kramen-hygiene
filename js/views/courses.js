// Courses : liste partagée de ce qu'il faut acheter ; on coche quand c'est acheté.
import { db } from '../firebase.js';
import {
  collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, deleteField,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import {
  esc, icon, toast, today, shortDate, dateFromKey, daysUntil,
} from '../util.js';

export function renderCourses(view, { session }) {
  let items = [];

  function draw() {
    const aAcheter = items.filter((x) => !x.achete).sort((a, b) => (a.ajouteLe || 0) - (b.ajouteLe || 0));
    // Les articles achetés restent visibles 3 jours, puis disparaissent de la liste.
    const achetes = items.filter((x) => x.achete && daysUntil(x.acheteLe || today()) >= -3)
      .sort((a, b) => (b.acheteAt || 0) - (a.acheteAt || 0));
    const focus = document.activeElement?.id === 'cn';
    view.innerHTML = `
      <div class="stack" style="gap:4px"><h1 class="title">Courses</h1>
        <span class="small muted">Ajoutez ce qui manque ; cochez quand c’est acheté.</span></div>
      <form id="cf" class="card pad row" style="gap:8px;flex-wrap:wrap;align-items:flex-end" novalidate>
        <div class="field" style="flex:3;min-width:180px"><label for="cn">Article</label><input id="cn" placeholder="ex. Sauce soja, gants, sacs poubelle" autocomplete="off"></div>
        <div class="field" style="flex:1;min-width:90px"><label for="cq">Quantité</label><input id="cq" placeholder="ex. 2 cartons"></div>
        <button type="submit" class="btn primary" style="flex:1;min-width:120px">Ajouter</button>
      </form>
      <section class="stack" style="gap:8px">
        <h2 style="font-size:15px">À acheter <span class="muted small">(${aAcheter.length})</span></h2>
        ${aAcheter.length ? `<div class="card list">${aAcheter.map((x) => `<div class="crow">
          <button type="button" class="checkbtn" data-buy="${esc(x.id)}" aria-pressed="false" aria-label="Marquer « ${esc(x.nom)} » comme acheté"></button>
          <div class="info"><span class="nm">${esc(x.nom)}${x.quantite ? ` <span class="muted" style="font-weight:500">· ${esc(x.quantite)}</span>` : ''}</span>
            <span class="small muted">Ajouté par ${esc(x.ajouteParNom || '')}</span></div>
          <button type="button" class="iconbtn" data-del="${esc(x.id)}" aria-label="Retirer « ${esc(x.nom)} » de la liste">✕</button>
        </div>`).join('')}</div>` : '<div class="card pad muted">Rien à acheter pour l’instant.</div>'}
      </section>
      ${achetes.length ? `<section class="stack" style="gap:8px">
        <h2 style="font-size:15px">Acheté récemment</h2>
        <div class="card list">${achetes.map((x) => `<div class="crow done">
          <button type="button" class="checkbtn" data-unbuy="${esc(x.id)}" aria-pressed="true" aria-label="Remettre « ${esc(x.nom)} » à acheter">${icon('check', 26)}</button>
          <div class="info"><span class="nm">${esc(x.nom)}${x.quantite ? ` · ${esc(x.quantite)}` : ''}</span>
            <span class="small" style="color:var(--ok)">Acheté par ${esc(x.achetePar || '')} le ${esc(shortDate(dateFromKey(x.acheteLe || today())))}</span></div>
        </div>`).join('')}</div>
      </section>` : ''}`;
    if (focus) view.querySelector('#cn')?.focus();
  }

  view.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const nom = f.cn.value.trim();
    if (!nom) { toast('Tapez un article.'); return; }
    addDoc(collection(db, 'courses'), {
      nom, quantite: f.cq.value.trim(), achete: false, ajouteLe: Date.now(), ajoutePar: session.user.uid,
      ajouteParNom: session.user.prenom, at: serverTimestamp(),
    }).catch((er) => toast(er.message));
    f.reset();
    f.cn.focus();
  });
  view.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.buy) {
      updateDoc(doc(db, 'courses', b.dataset.buy), { achete: true, achetePar: session.user.prenom, acheteLe: today(), acheteAt: Date.now() })
        .catch((er) => toast(er.message));
    } else if (b.dataset.unbuy) {
      updateDoc(doc(db, 'courses', b.dataset.unbuy), { achete: false, achetePar: deleteField(), acheteLe: deleteField(), acheteAt: deleteField() })
        .catch((er) => toast(er.message));
    } else if (b.dataset.del) {
      deleteDoc(doc(db, 'courses', b.dataset.del)).catch((er) => toast(er.message));
    }
  });
  let menage = false;
  const un = onSnapshot(collection(db, 'courses'), (s) => {
    items = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Ménage : les articles achetés il y a plus de 30 jours sont supprimés de la base.
    if (!menage) {
      menage = true;
      items.filter((x) => x.achete && x.acheteLe && daysUntil(x.acheteLe) < -30)
        .forEach((x) => deleteDoc(doc(db, 'courses', x.id)).catch(() => {}));
    }
    draw();
  });
  draw();
  return () => un();
}
