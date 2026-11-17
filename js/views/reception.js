// Réception marchandise : photo du bon / des étiquettes, températures des produits, contrôles.
import { db } from '../firebase.js';
import {
  collection, query, where, onSnapshot, doc, getDoc, writeBatch, serverTimestamp, Bytes,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import {
  esc, icon, today, shortDate, hhmm, toast, fmtTemp, parseTemp,
  dayPickerHtml, pastDayBanner, dateFromKey, CATEGORIES, CAT_ORDER, compressImage, bytesToUrl,
} from '../util.js';

const MAX_PHOTOS = 6;
const CONTROLES = [
  { id: 'emballages', label: 'Emballages en bon état' },
  { id: 'dates', label: 'Dates limites correctes' },
  { id: 'proprete', label: 'Livreur et camion propres' },
];

const tempOk = (cat, t) => {
  const max = CATEGORIES[cat]?.max;
  if (max === null || max === undefined) return true;
  if (t === null || t === undefined) return null;
  return t <= max;
};

export function renderReception(view, { sub, session }) {
  if (sub === 'nouvelle') return renderForm(view, session);
  if (sub && sub.startsWith('modifier/')) return renderForm(view, session, sub.slice(9));
  if (sub) return renderDetail(view, sub, session);
  return renderList(view);
}

// ---------- Liste des livraisons d'un jour ----------
function renderList(view) {
  let day = today();
  let rows = [];
  let un = null;
  const urls = [];

  function draw() {
    urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
    const list = [...rows].sort((a, b) => (b.heure || 0) - (a.heure || 0));
    const cards = list.map((r) => {
      const thumb = r.photos?.[0]?.thumb ? bytesToUrl(r.photos[0].thumb) : '';
      if (thumb) urls.push(thumb);
      const prods = (r.produits || []).map((p) => `${esc(p.nom || CATEGORIES[p.cat]?.label || '')}${p.temp !== null && p.temp !== undefined ? ` ${esc(fmtTemp(p.temp))}` : ''}`).join(' · ');
      return `<a class="card rcard" href="#/reception/${esc(r.id)}">
        <span class="rthumb">${thumb ? `<img src="${thumb}" alt="">` : icon('truck', 28)}</span>
        <span class="rinfo">
          <span class="row between" style="gap:8px"><strong>${esc(r.fournisseurNom || 'Fournisseur ?')}</strong>
            ${r.conforme ? '<span class="badge ok">Conforme</span>' : '<span class="badge alert">Non conforme</span>'}</span>
          <span class="small muted">${r.heure ? esc(hhmm(new Date(r.heure))) : ''} · ${esc(r.parNom || '')}${r.photos?.length ? ` · ${r.photos.length} photo${r.photos.length > 1 ? 's' : ''}` : ''}</span>
          ${prods ? `<span class="small">${prods}</span>` : ''}
        </span>
      </a>`;
    }).join('');
    view.innerHTML = `
      <div class="row between" style="flex-wrap:wrap;gap:12px">
        <div class="stack" style="gap:4px">
          <h1 class="title">Réception</h1>
          <span class="small muted">Livraisons du ${esc(shortDate(dateFromKey(day)))}</span>
        </div>
        <a class="btn primary" href="#/reception/nouvelle" style="text-decoration:none">${icon('truck', 20)} Nouvelle livraison</a>
      </div>
      ${dayPickerHtml(day, true)}
      <div class="stack" style="gap:12px">${cards || '<div class="card pad muted">Aucune livraison enregistrée ce jour-là.</div>'}</div>`;
  }

  function subscribe() {
    if (un) un();
    rows = [];
    draw();
    un = onSnapshot(query(collection(db, 'receptions'), where('date', '==', day)), (s) => {
      rows = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      draw();
    });
  }
  view.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-day]');
    if (b && b.dataset.day !== day) { day = b.dataset.day; subscribe(); }
  });
  view.addEventListener('change', (e) => {
    if (e.target.matches('[data-daypick]') && e.target.value && e.target.value <= today()) { day = e.target.value; subscribe(); }
  });
  subscribe();
  return () => { if (un) un(); urls.forEach((u) => URL.revokeObjectURL(u)); };
}

// ---------- Nouvelle livraison ----------
function renderForm(view, session, editId = null) {
  let day = today();
  let fournisseurs = [];
  let loaded = !editId;
  let original = null;
  const removed = []; // photos existantes retirées pendant la modification
  const st = {
    existing: [], // { id, thumb, url } : photos déjà enregistrées (modification)
    fournisseurId: '',
    autre: '',
    photos: [], // { full: Uint8Array, thumb: Uint8Array, url }
    produits: [{ nom: '', cat: 'frais', temp: '' }],
    controles: Object.fromEntries(CONTROLES.map((c) => [c.id, true])),
    remarque: '',
  };
  let busy = false;

  function readInputs() {
    const f = view.querySelector('#rf');
    if (!f) return;
    const fo = f.querySelector('#fo');
    // Si la liste des fournisseurs n'est pas encore chargée, on garde le choix déjà connu.
    if (fo) {
      const known = st.fournisseurId && fo.querySelector(`option[value="${CSS.escape(st.fournisseurId)}"]`);
      if (fo.value !== '' || known) st.fournisseurId = fo.value;
    }
    st.autre = f.querySelector('#fa2')?.value ?? st.autre;
    st.remarque = f.querySelector('#rm')?.value ?? st.remarque;
    f.querySelectorAll('[data-prod]').forEach((row) => {
      const i = Number(row.dataset.prod);
      st.produits[i].nom = row.querySelector('[data-nom]').value;
      st.produits[i].temp = row.querySelector('[data-temp]').value;
    });
  }

  function prodRow(p, i) {
    const t = parseTemp(p.temp);
    const ok = p.temp === '' ? null : tempOk(p.cat, t);
    const badge = CATEGORIES[p.cat].max === null ? ''
      : ok === null ? `<span class="badge todo">${esc(CATEGORIES[p.cat].aide)}</span>`
        : ok ? '<span class="badge ok">OK</span>' : '<span class="badge alert">Trop chaud</span>';
    return `<div class="card pad stack prodrow" data-prod="${i}" style="gap:10px">
      <div class="row between"><strong>Produit ${i + 1}</strong>
        ${st.produits.length > 1 ? `<button type="button" class="btn small" data-delprod="${i}">Retirer</button>` : ''}</div>
      <div class="field"><label for="pn${i}">Produit (facultatif)</label><input id="pn${i}" data-nom value="${esc(p.nom)}" placeholder="ex. Poulet, légumes, boeuf haché"></div>
      <div class="segmented seg3" role="group" aria-label="Type de produit">
        ${CAT_ORDER.map((c) => `<button type="button" data-cat="${c}" data-i="${i}" class="${p.cat === c ? 'on' : ''}" aria-pressed="${p.cat === c}">${CATEGORIES[c].label}</button>`).join('')}
      </div>
      ${CATEGORIES[p.cat].max === null ? '' : `<div class="row" style="gap:12px;align-items:flex-end">
        <div class="field" style="flex:1"><label for="pt${i}">Température à la livraison (°C, facultatif)</label>
          <input id="pt${i}" data-temp inputmode="decimal" value="${esc(p.temp)}" placeholder="ex. 3 ou -19"></div>
        <span data-badge="${i}" style="padding-bottom:12px">${badge}</span>
      </div>`}
    </div>`;
  }

  function draw() {
    if (!loaded) { view.innerHTML = '<p class="muted">Chargement…</p>'; return; }
    const opts = fournisseurs.filter((f) => f.actif !== false || f.id === st.fournisseurId).sort((a, b) => a.nom.localeCompare(b.nom))
      .map((f) => `<option value="${esc(f.id)}" ${st.fournisseurId === f.id ? 'selected' : ''}>${esc(f.nom)}</option>`).join('');
    view.innerHTML = `
      <div class="row" style="gap:8px"><a href="${editId ? `#/reception/${esc(editId)}` : '#/reception'}" class="iconbtn" aria-label="Retour">${icon('back', 24)}</a><h1 class="title">${editId ? 'Modifier la livraison' : 'Nouvelle livraison'}</h1></div>
      ${dayPickerHtml(day, true)}
      ${pastDayBanner(day)}
      <form id="rf" class="stack" style="gap:16px;max-width:760px" novalidate>
        <section class="card pad stack" style="gap:10px">
          <label for="fo"><strong>Fournisseur</strong></label>
          <select id="fo" class="select-lg">
            <option value="">— Choisir —</option>${opts}<option value="__autre" ${st.fournisseurId === '__autre' ? 'selected' : ''}>Autre…</option>
          </select>
          ${st.fournisseurId === '__autre' ? `<input id="fa2" class="select-lg" value="${esc(st.autre)}" placeholder="Nom du fournisseur">` : ''}
        </section>

        <section class="card pad stack" style="gap:10px">
          <strong>Photos du bon de livraison et des étiquettes</strong>
          <div class="photos">${st.existing.map((p, i) => `<div class="ph"><img src="${p.url}" alt="Photo enregistrée ${i + 1}"><button type="button" class="phdel" data-delold="${i}" aria-label="Retirer la photo enregistrée ${i + 1}">✕</button></div>`).join('')}${st.photos.map((p, i) => `<div class="ph"><img src="${p.url}" alt="Photo ${i + 1}"><button type="button" class="phdel" data-delphoto="${i}" aria-label="Retirer la photo ${i + 1}">✕</button></div>`).join('')}</div>
          ${st.photos.length + st.existing.length < MAX_PHOTOS ? `<label class="btn" style="align-self:flex-start">${icon('folder', 20)} Prendre une photo<input type="file" accept="image/*" capture="environment" multiple id="ph" hidden></label>` : `<span class="small muted">${MAX_PHOTOS} photos maximum.</span>`}
          <span class="small muted" id="phstate"></span>
        </section>

        <section class="stack" style="gap:10px">
          <strong>Températures des produits</strong>
          ${st.produits.map(prodRow).join('')}
          <button type="button" class="btn" data-addprod style="align-self:flex-start">+ Ajouter un produit</button>
        </section>

        <section class="card pad stack" style="gap:6px">
          <strong>Contrôles</strong>
          ${CONTROLES.map((c) => `<label class="toggle"><input type="checkbox" data-ctrl="${c.id}" ${st.controles[c.id] ? 'checked' : ''}><span>${c.label}</span></label>`).join('')}
        </section>

        <section class="card pad stack" style="gap:10px">
          <label for="rm"><strong>Remarque / produit refusé (facultatif)</strong></label>
          <textarea id="rm" rows="3" class="notearea" placeholder="Ex. : carton de poulet refusé, à 9 °C">${esc(st.remarque)}</textarea>
        </section>

        <button type="submit" class="btn primary block" ${busy ? 'disabled' : ''}>${editId ? 'Enregistrer les modifications' : 'Enregistrer la livraison'}</button>
      </form>`;
  }

  function refreshBadge(i) {
    const p = st.produits[i];
    const el = view.querySelector(`[data-badge="${i}"]`);
    if (!el) return;
    const ok = p.temp === '' ? null : tempOk(p.cat, parseTemp(p.temp));
    el.innerHTML = ok === null ? `<span class="badge todo">${esc(CATEGORIES[p.cat].aide)}</span>`
      : ok ? '<span class="badge ok">OK</span>' : '<span class="badge alert">Trop chaud</span>';
  }

  async function addPhotos(files) {
    const state = view.querySelector('#phstate');
    const list = [...files].slice(0, MAX_PHOTOS - st.photos.length - st.existing.length);
    for (const [n, file] of list.entries()) {
      if (state) state.textContent = `Compression de la photo ${n + 1} / ${list.length}…`;
      try {
        const full = await compressImage(file, 1600, 300 * 1024);
        const thumb = await compressImage(file, 240, 15 * 1024);
        st.photos.push({ full, thumb, url: bytesToUrl(full) });
      } catch (e) {
        console.error(e);
        toast('Impossible de lire cette photo.');
      }
    }
    draw();
  }

  async function save() {
    readInputs();
    const fId = st.fournisseurId;
    const fNom = fId === '__autre' ? st.autre.trim() : (fournisseurs.find((f) => f.id === fId)?.nom || '');
    if (!fNom) { toast('Choisissez le fournisseur.'); return; }
    const produits = [];
    for (const p of st.produits) {
      const needT = CATEGORIES[p.cat].max !== null;
      const t = String(p.temp).trim() === '' ? null : parseTemp(p.temp);
      if (String(p.temp).trim() !== '' && t === null) { toast('Température illisible : vérifiez le chiffre.'); return; }
      if (t !== null && (t < -40 || t > 40)) { toast('Température bizarre : vérifiez le chiffre.'); return; }
      // La température est facultative : sans valeur, le produit n'est pas compté comme un problème.
      produits.push({ nom: p.nom.trim(), cat: p.cat, temp: needT ? t : null, ok: tempOk(p.cat, t) !== false });
    }
    const conforme = produits.every((p) => p.ok) && CONTROLES.every((c) => st.controles[c.id]);
    busy = true;
    const b = writeBatch(db);
    const rRef = editId ? doc(db, 'receptions', editId) : doc(collection(db, 'receptions'));
    removed.forEach((id) => b.delete(doc(db, 'photos', id)));
    const kept = st.existing.map((p) => ({ id: p.id, thumb: p.thumbBytes }));
    const added = st.photos.map((p) => {
      const pRef = doc(collection(db, 'photos'));
      b.set(pRef, { data: Bytes.fromUint8Array(p.full), receptionId: rRef.id, date: day, createdAt: serverTimestamp(), par: session.user.uid });
      return { id: pRef.id, thumb: Bytes.fromUint8Array(p.thumb) };
    });
    const photos = [...kept, ...added];
    const who = editId
      ? { par: original.par, parNom: original.parNom, heure: original.heure, at: original.at ?? null, modifiePar: session.user.prenom, modifieLe: Date.now() }
      : { heure: Date.now(), at: serverTimestamp(), par: session.user.uid, parNom: session.user.prenom };
    b.set(rRef, {
      date: day,
      ...who,
      fournisseurId: fId === '__autre' ? null : fId,
      fournisseurNom: fNom,
      produits,
      controles: { ...st.controles },
      conforme,
      remarque: st.remarque.trim(),
      photos,
      apresCoup: editId ? (original.apresCoup || false) : day !== today(),
    });
    // Pas d'« await » : hors ligne, l'envoi se fera au retour du réseau.
    b.commit().catch((e) => { console.error(e); toast(`Erreur d’enregistrement : ${e.message}`, 5000); });
    toast(conforme ? 'Livraison enregistrée.' : 'Livraison enregistrée : non conforme, prévenez la responsable.', 4000);
    location.hash = editId ? `#/reception/${editId}` : '#/reception';
  }

  view.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.day && t.dataset.day !== day) { readInputs(); day = t.dataset.day; draw(); }
    else if (t.dataset.cat) { readInputs(); st.produits[Number(t.dataset.i)].cat = t.dataset.cat; draw(); }
    else if (t.hasAttribute('data-addprod')) { readInputs(); st.produits.push({ nom: '', cat: 'frais', temp: '' }); draw(); }
    else if (t.dataset.delprod) { readInputs(); st.produits.splice(Number(t.dataset.delprod), 1); draw(); }
    else if (t.dataset.delold) { readInputs(); const [p] = st.existing.splice(Number(t.dataset.delold), 1); removed.push(p.id); URL.revokeObjectURL(p.url); draw(); }
    else if (t.dataset.delphoto) { readInputs(); const [p] = st.photos.splice(Number(t.dataset.delphoto), 1); URL.revokeObjectURL(p.url); draw(); }
  });
  view.addEventListener('input', (e) => {
    const row = e.target.closest('[data-prod]');
    if (row && e.target.matches('[data-temp]')) { const i = Number(row.dataset.prod); st.produits[i].temp = e.target.value; refreshBadge(i); }
  });
  view.addEventListener('change', (e) => {
    if (e.target.id === 'fo') { readInputs(); draw(); }
    else if (e.target.id === 'ph' && e.target.files?.length) { readInputs(); addPhotos(e.target.files); }
    else if (e.target.dataset.ctrl) st.controles[e.target.dataset.ctrl] = e.target.checked;
    else if (e.target.matches('[data-daypick]') && e.target.value && e.target.value <= today()) { readInputs(); day = e.target.value; draw(); }
  });
  view.addEventListener('submit', (e) => { e.preventDefault(); if (!busy) save(); });

  const un = onSnapshot(collection(db, 'fournisseurs'), (s) => {
    fournisseurs = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (loaded) readInputs();
    draw();
  });
  if (editId) {
    getDoc(doc(db, 'receptions', editId)).then((snap) => {
      if (!snap.exists()) { view.innerHTML = '<div class="card pad">Livraison introuvable. <a href="#/reception">Retour</a></div>'; return; }
      original = snap.data();
      day = original.date;
      st.fournisseurId = original.fournisseurId || '__autre';
      st.autre = original.fournisseurId ? '' : (original.fournisseurNom || '');
      st.produits = (original.produits || []).map((p) => ({ nom: p.nom || '', cat: p.cat || 'frais', temp: p.temp === null || p.temp === undefined ? '' : String(p.temp).replace('.', ',') }));
      if (!st.produits.length) st.produits = [{ nom: '', cat: 'frais', temp: '' }];
      st.controles = { ...st.controles, ...(original.controles || {}) };
      st.remarque = original.remarque || '';
      st.existing = (original.photos || []).map((p) => ({ id: p.id, thumbBytes: p.thumb, url: bytesToUrl(p.thumb) }));
      loaded = true;
      draw();
    });
  }
  draw();
  return () => { un(); st.photos.forEach((p) => URL.revokeObjectURL(p.url)); st.existing.forEach((p) => URL.revokeObjectURL(p.url)); };
}

// ---------- Détail d'une livraison ----------
function renderDetail(view, id, session) {
  const urls = [];
  let alive = true;
  view.innerHTML = '<p class="muted">Chargement…</p>';
  (async () => {
    const s = await getDoc(doc(db, 'receptions', id));
    if (!alive) return;
    if (!s.exists()) { view.innerHTML = '<div class="card pad">Livraison introuvable. <a href="#/reception">Retour</a></div>'; return; }
    const r = s.data();
    const prods = (r.produits || []).map((p) => `<tr>
      <td data-label="Produit">${esc(p.nom || '—')}</td><td data-label="Type">${esc(CATEGORIES[p.cat]?.label || '')}</td>
      <td data-label="Température">${p.temp === null || p.temp === undefined ? '—' : `<span class="badge ${p.ok ? 'ok' : 'alert'}">${esc(fmtTemp(p.temp))}</span>`}</td></tr>`).join('');
    view.innerHTML = `
      <div class="row" style="gap:8px"><a href="#/reception" class="iconbtn" aria-label="Retour">${icon('back', 24)}</a><h1 class="title">${esc(r.fournisseurNom)}</h1></div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <a class="btn" href="#/reception/modifier/${esc(id)}" style="text-decoration:none;color:inherit">Modifier</a>
        <button type="button" class="btn" data-delrec style="color:var(--alert)">Supprimer</button>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        ${r.conforme ? '<span class="badge ok">Conforme</span>' : '<span class="badge alert">Non conforme</span>'}
        <span class="muted">${esc(shortDate(dateFromKey(r.date)))}${r.heure ? ` à ${esc(hhmm(new Date(r.heure)))}` : ''} · enregistré par ${esc(r.parNom)}${r.modifiePar ? ` · modifié par ${esc(r.modifiePar)}` : ''}</span>
      </div>
      <section class="card"><table class="table resp"><thead><tr><th>Produit</th><th>Type</th><th>Température</th></tr></thead><tbody>${prods}</tbody></table></section>
      <section class="card pad stack" style="gap:6px"><strong>Contrôles</strong>
        ${CONTROLES.map((c) => `<span>${r.controles?.[c.id] ? '✓' : '✗'} ${esc(c.label)}</span>`).join('')}</section>
      ${r.remarque ? `<section class="card pad stack" style="gap:6px"><strong>Remarque</strong><span>${esc(r.remarque)}</span></section>` : ''}
      <section class="stack" style="gap:10px"><strong>Photos</strong><div class="photos big" id="phs">${(r.photos || []).map(() => '<div class="ph"><span class="muted small">Chargement…</span></div>').join('') || '<span class="muted">Aucune photo.</span>'}</div></section>`;
    view.querySelector('[data-delrec]').addEventListener('click', async () => {
      if (!window.confirm(`Supprimer la livraison « ${r.fournisseurNom} » et ses photos ? C’est définitif.`)) return;
      const b = writeBatch(db);
      (r.photos || []).forEach((p) => b.delete(doc(db, 'photos', p.id)));
      b.delete(doc(db, 'receptions', id));
      b.commit().catch((e) => { console.error(e); toast(`Suppression impossible : ${e.message}`, 5000); });
      toast('Livraison supprimée.');
      location.hash = '#/reception';
    });
    const box = view.querySelector('#phs');
    for (const [i, p] of (r.photos || []).entries()) {
      try {
        const ps = await getDoc(doc(db, 'photos', p.id));
        if (!alive) return;
        const url = ps.exists() ? bytesToUrl(ps.data().data) : bytesToUrl(p.thumb);
        urls.push(url);
        box.children[i].innerHTML = `<a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="Photo ${i + 1}"></a>`;
      } catch (e) {
        box.children[i].innerHTML = '<span class="small muted">Photo indisponible hors ligne.</span>';
      }
    }
  })();
  return () => { alive = false; urls.forEach((u) => URL.revokeObjectURL(u)); };
}
