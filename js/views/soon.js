// Écrans pas encore développés.
import { esc, icon } from '../util.js';

export function renderSoon(view, { id, nav }) {
  const item = nav.find((n) => n.id === id) || { label: 'Page', icon: 'home' };
  view.innerHTML = `
    <h1 class="title">${esc(item.label)}</h1>
    <div class="card pad row" style="gap:16px">
      <span class="tile" style="min-height:auto;border:none;box-shadow:none;padding:0"><span class="icon">${icon(item.icon)}</span></span>
      <div class="stack" style="gap:4px">
        <strong>Bientôt disponible</strong>
        <span class="muted small">Cette partie arrive dans une prochaine version.</span>
      </div>
    </div>
    <a href="#/accueil" class="btn" style="align-self:flex-start;text-decoration:none;color:inherit">${icon('back', 20)} Retour à l’accueil</a>`;
}
