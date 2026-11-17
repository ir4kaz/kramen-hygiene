// Page « Aide » : contacter le développeur par SMS ou WhatsApp.
import { esc, icon } from '../util.js';

// ⇩ Numéro du développeur, au format international sans le 0 (ex. 33612345678 pour 06 12 34 56 78).
export const SUPPORT = {
  nom: 'Zacharie',
  tel: '33768126631',
};

const MESSAGE = 'Bonjour Zacharie, j’ai un souci avec l’appli hygiène K-Ramen : ';

export function supportLinks() {
  const msg = encodeURIComponent(MESSAGE);
  return {
    sms: `sms:+${SUPPORT.tel}?&body=${msg}`,
    whatsapp: `https://wa.me/${SUPPORT.tel}?text=${msg}`,
    affiche: `0${SUPPORT.tel.slice(2)}`.replace(/(\d{2})(?=\d)/g, '$1 '),
  };
}

export function renderAide(view) {
  const l = supportLinks();
  view.innerHTML = `
    <h1 class="title">Aide</h1>
    <section class="card pad stack" style="gap:14px;max-width:560px">
      <strong style="font-size:18px">Un problème avec l’appli ?</strong>
      <p class="muted" style="margin:0">Contactez ${esc(SUPPORT.nom)}, qui a créé l’appli. Expliquez ce qui ne marche pas et, si possible, envoyez une capture d’écran.</p>
      <a class="btn primary block" href="${esc(l.whatsapp)}" target="_blank" rel="noopener" style="text-decoration:none">${icon('chat', 22)} Écrire sur WhatsApp</a>
      <a class="btn block" href="${esc(l.sms)}" style="text-decoration:none;color:inherit">${icon('sms', 22)} Envoyer un SMS</a>
      <span class="small muted">Numéro : ${esc(l.affiche)}</span>
    </section>`;
}
