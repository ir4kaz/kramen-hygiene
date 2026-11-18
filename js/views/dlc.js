// DLC : produits faits maison ou ouverts, avec leur date limite et des alertes quand elle approche.
import { db } from '../firebase.js';
import {
  collection, query, where, onSnapshot, doc, addDoc, updateDoc, deleteDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import {
  esc, icon, toast, today, shortDate, dateFromKey, addDaysKey, daysUntil,
} from '../util.js';

// Badge selon le nombre de jours restants.
export function dlcBadge(key) {
  const n = daysUntil(key);
  if (n < 0) return `<span class="badge alert">Périmé depuis ${-n} j</span>`;
  if (n === 0) return '<span class="badge alert">Périme aujourd’hui</span>';
  if (n === 1) return '<span class="badge warn">Périme demain</span>';
  if (n <= 3) return `<span class="badge warn">Dans ${n} jours</span>`;
  return `<span class="badge ok">Dans ${n} jours</span>`;
}

export function renderDlc(view, { sub, session }) {
  if (sub === 'nouveau') return renderAdd(view, session);
  if (sub === 'preparations') return renderPreps(view, session);
  return renderList(view, session);
}

// ---------- Produits en cours ----------
function renderList(view, session) {
  let items = [];

  function draw() {
    const list = [...items].sort((a, b) => a.dlc.localeCompare(b.dlc));
    const perimes = list.filter((x) => daysUntil(x.dlc) < 0).length;
    const bientot = list.filter((x) => { const n = daysUntil(x.dlc); return n >= 0 && n <= 1; }).length;
    view.innerHTML = `
      <div class="row between" style="flex-wrap:wrap;gap:12px">
        <div class="stack" style="gap:4px"><h1 class="title">DLC</h1>
          <span class="small muted">Produits faits maison ou ouverts, avec leur date limite.</span></div>
        <a class="btn primary" href="#/dlc/nouveau" style="text-decoration:none">+ Nouveau produit</a>
      </div>
      ${perimes ? `<div class="alertbox"><span class="ic">${icon('alert', 22)}</span><div><strong>${perimes} produit${perimes > 1 ? 's' : ''} périmé${perimes > 1 ? 's' : ''}</strong><br><span class="small muted">À jeter, puis touchez « Jeté ».</span></div></div>` : ''}
      ${bientot ? `<div class="warnbox"><strong>${bientot} produit${bientot > 1 ? 's' : ''} à utiliser aujourd’hui ou demain.</strong></div>` : ''}
      ${list.length ? `<div class="card list">${list.map((x) => `<div class="crow">
          <div class="info">
            <span class="nm">${esc(x.nom)}</span>
            <span class="small muted">Fait le ${esc(shortDate(dateFromKey(x.faitLe)))} · DLC ${esc(shortDate(dateFromKey(x.dlc)))} · ${esc(x.parNom || '')}</span>
            ${x.remarque ? `<span class="small">${esc(x.remarque)}</span>` : ''}
            ${dlcBadge(x.dlc)}
          </div>
          <div class="stack" style="gap:6px">
            <button type="button" class="btn small" data-fin="utilise" data-id="${esc(x.id)}">Utilisé</button>
            <button type="button" class="btn small" data-fin="jete" data-id="${esc(x.id)}">Jeté</button>
          </div>
        </div>`).join('')}</div>`
        : '<div class="card pad muted">Aucun produit en cours. Touchez « + Nouveau produit » quand vous préparez ou ouvrez quelque chose.</div>'}
      <a href="#/dlc/preparations" class="btn" style="align-self:flex-start;text-decoration:none;color:inherit">${icon('tag', 20)} Préparations et durées de conservation</a>`;
  }

  view.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-fin]');
    if (!b) return;
    updateDoc(doc(db, 'dlc', b.dataset.id), {
      statut: b.dataset.fin, finLe: today(), finPar: session.user.prenom, finAt: serverTimestamp(),
    }).catch((er) => toast(er.message));
    items = items.filter((x) => x.id !== b.dataset.id);
    draw();
    toast(b.dataset.fin === 'jete' ? 'Noté comme jeté.' : 'Noté comme utilisé.');
  });
  const un = onSnapshot(query(collection(db, 'dlc'), where('statut', '==', 'en_cours')), (s) => {
    items = s.docs.map((d) => ({ id: d.id, ...d.data() })); draw();
  });
  draw();
  return () => un();
}

// ---------- Nouveau produit ----------
function renderAdd(view, session) {
  let preps = [];
  const st = { prepId: '', nom: '', jours: '', faitLe: today(), dlc: '', dlcTouchee: false, remarque: '', garder: true };

  function compute() {
    const j = parseInt(st.jours, 10);
    if (!st.dlcTouchee && Number.isFinite(j) && j >= 0 && st.faitLe) st.dlc = addDaysKey(st.faitLe, j);
  }
  function read() {
    const f = view.querySelector('#xf'); if (!f) return;
    st.prepId = f.querySelector('#xp').value;
    const n = f.querySelector('#xn'); if (n) st.nom = n.value;
    const j = f.querySelector('#xj'); if (j) st.jours = j.value;
    st.faitLe = f.querySelector('#xd').value || st.faitLe;
    st.dlc = f.querySelector('#xl').value;
    st.remarque = f.querySelector('#xr').value;
    const g = f.querySelector('#xg'); if (g) st.garder = g.checked;
  }
  function draw() {
    const list = preps.filter((p) => p.actif !== false).sort((a, b) => a.nom.localeCompare(b.nom));
    const autre = st.prepId === '__autre' || !list.length;
    view.innerHTML = `
      <div class="row" style="gap:8px"><a href="#/dlc" class="iconbtn" aria-label="Retour">${icon('back', 24)}</a><h1 class="title">Nouveau produit</h1></div>
      <form id="xf" class="card pad stack" style="gap:14px;max-width:640px" novalidate>
        <div class="field"><label for="xp">Produit</label>
          <select id="xp" class="select-lg">
            ${list.length ? '<option value="">— Choisir —</option>' : ''}
            ${list.map((p) => `<option value="${esc(p.id)}" ${st.prepId === p.id ? 'selected' : ''}>${esc(p.nom)} (${p.jours} j)</option>`).join('')}
            <option value="__autre" ${autre ? 'selected' : ''}>Autre produit…</option>
          </select></div>
        ${autre ? `<div class="form-grid">
          <div class="field"><label for="xn">Nom du produit</label><input id="xn" value="${esc(st.nom)}" placeholder="ex. Bouillon tonkotsu"></div>
          <div class="field"><label for="xj">Se garde (jours)</label><input id="xj" inputmode="numeric" value="${esc(st.jours)}" placeholder="ex. 3"></div>
        </div>
        <label class="toggle"><input type="checkbox" id="xg" ${st.garder ? 'checked' : ''}><span>Ajouter ce produit à la liste des préparations</span></label>` : ''}
        <div class="form-grid">
          <div class="field"><label for="xd">Fait / ouvert le</label><input id="xd" type="date" max="${today()}" value="${esc(st.faitLe)}"></div>
          <div class="field"><label for="xl">Date limite (DLC)</label><input id="xl" type="date" value="${esc(st.dlc)}"></div>
        </div>
        <span class="small muted">La date limite se calcule toute seule ; vous pouvez la changer.</span>
        <div class="field"><label for="xr">Remarque (facultatif)</label><input id="xr" value="${esc(st.remarque)}" placeholder="ex. 2 bacs, frigo 3"></div>
        <button type="submit" class="btn primary block">Enregistrer</button>
      </form>`;
  }

  view.addEventListener('change', (e) => {
    const id = e.target.id;
    if (id === 'xp') {
      read();
      const p = preps.find((x) => x.id === st.prepId);
      if (p) { st.nom = p.nom; st.jours = String(p.jours); }
      st.dlcTouchee = false; compute(); draw();
    } else if (id === 'xd' || id === 'xj') { read(); st.dlcTouchee = false; compute(); draw(); }
    else if (id === 'xl') { read(); st.dlcTouchee = true; }
  });
  view.addEventListener('submit', async (e) => {
    e.preventDefault();
    read();
    const p = preps.find((x) => x.id === st.prepId);
    const nom = (p ? p.nom : st.nom).trim();
    if (!nom) { toast('Choisissez ou tapez le produit.'); return; }
    if (!st.dlc) { toast('Indiquez la date limite (ou le nombre de jours).'); return; }
    if (st.dlc < st.faitLe) { toast('La date limite est avant la date de fabrication : vérifiez.'); return; }
    if (!p && st.garder && Number.isFinite(parseInt(st.jours, 10))) {
      addDoc(collection(db, 'preparations'), { nom, jours: parseInt(st.jours, 10), actif: true, par: session.user.uid, createdAt: serverTimestamp() })
        .catch((er) => toast(er.message));
    }
    addDoc(collection(db, 'dlc'), {
      nom, prepId: p ? p.id : null, faitLe: st.faitLe, dlc: st.dlc, remarque: st.remarque.trim(),
      statut: 'en_cours', par: session.user.uid, parNom: session.user.prenom, at: serverTimestamp(),
    }).catch((er) => toast(`Erreur : ${er.message}`, 5000));
    toast('Produit enregistré.');
    location.hash = '#/dlc';
  });

  const un = onSnapshot(collection(db, 'preparations'), (s) => {
    preps = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    read(); draw();
  });
  draw();
  return () => un();
}

// ---------- Préparations et durées ----------
function renderPreps(view, session) {
  const isAdmin = session.user.role === 'admin';
  let preps = [];
  let editing = null;

  function draw() {
    const e = preps.find((p) => p.id === editing);
    const list = [...preps].sort((a, b) => a.nom.localeCompare(b.nom));
    view.innerHTML = `
      <div class="row" style="gap:8px"><a href="#/dlc" class="iconbtn" aria-label="Retour">${icon('back', 24)}</a><h1 class="title">Préparations</h1></div>
      <form id="pf" class="card pad stack" style="gap:12px;max-width:640px">
        <strong>${e ? `Modifier « ${esc(e.nom)} »` : 'Ajouter une préparation'}</strong>
        <div class="form-grid">
          <div class="field"><label for="pn">Nom</label><input id="pn" value="${esc(e?.nom || '')}" placeholder="ex. Kimchi maison"></div>
          <div class="field"><label for="pj">Se garde (jours)</label><input id="pj" inputmode="numeric" value="${esc(e?.jours ?? '')}" placeholder="ex. 5"></div>
        </div>
        <div class="row" style="gap:8px"><button type="submit" class="btn primary">${e ? 'Enregistrer' : 'Ajouter'}</button>
          ${e ? '<button type="button" class="btn" data-cancel>Annuler</button>' : ''}</div>
      </form>
      <div class="card tablewrap"><table class="table">
        <thead><tr><th>Préparation</th><th>Se garde</th><th></th></tr></thead>
        <tbody>${list.map((p) => `<tr><td><strong>${esc(p.nom)}</strong></td><td>${p.jours} jour${p.jours > 1 ? 's' : ''}</td>
          <td style="white-space:nowrap">${isAdmin ? `<button class="btn small" type="button" data-edit="${esc(p.id)}">Modifier</button>
          <button class="btn small" type="button" data-del="${esc(p.id)}">Supprimer</button>` : ''}</td></tr>`).join('')
          || '<tr><td colspan="3" class="muted">Aucune préparation. Ajoutez vos sauces, bouillons, kimchi…</td></tr>'}</tbody>
      </table></div>
      ${isAdmin ? '' : '<p class="small muted" style="margin:0">Pour modifier ou supprimer, demandez à la responsable.</p>'}`;
  }

  view.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.edit) { editing = b.dataset.edit; draw(); }
    else if (b.hasAttribute('data-cancel')) { editing = null; draw(); }
    else if (b.dataset.del) {
      const p = preps.find((x) => x.id === b.dataset.del);
      if (p && window.confirm(`Supprimer « ${p.nom} » de la liste ?`)) deleteDoc(doc(db, 'preparations', p.id)).catch((er) => toast(er.message));
    }
  });
  view.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const nom = f.pn.value.trim();
    const jours = parseInt(f.pj.value, 10);
    if (!nom || !Number.isFinite(jours) || jours < 0) { toast('Indiquez le nom et le nombre de jours.'); return; }
    if (editing) updateDoc(doc(db, 'preparations', editing), { nom, jours }).catch((er) => toast(er.message));
    else addDoc(collection(db, 'preparations'), { nom, jours, actif: true, par: session.user.uid, createdAt: serverTimestamp() }).catch((er) => toast(er.message));
    toast(editing ? 'Préparation modifiée.' : 'Préparation ajoutée.');
    editing = null; f.reset(); draw();
  });
  const un = onSnapshot(collection(db, 'preparations'), (s) => {
    preps = s.docs.map((d) => ({ id: d.id, ...d.data() })); if (!editing) draw();
  });
  draw();
  return () => un();
}
