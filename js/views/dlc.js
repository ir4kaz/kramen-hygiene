// DLC : les produits à surveiller, côté Bar et côté Cuisine.
// Ce qui est au congélateur n'a pas de DLC. On ajoute un produit quand :
//   - on le sort du congélateur (décongélation),
//   - on le fait maison (sauce, bouillon…),
//   - on l'ouvre (bouteille, pot, paquet…).
// Les noms déjà utilisés sont proposés automatiquement (collection dlc_noms), avec leur durée.
import { db } from '../firebase.js';
import {
  collection, query, where, onSnapshot, doc, addDoc, setDoc, updateDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import {
  esc, icon, toast, today, shortDate, longDate, dateFromKey, addDaysKey, daysUntil, slug, ZONES, ZONE_ORDER,
} from '../util.js';

export const DLC_TYPES = {
  decongele: { label: 'Sorti du congélateur', court: 'Décongelé', jours: 3, aide: 'Ne jamais recongeler.' },
  maison: { label: 'Fait maison', court: 'Fait maison', jours: 3, aide: '' },
  ouvert: { label: 'Ouvert', court: 'Ouvert', jours: null, aide: 'Regardez l’étiquette : « à consommer sous … jours après ouverture ».' },
};
const TYPE_ORDER = ['decongele', 'maison', 'ouvert'];
const DUREES = [1, 2, 3, 5, 7];
export const dlcZone = (x) => (x.zone === 'bar' ? 'bar' : 'cuisine');

// Badge selon le nombre de jours restants.
export function dlcBadge(key) {
  const n = daysUntil(key);
  if (n < 0) return `<span class="badge alert">Périmé depuis ${-n} j</span>`;
  if (n === 0) return '<span class="badge alert">Périme aujourd’hui</span>';
  if (n === 1) return '<span class="badge warn">Périme demain</span>';
  if (n <= 3) return `<span class="badge warn">Dans ${n} jours</span>`;
  return `<span class="badge ok">Dans ${n} jours</span>`;
}

export function renderDlc(view, { session }) {
  let items = [];
  let noms = [];
  let zone = (() => { try { return localStorage.getItem('kr_zone') === 'bar' ? 'bar' : 'cuisine'; } catch (e) { return 'cuisine'; } })();
  let showForm = false;
  const st = {};
  const resetForm = () => Object.assign(st, { type: '', nom: '', jours: null, autre: false, faitLe: today(), dlc: '', remarque: '' });
  resetForm();

  const calc = () => {
    if (st.autre) return st.dlc;
    return Number.isFinite(st.jours) ? addDaysKey(st.faitLe, st.jours) : '';
  };
  function readForm() {
    const f = view.querySelector('#xf'); if (!f) return;
    const n = f.querySelector('#xn'); if (n) st.nom = n.value;
    const d = f.querySelector('#xd'); if (d && d.value) st.faitLe = d.value;
    const l = f.querySelector('#xl'); if (l) st.dlc = l.value;
    const r = f.querySelector('#xr'); if (r) st.remarque = r.value;
  }

  function suggestions() {
    const f = slug(st.nom || '');
    return noms.filter((x) => x.zone === zone && (!st.type || x.type === st.type) && (!f || slug(x.nom).includes(f)) && slug(x.nom) !== f)
      .sort((a, b) => (b.last || 0) - (a.last || 0)).slice(0, 8);
  }

  function formHtml() {
    const t = DLC_TYPES[st.type];
    const typeBtns = TYPE_ORDER.map((k) => `<button type="button" class="typebtn ${st.type === k ? 'on' : ''}" data-type="${k}" aria-pressed="${st.type === k}">
        ${icon(k === 'decongele' ? 'snow' : k === 'maison' ? 'pot' : 'open', 26)}<span>${esc(DLC_TYPES[k].label)}</span></button>`).join('');
    if (!st.type) {
      return `<div class="card pad stack" style="gap:12px" id="xf">
        <strong>Qu’est-ce qui arrive au produit ?</strong>
        <div class="typegrid">${typeBtns}</div>
        <div><button type="button" class="btn" data-closeform>Annuler</button></div>
      </div>`;
    }
    const sug = suggestions();
    const res = calc();
    const chips = DUREES.map((j) => `<button type="button" class="chip ${!st.autre && st.jours === j ? 'on' : ''}" data-jours="${j}">${j} jour${j > 1 ? 's' : ''}</button>`).join('');
    return `<form id="xf" class="card pad stack" style="gap:16px" novalidate>
      <div class="typegrid">${typeBtns}</div>
      ${t.aide ? `<div class="small muted">${esc(t.aide)}</div>` : ''}
      <div class="field"><label for="xn">Produit</label>
        <input id="xn" value="${esc(st.nom)}" autocomplete="off" placeholder="${st.type === 'decongele' ? 'ex. Poulet' : st.type === 'maison' ? 'ex. Bouillon, sauce…' : zone === 'bar' ? 'ex. Sirop de citron, lait' : 'ex. Crème, sauce soja'}">
        ${sug.length ? `<div class="chips" style="margin-top:8px">${sug.map((x) => `<button type="button" class="chip light" data-sug="${esc(x.id)}">${esc(x.nom)}</button>`).join('')}</div>` : ''}
      </div>
      <div class="field"><label>Se garde combien de temps ?</label>
        <div class="chips">${chips}<button type="button" class="chip ${st.autre ? 'on' : ''}" data-autre>Autre date</button></div>
      </div>
      ${st.autre ? `<div class="field"><label for="xl">Date limite</label><input id="xl" type="date" min="${esc(st.faitLe)}" value="${esc(st.dlc)}"></div>` : ''}
      <div class="dlcresult ${res ? '' : 'empty'}">${res ? `DLC : <strong>${esc(longDate(dateFromKey(res)))}</strong>` : 'Choisissez une durée'}</div>
      <details class="small"${st.faitLe !== today() || st.remarque ? ' open' : ''}><summary>Autre jour ou remarque</summary>
        <div class="form-grid" style="margin-top:10px">
          <div class="field"><label for="xd">${st.type === 'decongele' ? 'Sorti le' : st.type === 'maison' ? 'Fait le' : 'Ouvert le'}</label><input id="xd" type="date" max="${today()}" value="${esc(st.faitLe)}"></div>
          <div class="field"><label for="xr">Remarque</label><input id="xr" value="${esc(st.remarque)}" placeholder="ex. 2 bacs, frigo 3"></div>
        </div>
      </details>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button type="submit" class="btn primary">Enregistrer</button>
        <button type="button" class="btn" data-closeform>Annuler</button>
      </div>
    </form>`;
  }

  function draw() {
    const list = items.filter((x) => dlcZone(x) === zone).sort((a, b) => a.dlc.localeCompare(b.dlc));
    const perimes = list.filter((x) => daysUntil(x.dlc) < 0).length;
    const bientot = list.filter((x) => { const n = daysUntil(x.dlc); return n >= 0 && n <= 1; }).length;
    const autreZ = zone === 'bar' ? 'cuisine' : 'bar';
    const autreAlerte = items.filter((x) => dlcZone(x) === autreZ && daysUntil(x.dlc) <= 1).length;
    const zbtn = ZONE_ORDER.map((z) => {
      const n = items.filter((x) => dlcZone(x) === z && daysUntil(x.dlc) <= 1).length;
      return `<button type="button" data-zone="${z}" class="${zone === z ? 'on' : ''}" aria-pressed="${zone === z}">DLC ${z === 'bar' ? 'Bar' : 'Cuisine'}${n ? ` <span class="dot">${n}</span>` : ''}</button>`;
    }).join('');
    view.innerHTML = `
      <div class="stack" style="gap:4px"><h1 class="title">DLC</h1>
        <span class="small muted">Produits sortis du congélateur, faits maison ou ouverts. Ce qui est au congélateur n’a pas de DLC.</span></div>
      <div class="segmented zonesel" role="group" aria-label="Zone">${zbtn}</div>
      ${showForm ? formHtml() : '<button type="button" class="btn primary big" data-openform>+ Ajouter un produit</button>'}
      ${perimes ? `<div class="alertbox"><span class="ic">${icon('alert', 22)}</span><div><strong>${perimes} produit${perimes > 1 ? 's' : ''} périmé${perimes > 1 ? 's' : ''}</strong><br><span class="small muted">À jeter, puis touchez « Jeté ».</span></div></div>` : ''}
      ${bientot ? `<div class="warnbox"><strong>${bientot} produit${bientot > 1 ? 's' : ''} à utiliser aujourd’hui ou demain.</strong></div>` : ''}
      ${autreAlerte ? `<button type="button" class="linkrow" data-zone="${autreZ}">${icon('alert', 16)} DLC ${autreZ === 'bar' ? 'Bar' : 'Cuisine'} : ${autreAlerte} produit${autreAlerte > 1 ? 's' : ''} à voir</button>` : ''}
      <section class="stack" style="gap:8px">
        <h2 class="sectiontitle">${zone === 'bar' ? 'Au bar' : 'En cuisine'} en ce moment <span class="muted small">(${list.length})</span></h2>
        ${list.length ? `<div class="card list">${list.map((x) => {
          const t = DLC_TYPES[x.type];
          return `<div class="crow">
            <div class="info">
              <span class="nm">${esc(x.nom)}</span>
              <span class="small muted">${t ? `${esc(t.court)} le` : 'Fait le'} ${esc(shortDate(dateFromKey(x.faitLe)))} · ${esc(x.parNom || '')}</span>
              <span class="small"><strong>DLC ${esc(shortDate(dateFromKey(x.dlc)))}</strong>${x.type === 'decongele' ? ' · <span class="muted">ne pas recongeler</span>' : ''}</span>
              ${x.remarque ? `<span class="small">${esc(x.remarque)}</span>` : ''}
              ${dlcBadge(x.dlc)}
            </div>
            <div class="stack" style="gap:6px">
              <button type="button" class="btn small" data-fin="utilise" data-id="${esc(x.id)}">Utilisé</button>
              <button type="button" class="btn small" data-fin="jete" data-id="${esc(x.id)}">Jeté</button>
            </div>
          </div>`;
        }).join('')}</div>` : `<div class="card pad muted">Aucun produit à surveiller ${zone === 'bar' ? 'au bar' : 'en cuisine'}.</div>`}
      </section>`;
  }

  view.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.fin) {
      updateDoc(doc(db, 'dlc', b.dataset.id), {
        statut: b.dataset.fin, finLe: today(), finPar: session.user.prenom, finAt: serverTimestamp(),
      }).catch((er) => toast(er.message));
      items = items.filter((x) => x.id !== b.dataset.id);
      toast(b.dataset.fin === 'jete' ? 'Noté comme jeté.' : 'Noté comme utilisé.');
      if (showForm) readForm();
      draw();
      return;
    }
    if (b.dataset.zone) {
      if (b.dataset.zone !== zone) {
        zone = b.dataset.zone;
        try { localStorage.setItem('kr_zone', zone); } catch (er) { /* rien */ }
        if (showForm) readForm();
        draw();
      }
      return;
    }
    if (b.hasAttribute('data-openform')) { resetForm(); showForm = true; draw(); return; }
    if (b.hasAttribute('data-closeform')) { showForm = false; draw(); return; }
    readForm();
    if (b.dataset.type) {
      st.type = b.dataset.type;
      if (!st.autre && st.jours === null && DLC_TYPES[st.type].jours) st.jours = DLC_TYPES[st.type].jours;
      draw();
      if (!st.nom) view.querySelector('#xn')?.focus();
    } else if (b.dataset.sug) {
      const s = noms.find((x) => x.id === b.dataset.sug);
      if (s) { st.nom = s.nom; if (Number.isFinite(s.jours)) { st.jours = s.jours; st.autre = false; } }
      draw();
    } else if (b.dataset.jours) { st.jours = parseInt(b.dataset.jours, 10); st.autre = false; draw(); }
    else if (b.hasAttribute('data-autre')) { st.autre = true; if (!st.dlc) st.dlc = calc() || ''; draw(); }
  });

  view.addEventListener('input', (e) => {
    if (e.target.id !== 'xn') return;
    // Rafraîchit seulement les suggestions, sans perdre le curseur.
    st.nom = e.target.value;
    const box = e.target.parentElement.querySelector('.chips');
    const sug = suggestions();
    const html = sug.map((x) => `<button type="button" class="chip light" data-sug="${esc(x.id)}">${esc(x.nom)}</button>`).join('');
    if (box) { if (sug.length) box.innerHTML = html; else box.remove(); } else if (sug.length) e.target.insertAdjacentHTML('afterend', `<div class="chips" style="margin-top:8px">${html}</div>`);
  });
  view.addEventListener('change', (e) => {
    if (e.target.id === 'xd' || e.target.id === 'xl') { readForm(); draw(); }
  });

  view.addEventListener('submit', (e) => {
    e.preventDefault();
    readForm();
    const nom = st.nom.trim();
    const dlc = calc();
    if (!nom) { toast('Tapez le nom du produit.'); return; }
    if (!dlc) { toast('Choisissez combien de temps il se garde.'); return; }
    if (dlc < st.faitLe) { toast('La date limite est avant la date du jour choisi : vérifiez.'); return; }
    const jours = st.autre ? Math.round((dateFromKey(dlc) - dateFromKey(st.faitLe)) / 86400000) : st.jours;
    addDoc(collection(db, 'dlc'), {
      nom, zone, type: st.type, jours, faitLe: st.faitLe, dlc, remarque: st.remarque.trim(),
      statut: 'en_cours', par: session.user.uid, parNom: session.user.prenom, at: serverTimestamp(),
    }).catch((er) => toast(`Erreur : ${er.message}`, 5000));
    // Retient le nom et la durée pour la prochaine fois.
    setDoc(doc(db, 'dlc_noms', `${zone}_${st.type}_${slug(nom)}`), {
      nom, zone, type: st.type, jours, last: Date.now(),
    }).catch((er) => console.error(er));
    toast(`Enregistré. DLC : ${shortDate(dateFromKey(dlc))}`);
    showForm = false;
    draw();
  });

  const un1 = onSnapshot(query(collection(db, 'dlc'), where('statut', '==', 'en_cours')), (s) => {
    items = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (showForm) readForm();
    draw();
  });
  const un2 = onSnapshot(collection(db, 'dlc_noms'), (s) => {
    noms = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (showForm) { readForm(); draw(); }
  });
  draw();
  return () => { un1(); un2(); };
}
