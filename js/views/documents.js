// Documents : classeur numérique (PMS, fiches techniques, notices, papiers…), bons de livraison et historiques.
// Les fichiers sont découpés en morceaux de moins de 1 Mo (limite d'un document Firestore).
import { db } from '../firebase.js';
import {
  collection, query, where, onSnapshot, doc, getDoc, getDocs, writeBatch, serverTimestamp, Bytes, updateDoc,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import {
  esc, icon, toast, shortDate, today, dateFromKey, compressImage, DOC_CATS, DOC_ORDER, fmtSize, hhmm, bytesToUrl, slug,
} from '../util.js';

const CHUNK = 900 * 1024;
const MAX_TOTAL = 8 * 1024 * 1024;
const MAX_FILES = 10;

// Catégories ajoutées par l'équipe (collection « doc_categories »), en plus des catégories de base.
let CUSTOM = {};
const setCustom = (s) => { CUSTOM = Object.fromEntries(s.docs.map((d) => [d.id, d.data()])); };
const known = (id) => !!(DOC_CATS[id] || CUSTOM[id]);
const cat = (id) => DOC_CATS[id] || CUSTOM[id] || DOC_CATS.autre;
const catOrder = () => [
  ...DOC_ORDER.filter((c) => c !== 'autre'),
  ...Object.keys(CUSTOM).sort((a, b) => (CUSTOM[a].label || '').localeCompare(CUSTOM[b].label || '')),
  'autre',
];
const catOptions = (sel, withNew) => catOrder().map((c) => `<option value="${esc(c)}" ${sel === c ? 'selected' : ''}>${esc(cat(c).label)}</option>`).join('')
  + (withNew ? `<option value="__new" ${sel === '__new' ? 'selected' : ''}>+ Nouvelle catégorie…</option>` : '');

export function renderDocuments(view, { sub, session }) {
  if (sub === 'ajouter') return renderAdd(view, session);
  if (sub) return renderView(view, sub, session);
  return renderList(view, session);
}

// ---------- Liste ----------
function renderList(view, session) {
  const isAdmin = session.user.role === 'admin';
  let docs = [];
  let fournisseurs = [];
  let receptions = [];
  let filtre = '';
  let showAllBons = false;
  const thumbs = [];
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  function draw() {
    const f = filtre.trim().toLowerCase();
    const match = (d) => !f || d.titre.toLowerCase().includes(f) || (cat(d.categorie).label || '').toLowerCase().includes(f);
    const sections = catOrder().map((c) => {
      const list = docs.filter((d) => (known(d.categorie) ? d.categorie : 'autre') === c && match(d))
        .sort((a, b) => (b.ajouteLe || 0) - (a.ajouteLe || 0));
      if (!list.length) return '';
      return `<section class="stack" style="gap:8px">
        <h2 style="font-size:15px">${esc(cat(c).label)} <span class="muted small">(${list.length})</span></h2>
        <div class="card list">${list.map((d) => `<a class="docrow" href="#/documents/${esc(d.id)}">
          <span class="docic">${icon('file', 22)}</span>
          <span class="rinfo"><strong>${esc(d.titre)}</strong>
            <span class="small muted">${d.date ? esc(shortDate(dateFromKey(d.date))) : ''} · ${esc(d.ajouteParNom || '')} · ${d.fichiers?.length || 0} fichier${(d.fichiers?.length || 0) > 1 ? 's' : ''}</span></span>
        </a>`).join('')}</div>
      </section>`;
    }).join('');

    const fHtml = '';

    // Bons de livraison : les photos prises dans Réception (pas de copie, on renvoie vers la livraison).
    thumbs.splice(0).forEach((u) => URL.revokeObjectURL(u));
    const bons = receptions.filter((r) => r.photos?.length && (!f || (r.fournisseurNom || '').toLowerCase().includes(f) || 'bon de livraison'.includes(f)))
      .sort((a, b) => (b.date.localeCompare(a.date)) || ((b.heure || 0) - (a.heure || 0)));
    const bonsVis = showAllBons ? bons : bons.slice(0, 5);
    const bHtml = bons.length ? `<section class="stack" style="gap:8px">
        <h2 style="font-size:15px">Bons de livraison <span class="muted small">(${bons.length})</span></h2>
        <div class="card list">${bonsVis.map((r) => {
          const u = bytesToUrl(r.photos[0].thumb); thumbs.push(u);
          return `<a class="docrow" href="#/reception/${esc(r.id)}">
            <img src="${u}" alt="" class="minithumb">
            <span class="rinfo"><strong>${esc(r.fournisseurNom || 'Livraison')}</strong>
              <span class="small muted">${esc(shortDate(dateFromKey(r.date)))}${r.heure ? ` · ${esc(hhmm(new Date(r.heure)))}` : ''} · ${r.photos.length} photo${r.photos.length > 1 ? 's' : ''}</span></span>
            ${r.conforme === false ? '<span class="badge alert">Non conforme</span>' : ''}
          </a>`;
        }).join('')}</div>
        ${bons.length > 5 ? `<button type="button" class="btn small" data-morebons style="align-self:flex-start">${showAllBons ? 'Voir moins' : `Voir les ${bons.length} bons`}</button>` : ''}
      </section>` : '';

    // Historiques mensuels : liens vers l'Historique (toujours à jour, export PDF en un clic).
    const now = new Date();
    const months = [0, 1, 2].map((i) => new Date(now.getFullYear(), now.getMonth() - i, 1));
    const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    const hRows = months.flatMap((d) => [
      ['temperatures', 'Relevés de températures'], ['nettoyage', 'Plan de nettoyage'], ['reception', 'Réception des marchandises'], ['dlc', 'DLC (produits utilisés et jetés)'],
    ].map(([k, l]) => ({ k, l, d })))
      .filter((x) => !f || x.l.toLowerCase().includes(f) || 'historique'.includes(f) || MOIS[x.d.getMonth()].includes(f));
    const hHtml = hRows.length ? `<section class="stack" style="gap:8px">
        <h2 style="font-size:15px">Historiques (relevés, nettoyage, livraisons, DLC)</h2>
        <div class="card list">${hRows.map((x) => `<a class="docrow" href="#/historique/${x.k}/mois/${key(x.d)}">
          <span class="docic">${icon('file', 22)}</span>
          <span class="rinfo"><strong>${esc(x.l)} — ${MOIS[x.d.getMonth()]} ${x.d.getFullYear()}</strong>
            <span class="small muted">Ouvrir, puis « Exporter en PDF »</span></span>
        </a>`).join('')}</div>
        <a href="#/historique" class="small">Voir un autre mois dans l’Historique</a>
      </section>` : '';

    const keepFocus = document.activeElement?.id === 'q';
    view.innerHTML = `
      <div class="row between" style="flex-wrap:wrap;gap:12px">
        <h1 class="title">Documents</h1>
        <a class="btn primary" href="#/documents/ajouter" style="text-decoration:none">+ Ajouter un document</a>
      </div>
      <input id="q" class="select-lg" type="search" placeholder="Rechercher un document ou un fournisseur" value="${esc(filtre)}" aria-label="Rechercher">
      ${sections || (f ? '' : '<div class="card pad muted">Aucun document ajouté pour l’instant. Ajoutez le PMS, les fiches techniques des produits d’entretien, les notices…</div>')}
      ${bHtml}
      ${hHtml}
      ${fHtml}
      ${f && !sections && !fHtml && !bHtml && !hHtml ? '<div class="card pad muted">Aucun résultat.</div>' : ''}`;
    if (keepFocus) { const q = view.querySelector('#q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }

  view.addEventListener('input', (e) => { if (e.target.id === 'q') { filtre = e.target.value; draw(); } });
  view.addEventListener('click', (e) => { if (e.target.closest('[data-morebons]')) { showAllBons = !showAllBons; draw(); } });
  // Les employés ne reçoivent que les documents non réservés à la responsable.
  const q = isAdmin ? collection(db, 'documents') : query(collection(db, 'documents'), where('prive', '==', false));
  const un1 = onSnapshot(q, (s) => { docs = s.docs.map((d) => ({ id: d.id, ...d.data() })); draw(); });
  const un2 = onSnapshot(collection(db, 'fournisseurs'), (s) => { fournisseurs = s.docs.map((d) => ({ id: d.id, ...d.data() })); draw(); });
  const un4 = onSnapshot(collection(db, 'doc_categories'), (s) => { setCustom(s); draw(); });
  // Bons de livraison des 6 derniers mois.
  const since = new Date(); since.setMonth(since.getMonth() - 6);
  const un3 = onSnapshot(query(collection(db, 'receptions'), where('date', '>=', today(since))), (s) => {
    receptions = s.docs.map((d) => ({ id: d.id, ...d.data() })); draw();
  });
  draw();
  return () => { un1(); un2(); un3(); un4(); thumbs.forEach((u) => URL.revokeObjectURL(u)); };
}

// ---------- Ajout ----------
function renderAdd(view, session) {
  const isAdmin = session.user.role === 'admin';
  const st = { titre: '', categorie: 'pms', nouvelle: '', prive: false, files: [] }; // files: { type, nom, bytes, url? }
  let busy = false;

  function read() {
    const f = view.querySelector('#df');
    if (!f) return;
    st.titre = f.querySelector('#dt').value;
    st.categorie = f.querySelector('#dc').value;
    const n = f.querySelector('#dnew');
    if (n) st.nouvelle = n.value;
    const p = f.querySelector('#dp');
    if (p) st.prive = p.checked;
  }

  function draw() {
    const total = st.files.reduce((s, x) => s + x.bytes.length, 0);
    view.innerHTML = `
      <div class="row" style="gap:8px"><a href="#/documents" class="iconbtn" aria-label="Retour">${icon('back', 24)}</a><h1 class="title">Ajouter un document</h1></div>
      <form id="df" class="stack" style="gap:16px;max-width:760px" novalidate>
        <section class="card pad stack" style="gap:12px">
          <div class="field"><label for="dt">Titre</label><input id="dt" value="${esc(st.titre)}" placeholder="ex. Fiche technique dégraissant Sanet"></div>
          <div class="field"><label for="dc">Catégorie</label><select id="dc">${catOptions(st.categorie, true)}</select></div>
          ${st.categorie === '__new' ? `<div class="field"><label for="dnew">Nom de la nouvelle catégorie</label><input id="dnew" value="${esc(st.nouvelle)}" placeholder="ex. Analyses d’eau, Factures énergie"></div>` : ''}
        </section>
        <section class="card pad stack" style="gap:10px">
          <strong>Fichiers (photos ou PDF)</strong>
          <span class="small muted">Plusieurs photos = plusieurs pages d’un même document. ${MAX_FILES} fichiers et ${fmtSize(MAX_TOTAL)} maximum.</span>
          <div class="stack" style="gap:6px">${st.files.map((x, i) => `<div class="row between card pad" style="padding:10px 12px">
            <span class="row" style="gap:10px;min-width:0">${x.type === 'image' ? `<img src="${x.url}" alt="" class="minithumb">` : `<span class="docic">${icon('file', 22)}</span>`}
              <span class="small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.nom)} · ${esc(fmtSize(x.bytes.length))}</span></span>
            <button type="button" class="btn small" data-delfile="${i}">Retirer</button></div>`).join('')}</div>
          ${st.files.length < MAX_FILES ? `<div class="row" style="gap:8px;flex-wrap:wrap">
            <label class="btn">${icon('camera', 20)} Prendre une photo<input type="file" accept="image/*" capture="environment" multiple id="fcam" hidden></label>
            <label class="btn">Choisir un fichier (photo ou PDF)<input type="file" accept="image/*,application/pdf" multiple id="ffile" hidden></label>
          </div>` : ''}
          <span class="small muted" id="fstate">${st.files.length ? `Total : ${esc(fmtSize(total))}` : ''}</span>
        </section>
        <button type="submit" class="btn primary block" ${busy ? 'disabled' : ''}>Enregistrer le document</button>
      </form>`;
  }

  async function addFiles(list) {
    const state = view.querySelector('#fstate');
    for (const [n, file] of [...list].slice(0, MAX_FILES - st.files.length).entries()) {
      if (state) state.textContent = `Préparation du fichier ${n + 1}…`;
      try {
        if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (bytes.length > MAX_TOTAL) { toast(`« ${file.name} » est trop gros (${fmtSize(bytes.length)}, maximum ${fmtSize(MAX_TOTAL)}).`, 5000); continue; }
          st.files.push({ type: 'pdf', nom: file.name, bytes });
        } else {
          // Documents : on garde une bonne résolution pour que le texte reste lisible.
          const bytes = await compressImage(file, 1600, 300 * 1024, 0.65);
          st.files.push({ type: 'image', nom: file.name || 'photo.jpg', bytes, url: URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' })) });
        }
      } catch (e) { console.error(e); toast(`Impossible de lire « ${file.name} ».`); }
    }
    draw();
  }

  async function save() {
    read();
    const titre = st.titre.trim();
    if (!titre) { toast('Donnez un titre au document.'); return; }
    if (!st.files.length) { toast('Ajoutez au moins une photo ou un PDF.'); return; }
    let categorie = st.categorie;
    let newCat = null;
    if (categorie === '__new') {
      const label = st.nouvelle.trim();
      if (!label) { toast('Donnez un nom à la nouvelle catégorie.'); return; }
      const existing = catOrder().find((c) => cat(c).label.toLowerCase() === label.toLowerCase());
      if (existing) categorie = existing;
      else { categorie = `c_${slug(label) || Date.now()}`; newCat = { label, prive: isAdmin ? !!st.prive : false }; }
    }
    const total = st.files.reduce((s, x) => s + x.bytes.length, 0);
    if (total > MAX_TOTAL) { toast(`Document trop lourd (${fmtSize(total)}). Maximum ${fmtSize(MAX_TOTAL)}.`, 5000); return; }
    if (!navigator.onLine) toast('Hors ligne : le document sera envoyé au retour du réseau.', 4000);
    busy = true;
    const ref = doc(collection(db, 'documents'));
    const b = writeBatch(db);
    if (newCat) b.set(doc(db, 'doc_categories', categorie), { ...newCat, createdAt: serverTimestamp(), par: session.user.uid });
    const fichiers = st.files.map((x, fi) => {
      const n = Math.ceil(x.bytes.length / CHUNK);
      for (let i = 0; i < n; i += 1) {
        b.set(doc(db, 'documents', ref.id, 'morceaux', `${fi}_${String(i).padStart(3, '0')}`), {
          data: Bytes.fromUint8Array(x.bytes.subarray(i * CHUNK, (i + 1) * CHUNK)),
        });
      }
      return { type: x.type, nom: x.nom, taille: x.bytes.length, morceaux: n };
    });
    b.set(ref, {
      titre,
      categorie,
      prive: isAdmin ? !!st.prive : false,
      fichiers,
      date: today(),
      ajouteLe: Date.now(),
      at: serverTimestamp(),
      ajoutePar: session.user.uid,
      ajouteParNom: session.user.prenom,
    });
    b.commit().catch((e) => { console.error(e); toast(`Erreur d’enregistrement : ${e.message}`, 5000); });
    toast('Document enregistré.');
    location.hash = '#/documents';
  }

  view.addEventListener('change', (e) => {
    if ((e.target.id === 'fcam' || e.target.id === 'ffile') && e.target.files?.length) { read(); addFiles(e.target.files); }
    else if (e.target.id === 'dc') {
      read();
      if (isAdmin && st.categorie !== '__new') { st.prive = !!cat(st.categorie).prive; }
      draw();
      if (st.categorie === '__new') view.querySelector('#dnew')?.focus();
    }
  });
  view.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-delfile]');
    if (b) { read(); const [x] = st.files.splice(Number(b.dataset.delfile), 1); if (x.url) URL.revokeObjectURL(x.url); draw(); }
  });
  view.addEventListener('submit', (e) => { e.preventDefault(); if (!busy) save(); });
  const unc = onSnapshot(collection(db, 'doc_categories'), (s) => { setCustom(s); read(); draw(); });
  draw();
  return () => { unc(); st.files.forEach((x) => x.url && URL.revokeObjectURL(x.url)); };
}

// ---------- Consultation ----------
function renderView(view, id, session) {
  const isAdmin = session.user.role === 'admin';
  const urls = [];
  let alive = true;
  view.innerHTML = '<p class="muted">Chargement…</p>';
  (async () => {
    let s;
    try { s = await getDoc(doc(db, 'documents', id)); } catch (e) { s = null; }
    if (!alive) return;
    if (!s || !s.exists()) { view.innerHTML = '<div class="card pad">Document introuvable. <a href="#/documents">Retour</a></div>'; return; }
    const d = s.data();
    try { setCustom(await getDocs(collection(db, 'doc_categories'))); } catch (e) { /* hors ligne : catégories de base */ }
    if (!alive) return;
    view.innerHTML = `
      <div class="row" style="gap:8px"><a href="#/documents" class="iconbtn" aria-label="Retour">${icon('back', 24)}</a><h1 class="title">${esc(d.titre)}</h1></div>
      <span class="muted">${esc(cat(d.categorie).label)} · ajouté le ${esc(shortDate(dateFromKey(d.date)))} par ${esc(d.ajouteParNom || '')}</span>
      ${isAdmin ? `<form class="card pad stack" id="de" style="gap:12px">
        <div class="form-grid">
          <div class="field"><label for="et">Titre</label><input id="et" value="${esc(d.titre)}"></div>
          <div class="field"><label for="ec">Catégorie</label><select id="ec">${catOptions(known(d.categorie) ? d.categorie : 'autre', false)}</select></div>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap"><button type="submit" class="btn small">Enregistrer</button>
          <button type="button" class="btn small" data-deldoc style="color:var(--alert)">Supprimer le document</button></div>
      </form>` : ''}
      <div class="stack" style="gap:16px" id="files">${(d.fichiers || []).map((f) => `<div class="card pad muted">Chargement de « ${esc(f.nom)} »…</div>`).join('')}</div>`;

    if (isAdmin) {
      view.querySelector('#de').addEventListener('submit', (e) => {
        e.preventDefault();
        const f = e.target;
        updateDoc(doc(db, 'documents', id), { titre: f.et.value.trim() || d.titre, categorie: f.ec.value })
          .catch((er) => toast(er.message));
        toast('Document modifié.');
      });
      view.querySelector('[data-deldoc]').addEventListener('click', async () => {
        if (!window.confirm(`Supprimer « ${d.titre} » ? C’est définitif.`)) return;
        const parts = await getDocs(collection(db, 'documents', id, 'morceaux'));
        const b = writeBatch(db);
        parts.docs.forEach((p) => b.delete(p.ref || doc(db, 'documents', id, 'morceaux', p.id)));
        b.delete(doc(db, 'documents', id));
        b.commit().catch((er) => toast(`Suppression impossible : ${er.message}`, 5000));
        toast('Document supprimé.');
        location.hash = '#/documents';
      });
    }

    let parts;
    try { parts = await getDocs(collection(db, 'documents', id, 'morceaux')); } catch (e) { parts = null; }
    if (!alive) return;
    const box = view.querySelector('#files');
    if (!parts) { box.innerHTML = '<div class="card pad">Impossible de charger les fichiers (pas de réseau ?).</div>'; return; }
    const byId = Object.fromEntries(parts.docs.map((p) => [p.id, p.data().data]));
    (d.fichiers || []).forEach((f, fi) => {
      const chunks = [];
      for (let i = 0; i < f.morceaux; i += 1) {
        const c = byId[`${fi}_${String(i).padStart(3, '0')}`];
        if (c) chunks.push(c.toUint8Array ? c.toUint8Array() : c);
      }
      const el = box.children[fi];
      if (chunks.length !== f.morceaux) { el.outerHTML = `<div class="card pad">« ${esc(f.nom)} » est incomplet (envoi pas terminé ?).</div>`; return; }
      const mime = f.type === 'pdf' ? 'application/pdf' : 'image/jpeg';
      const url = URL.createObjectURL(new Blob(chunks, { type: mime }));
      urls.push(url);
      el.outerHTML = f.type === 'pdf'
        ? `<div class="card pad stack" style="gap:10px"><div class="row between" style="flex-wrap:wrap;gap:8px"><strong>${esc(f.nom)}</strong>
            <a class="btn small" href="${url}" target="_blank" rel="noopener" download="${esc(f.nom)}">Ouvrir / télécharger</a></div>
            <iframe src="${url}" class="pdfframe" title="${esc(f.nom)}"></iframe></div>`
        : `<a href="${url}" target="_blank" rel="noopener" class="card docimg"><img src="${url}" alt="${esc(f.nom)}"></a>`;
    });
  })();
  return () => { alive = false; urls.forEach((u) => URL.revokeObjectURL(u)); };
}
