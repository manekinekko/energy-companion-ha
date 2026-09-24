(function () {
  'use strict';
  const M = window.PacModel;
  const storageKey = 'pac-energy-lab-demo-v1';
  let state = M.fresh();
  let loadError = '';
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) state = M.validate(JSON.parse(saved));
  } catch (error) { loadError = `Scénario non chargé : ${error.message} Les données de démonstration sont utilisées.`; }
  const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
  const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  const n = value => value === null ? 'Non calculable' : nf.format(value);
  const money = value => euro.format(value);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const time = minutes => `${String(Math.floor(((minutes % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((minutes % 60) + 60) % 60).padStart(2, '0')}`;
  const date = value => new Date(`${value}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const icons = {
    overview: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    analysis: '<path d="M4 3v17h17M8 16v-5m5 5V6m5 10V9"/>',
    simulation: '<path d="M8 3h8M10 3v7l-6 9q-1 2 2 2h12q3 0 2-2l-6-9V3M8 15h8"/>',
    automation: '<path d="m13 2-9 12h7l-1 8 10-12h-7z"/>',
    reports: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7"/>',
    homeassistant: '<path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"/>'
  };
  const tabs = {
    overview: 'Vue d’ensemble', analysis: 'Analyses', simulation: 'Simulateurs',
    automation: 'Automatismes', reports: 'Rapports', homeassistant: 'Home Assistant'
  };
  const icon = key => `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24">${icons[key]}</svg>`;
  let current = Object.hasOwn(tabs, location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
  let generatedMonth = null;
  let toastTimer;
  function notify(text) {
    document.getElementById('toast').textContent = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { document.getElementById('toast').textContent = ''; }, 6500);
  }
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); }
    catch (error) { notify(`Sauvegarde locale impossible : ${error.message}. Exporte le scénario pour le conserver.`); }
  }
  function log(text) {
    state.history.unshift({ text, at: `Horloge démo ${time(state.clock)}` });
    state.history = state.history.slice(0, 100);
  }
  function heading(title, description, extra = '') {
    return `<div class="heading"><div><div class="eyebrow" style="margin-bottom:10px">Maison démo / Pompe à chaleur</div><h1>${title}</h1><p>${description}</p></div>${extra}</div>`;
  }
  function kpi(label, value, unit, detail) {
    return `<article class="card"><div class="kpi-label">${label}</div><div class="number">${value} <small>${unit}</small></div><p class="small muted space">${detail}</p></article>`;
  }
  function selectPeriod() {
    return `<label class="small">Période <select id="days" data-set="days" data-type="number">${[7, 30, 90].map(d => `<option value="${d}" ${state.days === d ? 'selected' : ''}>${d} derniers jours</option>`).join('')}</select></label>`;
  }
  function toggle(key, title, description = '', disabled = false) {
    return `<label class="toggle"><input id="${key}" data-set="${key}" type="checkbox" ${state[key] ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span>${title}${description ? `<span class="muted small" style="display:block">${description}</span>` : ''}</span></label>`;
  }
  function slider(key, title, min, max, step, unit) {
    return `<label class="field"><span>${title}<output id="${key}Out" for="${key}">${n(state[key])} ${unit}</output></span><input id="${key}" data-set="${key}" data-type="number" data-unit="${unit}" type="range" min="${min}" max="${max}" step="${step}" value="${state[key]}"></label>`;
  }
  function chart(rows, category = 'total') {
    const keys = category === 'total' ? ['heating', 'dhw', 'rod'] : [category];
    const width = 660, height = 215, x0 = 40, y0 = 10, plot = 166, usable = width - 50;
    const max = Math.max(1, ...rows.map(d => keys.reduce((v, k) => v + d[k], 0))) * 1.12;
    const step = usable / rows.length;
    let svg = `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Consommation électrique fictive en kilowattheures"><title>Énergie électrique de démonstration</title>`;
    for (let i = 0; i < 4; i++) {
      const value = max * i / 3, y = y0 + plot - value / max * plot;
      svg += `<line class="gridline" x1="${x0}" y1="${y}" x2="${width - 10}" y2="${y}"/><text x="0" y="${y + 4}">${n(value)}</text>`;
    }
    rows.forEach((d, i) => {
      let bottom = y0 + plot;
      keys.forEach(key => {
        const h = d[key] / max * plot;
        const css = key === 'heating' ? 'heat' : key;
        svg += `<rect class="${css}" x="${x0 + i * step + 1}" y="${bottom - h}" width="${Math.max(1, step - 3)}" height="${h}" rx="1"><title>${date(d.date)}, ${key === 'heating' ? 'chauffage compresseur' : key === 'dhw' ? 'ECS' : 'appoint'} : ${n(d[key])} kWh</title></rect>`;
        bottom -= h;
      });
    });
    [0, Math.floor((rows.length - 1) / 2), rows.length - 1].forEach(i => {
      svg += `<text x="${x0 + i * step + step / 2}" y="205" text-anchor="middle">${date(rows[i].date)}</text>`;
    });
    return svg + '</svg>';
  }
  const legend = '<div class="legend"><span><i class="swatch"></i>Compresseur chauffage</span><span><i class="swatch dhw"></i>Eau chaude</span><span><i class="swatch rod"></i>Appoint électrique</span></div>';
  function table(rows) {
    return `<div class="tablewrap"><table><caption class="sr-only">Données énergétiques fictives par jour</caption><thead><tr><th>Date</th><th>Chauffage</th><th>ECS</th><th>Appoint</th><th>Total kWh</th><th>Extérieur °C</th></tr></thead><tbody>${rows.map(d => `<tr><td>${date(d.date)}</td><td>${n(d.heating)}</td><td>${n(d.dhw)}</td><td>${n(d.rod)}</td><td>${n(d.total)}</td><td>${n(d.outside)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function recommendations() {
    const a = M.automation(state);
    const tips = [
      ['Comparer à météo équivalente', 'Une baisse entre deux semaines ne prouve pas une économie. Vérifie aussi la température extérieure et le confort demandé.'],
      [state.emitter === 'floor' ? 'Respecter l’inertie du plancher' : 'Éviter les absences trop courtes',
        `Le scénario protège le confort : il attend ${a.minHours} h d’absence avant de simuler un abaissement. Ce seuil pédagogique n’est pas un réglage universel.`],
      ['Surveiller l’appoint électrique', 'Distingue toujours résistance et compresseur. L’appoint peut être nécessaire au dégivrage ou au confort, il ne faut pas le désactiver arbitrairement.']
    ];
    if (!state.smartClimate) tips.push(['Courbe : un réglage à la fois', 'Sans capteurs de pièces, compare une seule modification et observe le confort avant une nouvelle itération.']);
    if (state.dhwTemperature < 55) tips.push(['ECS : garder les protections sanitaires', 'Le simulateur ne valide ni le risque sanitaire ni le programme d’hygiène. Aucun réglage réel ne doit être déduit de ce résultat seul.']);
    return tips.map(([title, text]) => `<div class="recommendation"><h3>${title}</h3><p>${text}</p></div>`).join('');
  }
  function overview() {
    const rows = M.data.slice(-state.days), total = M.summarize(rows, state.price), a = M.automation(state);
    return heading('Moins d’énergie. Le même confort.', 'Ton énergie, tes usages, ton confort. Un espace indépendant pour explorer ta pompe à chaleur.', selectPeriod()) +
      `<div class="grid kpis">${kpi('Électricité de la PAC', n(total.total), 'kWh', `${date(rows[0].date)} au 22 sept. 2026`)}${kpi('Coût au tarif du scénario', money(total.cost), '', `${n(state.price * 100)} centimes / kWh, hors abonnement`)}${kpi('COP de période', n(total.cop), '', 'Chaleur produite / électricité totale')}${kpi('Économies attribuables', 'Non calculées', '', 'Modèle de référence non disponible')}</div>
      <div class="grid cols"><section class="card"><div class="cardhead"><h2>Où part l’électricité ?</h2><span class="pill">${state.days} jours</span></div>${chart(rows)}${legend}<div class="notice">Historique fictif fixe. Les simulateurs ne réécrivent pas ces données.</div><button data-go="analysis">Explorer les analyses</button></section>
      <section class="card"><div class="cardhead"><h2>Répartition des usages</h2></div>${[['Chauffage, compresseur', total.heating], ['Eau chaude sanitaire', total.dhw], ['Appoint électrique', total.rod]].map(([label, v]) => `<div class="row"><div>${label}<div class="bar"><span style="width:${v / total.total * 100}%"></span></div></div><strong>${n(v)} kWh</strong></div>`).join('')}<div class="row"><span>Chaleur totale produite</span><strong>${n(total.thermal)} kWh</strong></div><div class="row"><span>Température extérieure moyenne</span><strong>${n(total.outside)} °C</strong></div><p class="small muted space">L’appoint est inclus dans l’électricité totale et la chaleur produite. Le COP n’est pas un SCOP certifié.</p></section></div>
      <div class="grid twocol"><section class="card"><div class="cardhead"><h2>Le confort, en contexte</h2><span class="pill">${a.away ? 'Tout le monde est absent' : 'Présence au domicile'}</span></div><div class="row"><span>Départ simulé</span><strong>${n(a.supply)} °C</strong></div><div class="row"><span>Géofencing</span><strong>${state.geofencing ? (a.reduce ? 'Réduit simulé' : 'Programme normal') : 'Désactivé'}</strong></div><div class="row"><span>Bouclage ECS</span><strong>${a.loopOff ? 'Arrêt simulé' : 'Programme normal'}</strong></div><p class="small muted space">État de simulation uniquement. Ni vanne, ni circulateur, ni PAC pilotés.</p><button class="space" data-go="automation">Jouer un scénario</button></section><section class="card"><h2>Conseils expliqués</h2>${recommendations()}</section></div>
      <details class="card"><summary>Pourquoi les économies ne sont-elles pas chiffrées ?</summary><p>Une économie attribuable aux automatismes demande une référence comparable, tenant compte de la météo, du confort et du logement. Ce modèle n’est pas disponible ici. Aucun coefficient forfaitaire n’est appliqué. Les écarts entre périodes et les estimations du simulateur ECS ne sont pas des économies mesurées.</p><p>Le tracé de la courbe de chauffe est vérifié séparément. Les autres modèles avancés restent des estimations locales non validées.</p></details>`;
  }
  function analysis() {
    const rows = M.data.slice(-state.days), previous = M.data.slice(-2 * state.days, -state.days);
    const total = M.summarize(rows, state.price), prev = M.summarize(previous, state.price);
    const delta = M.compare(total[state.category], prev[state.category]);
    const prediction = M.forecast(), forecastSum = M.summarize(prediction, state.price);
    return heading('Comprendre, puis comparer.', 'Historique, différences entre périodes et prévision pédagogique à sept jours.', `<div class="actions">${selectPeriod()}<button data-action="csv">Exporter CSV</button></div>`) +
      `<div class="grid twocol"><section class="card"><div class="cardhead"><h2>Consommation détaillée</h2><label class="small">Usage <select id="category" data-set="category">${Object.entries({ total: 'Tous les usages', heating: 'Compresseur chauffage', dhw: 'Eau chaude', rod: 'Appoint' }).map(([k, label]) => `<option value="${k}" ${state.category === k ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>${chart(rows, state.category)}${legend}<details><summary>Afficher les valeurs accessibles</summary>${table(rows)}</details></section>
      <section class="card"><h2>Comparaison des périodes</h2><div class="row"><span>Période actuelle</span><strong>${n(total[state.category])} kWh</strong></div><div class="row"><span>Période précédente, même durée</span><strong>${n(prev[state.category])} kWh</strong></div><div class="result"><div class="small">Variation de consommation</div><strong>${delta !== null && delta > 0 ? '+' : ''}${n(delta)}${delta === null ? '' : ' %'}</strong></div><div class="row"><span>Extérieur, période actuelle</span><strong>${n(total.outside)} °C</strong></div><div class="row"><span>Extérieur, période précédente</span><strong>${n(prev.outside)} °C</strong></div><div class="notice">Comparaison brute, non corrigée de la météo. Une variation n’est pas automatiquement une économie.</div></section></div>
      <section class="card"><div class="cardhead"><div><h2>Les sept prochains jours, en simulation</h2><p class="small muted">Du 23 au 29 septembre 2026 · météo fictive</p></div><span class="pill">${n(forecastSum.total)} kWh · ${money(forecastSum.cost)}</span></div>${chart(prediction)}${legend}<details><summary>Données et méthode de prévision</summary><p>Besoin chauffage = max(0 ; 19 − température extérieure) × 3,4 kWh thermiques/jour. Le modèle utilise ensuite un COP simplifié dépendant de la météo, un faible appoint et un usage ECS fictif. Aucune météo réelle ni calibration du logement n’est utilisée.</p>${table(prediction)}</details><div class="notice">Modèle local non validé. Aucune précision prédictive ni équivalence avec un service distant n’est revendiquée.</div></section>`;
  }
  const curveOptions = () => ({ room: state.curveRoom, variant: state.curveVariant });
  function curveChart() {
    const points = (slope, level) => Array.from({ length: 31 }, (_, i) => {
      const t = i - 10;
      return `${40 + i * 18},${175 - (M.curve(t, slope, level, curveOptions()) - 20) * 4}`;
    }).join(' ');
    return `<svg class="chart" viewBox="0 0 640 210" role="img" aria-label="Courbe de départ selon la température extérieure"><title>Formule de tracé vérifiée, limites de démonstration</title>${[20, 30, 40, 50].map(t => `<line class="gridline" x1="40" y1="${175 - (t - 20) * 4}" x2="580" y2="${175 - (t - 20) * 4}"/><text x="0" y="${179 - (t - 20) * 4}">${t} °C</text>`).join('')}<polyline points="${points(0.8, 0)}" fill="none" stroke="var(--cp-text-soft)" stroke-width="2" stroke-dasharray="5 4"/><polyline points="${points(state.slope, state.level)}" fill="none" stroke="var(--cp-brand-text)" stroke-width="3"/><text x="40" y="202">−10 °C extérieur</text><text x="500" y="202">20 °C</text></svg>`;
  }
  function simulation() {
    const result = M.dhw(state);
    return heading('Tester sans toucher à la PAC.', 'Deux simulateurs indépendants. Les réglages restent dans ce navigateur et ne sont jamais appliqués à un appareil.') +
      `<div class="grid twocol"><section class="card"><div class="cardhead"><h2>Calculateur eau chaude</h2><span class="pill">Estimation non validée</span></div>
      ${slider('dhwTemperature', 'Température simulée', 50, 60, 1, '°C')}${slider('dhwHours', 'Plage quotidienne de chauffe', 1, 24, 0.5, 'h')}${slider('volume', 'Volume journalier supposé', 50, 300, 10, 'L')}${slider('dhwCop', 'COP ECS supposé', 1, 5, 0.1, '')}
      <div class="result"><div class="small">Écart annuel estimé au scénario initial</div><strong id="dhwResult">${money(result.savedCost)}</strong><p class="small">${n(result.saved)} kWh/an · ${result.saved >= 0 ? 'baisse simulée' : 'surcoût simulé'}</p></div>
      <div class="metricpair"><div><div class="kpi-label">Référence</div><strong>${n(result.before)} kWh/an</strong></div><div><div class="kpi-label">Scénario</div><strong>${n(result.after)} kWh/an</strong></div></div>
      <details><summary>Hypothèses et formule</summary><p>Référence : 55 °C, 16,5 h/jour. Eau froide à 12 °C, local à 20 °C. Volume journalier identique, COP constant saisi, pertes thermiques nominales 1,8 kWh/jour à 55 °C pour 24 h.</p><p>Électricité/jour = [volume × 0,001163 × (température − 12) + 1,8 × (température − 20)/35 × heures/24] / COP. Le lien entre pertes et durée est une simplification, pas un modèle de ballon validé. L’estimation annuelle suppose 365 jours identiques.</p></details>
      <div class="notice">La température sanitaire et le cycle d’hygiène ne sont pas validés par ce calcul. Ne pas déduire de consigne réelle de cette simulation.</div>
      <button data-action="record-dhw">Conserver ce scénario</button></section>
      <section class="card"><div class="cardhead"><h2>Assistant courbe de chauffe</h2><span class="pill">Sans commande PAC</span></div>
      <p class="small muted">Formules de visualisation vérifiées. Compare ton scénario à la référence pente 0,8 / niveau 0, sans modifier le chauffage.</p>
      <label class="field"><span>Profil de courbe simulé</span><select id="curveVariant" data-set="curveVariant"><option value="standard" ${state.curveVariant === 'standard' ? 'selected' : ''}>Standard</option><option value="legacy-pac-0" ${state.curveVariant === 'legacy-pac-0' ? 'selected' : ''}>PAC ancienne génération, circuit 0</option></select></label>
      ${slider('curveRoom', 'Consigne ambiante du tracé', 16, 23, 0.5, '°C')}${slider('slope', 'Pente', 0.2, 1.6, 0.1, '')}${slider('level', 'Niveau', -5, 5, 1, 'K')}
      ${curveChart()}<div class="legend"><span>Pointillés : référence</span><span><i class="swatch"></i>Scénario</span></div>
      <div class="row"><span>Départ à 0 °C extérieur</span><strong id="curveAtZero">${n(M.curve(0, state.slope, state.level, curveOptions()))} °C</strong></div>
      <details><summary>Formule vérifiée et limites du tracé</summary><p>Avec d = extérieur − consigne ambiante : départ = consigne + niveau − (0,0002479 × d² + 0,021 × d + ${state.curveVariant === 'standard' ? '1,4347' : '1,148987'}) × pente × d${state.curveVariant === 'standard' ? '' : ' + 5'}. Calcul en simple précision, arrondi à l’entier, puis limitation.</p><p>Bornes de démonstration : 20 à 55 °C. Le profil et les bornes réels dépendent de l’installation. La concordance concerne la visualisation du client Android analysé, pas le régulateur de la PAC. Aucun gain de COP n’est promis.</p></details>
      <div class="actions space"><button data-action="comfort">Confort satisfaisant</button><button data-action="cold">Trop froid, restaurer</button><button data-action="reset-curve">Réinitialiser</button></div>
      <div class="notice">${state.smartClimate ? 'Capteurs de pièces simulés actifs. Le tracé ne remplace pas la coordination réelle entre courbe, vannes et débit minimal.' : 'Sans capteurs de pièces : les automatismes de pièce sont indisponibles dans le scénario.'}</div>
      </section></div><section class="card"><h2>Historique local des scénarios</h2>${history()}</section>`;
  }
  function history() {
    return state.history.length ? state.history.slice(0, 12).map(h => `<div class="row"><span>${esc(h.text)}</span><span class="small muted">${esc(h.at)}</span></div>`).join('') : '<p class="empty space">Aucune action enregistrée. Enregistre une simulation pour commencer.</p>';
  }
  function automation() {
    const a = M.automation(state);
    return heading('La bonne chaleur, au bon moment.', 'Simule une absence, un retour ou une aération. Les profils sont fictifs et aucune position GPS n’est collectée.',
      `<div class="actions"><span class="pill">Horloge démo : ${time(state.clock)}</span><button data-action="advance">Avancer de 15 min</button></div>`) +
      `<div class="grid twocol"><section class="card"><div class="cardhead"><h2>Présence et géofencing</h2><span class="pill">${a.away ? 'Tous absents' : 'À la maison'}</span></div>
      ${state.people.map((p, i) => `<div class="row"><div><strong>${p.name}</strong><div class="small muted">Profil fictif ${i + 1}</div></div><button data-person="${i}" aria-pressed="${p.home}">${p.home ? 'À la maison' : 'Absent'}</button></div>`).join('')}
      ${toggle('geofencing', 'Activer le géofencing simulé')}${toggle('lowerAway', 'Abaisser les consignes de 1 °C', 'Uniquement après une absence suffisamment longue.')}${toggle('stopLoop', 'Arrêter le bouclage ECS en absence', 'Ne concerne pas le circulateur du chauffage.')}
      ${slider('absenceHours', 'Durée d’absence supposée', 0, 24, 0.5, 'h')}
      <div class="result"><strong style="font-size:20px">${!state.geofencing ? 'Programme normal' : a.reduce ? 'Abaissement de 1 °C simulé' : a.away ? 'Programme maintenu' : 'Programme de présence'}</strong><p class="small space">${a.away && !a.reduce && state.geofencing ? `Le garde-fou de ce prototype attend ${a.minHours} h pour cet émetteur.` : 'Le retour d’un seul occupant suffit à rétablir le programme.'}</p></div>
      <div class="row"><span>Bouclage ECS</span><strong>${a.loopOff ? 'Arrêt simulé' : 'Normal'}</strong></div>
      <p class="small muted space">Le web seul ne garantit pas le GPS en arrière-plan. La cible HA utilisera des entités de présence autorisées.</p></section>
      <section class="card"><h2>Régulation et anticipation</h2>
      ${toggle('smartClimate', 'Capteurs de pièces connectés', 'Désactive-les pour tester les prérequis matériels.')}
      <label class="field"><span>Type d’émetteur</span><select id="emitter" data-set="emitter"><option value="floor" ${state.emitter === 'floor' ? 'selected' : ''}>Plancher chauffant</option><option value="radiator" ${state.emitter === 'radiator' ? 'selected' : ''}>Radiateurs</option></select></label>
      ${toggle('ihc', 'Contrôle intelligent illustratif', 'Demande de pièces et température de départ.', !state.smartClimate)}
      ${toggle('preheat', 'Anticiper l’heure de confort', '120 min/°C pour le plancher, 60 min/°C pour les radiateurs.', !state.smartClimate)}
      ${toggle('windowDetection', 'Simuler la détection de fenêtre', 'Pause de demande pendant 30 min d’horloge démo.', !state.smartClimate)}
      <label class="field"><span>Heure de confort souhaitée</span><input id="arrival" data-set="arrival" data-type="time" type="time" required value="${time(state.arrival)}"></label>
      <div class="result"><div class="small">Départ illustratif · extérieur fictif 8 °C</div><strong>${n(a.supply)} °C</strong><p class="small">${a.optimized ? 'Modulation pédagogique non validée' : 'Formule de tracé seule'} · référence ${n(a.baseFlow)} °C</p></div>
      <details><summary>Modèles utilisés, pas un régulateur réel</summary><p>Demande de pièce = écart de température positif × 70, limité à 100 %. Le départ illustratif vaut min(courbe de référence ; 25 + demande maximale × 0,15), avec une limite basse de 20 °C. L’anticipation utilise un délai fixe par degré, sans apprentissage réel.</p><p>Ces lois ne conviennent pas au pilotage direct d’une installation. La version HA devra gérer le débit, l’antigel, les cycles et les limites constructeur.</p></details></section></div>
      <section class="card"><div class="cardhead"><h2>Pièces et événements</h2><span class="pill">${state.smartClimate ? 'Capteurs simulés' : 'Accessoires absents'}</span></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">${a.rooms.map((r, i) => `<article class="card" style="background:var(--cp-surface-soft)"><h3>${r.name}</h3><div class="number">${n(r.temperature)} <small>°C fictifs</small></div><label class="field"><span>Consigne nominale</span><input id="room-${i}" data-room="${i}" type="number" min="16" max="23" step="0.5" value="${state.rooms[i].target}"></label><p class="small">Consigne effective : ${n(r.target)} °C<br>Demande simulée : ${r.demand} %</p><p class="small muted space">${r.window ? `Fenêtre détectée, pause jusqu’à ${time(r.windowUntil)}` : r.minutes ? `Préchauffage : ${time(r.start)}, avance ${r.minutes} min${r.preheating ? ' · actif à l’horloge démo' : ''}` : 'Préchauffage non requis ou désactivé'}</p><button class="space" data-window="${i}" ${!state.smartClimate || !state.windowDetection ? 'disabled' : ''}>${r.window ? 'Terminer l’aération' : 'Simuler une fenêtre ouverte'}</button></article>`).join('')}</div>
      <div class="notice">Il s’agit d’une pause de demande simulée, pas d’une fermeture de vanne. La version réelle doit préserver le débit minimal de la PAC.</div></section>`;
  }
  function reportMarkup(month) {
    const rows = M.monthly(month), t = M.summarize(rows, state.price);
    const label = new Date(`${month}-01T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return `<article class="reportbody"><div class="eyebrow">Energy Assistant Lab · Rapport de démonstration</div><h1 class="space">${esc(label)}</h1><p class="muted space">Données entièrement fictives. Document indépendant généré localement.</p><div class="notice">Ce document ne prouve aucune consommation réelle, économie ou performance d’une installation.</div>
      <div class="grid twocol">${kpi('Électricité', n(t.total), 'kWh', `${rows.length} jours fictifs`)}${kpi('Coût du scénario', money(t.cost), '', `${n(state.price * 100)} centimes/kWh, hors abonnement`)}${kpi('Chaleur produite', n(t.thermal), 'kWh', 'Modèle thermique pédagogique')}${kpi('COP de période', n(t.cop), '', 'Inclut l’appoint, ne vaut pas SCOP')}</div>
      <h2>Répartition électrique</h2><div class="row"><span>Compresseur chauffage</span><strong>${n(t.heating)} kWh</strong></div><div class="row"><span>ECS</span><strong>${n(t.dhw)} kWh</strong></div><div class="row"><span>Appoint</span><strong>${n(t.rod)} kWh</strong></div>
      <h2 class="spaced">Méthode et limites</h2><p class="small space">Historique synthétique généré par une fonction déterministe. Le coût applique le tarif courant du scénario à tout le mois, pas un tarif historique. Le COP est le rapport entre chaleur totale et électricité totale. Les réglages des simulateurs n’altèrent pas cet historique.</p>
      <h2 class="spaced">Valeurs quotidiennes</h2>${table(rows)}</article>`;
  }
  function reports() {
    return heading('Un bilan que tu peux conserver.', 'Génère un rapport mensuel fictif, puis imprime-le ou enregistre-le en PDF depuis le navigateur.') +
      `<section class="card"><div class="cardhead"><label>Mois complet <select id="month" data-set="month">${Array.from({ length: 8 }, (_, i) => {
        const value = `2026-${String(i + 1).padStart(2, '0')}`;
        return `<option value="${value}" ${state.month === value ? 'selected' : ''}>${new Date(`${value}-01T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</option>`;
      }).join('')}</select></label><div class="actions"><button class="primary" data-action="generate">Générer le rapport</button><button data-action="print" ${generatedMonth ? '' : 'disabled'}>Imprimer / PDF</button><button data-action="month-csv">CSV du mois</button></div></div><p class="small muted">Les mois proposés sont complets dans le jeu de données fictif. Les hypothèses de calcul sont documentées séparément.</p></section>
      <section class="card spaced" id="generatedReport">${generatedMonth ? reportMarkup(generatedMonth) : '<p class="empty">Choisis un mois et génère le bilan. Aucun service distant n’est appelé.</p>'}</section>`;
  }
  function homeassistant() {
    const features = [
      ['Rapports, comparaison et prévision', 'Simulés', 'Calculs déterministes et exports locaux.'],
      ['Calculateur ECS', 'Estimation locale', 'Modèle simplifié non validé, hypothèses visibles.'],
      ['Économies attribuables aux automatismes', 'Non calculées', 'Référence personnalisée indisponible. Aucun pourcentage forfaitaire.'],
      ['Tracé de courbe de chauffe', 'Formule vérifiée', 'Deux profils de visualisation, bornes de démonstration. Aucune commande.'],
      ['Préchauffage et modulation du départ', 'Simulés', 'Règles pédagogiques non validées pour le pilotage réel.'],
      ['Géofencing et fenêtres', 'Simulés', 'Présence et événements manuels, pas de collecte GPS.'],
      ['Famille et amis', 'Profils fictifs', 'Aucune authentification ou invitation réelle.'],
      ['Connexion Home Assistant', 'À développer', 'Entités et API non connectées dans ce prototype.'],
      ['Tarification dynamique et hystérésis ECS', 'Hors périmètre', 'Aucune optimisation horaire des tarifs ni modification d’hystérésis.']
    ];
    return heading('Pensé pour Home Assistant.', 'Cette première version valide les interactions. Le déploiement final se fera dans HA, après raccordement aux entités réelles.') +
      `<div class="grid twocol"><section class="card"><h2>Paramètres de démonstration</h2><label class="field"><span>Prix de l’électricité, EUR/kWh</span><input id="price" data-set="price" data-type="number" type="number" min="0" max="2" step="0.0001" value="${state.price}"></label><p class="small muted">Recalcule les coûts du scénario sur toute la période. Ce n’est pas une tarification historique.</p><div class="actions space"><button data-action="export">Exporter le scénario JSON</button><button data-action="import">Importer un scénario</button><input id="importFile" type="file" accept=".json,application/json" hidden></div><button class="space" data-action="reset">Réinitialiser la démonstration</button><p class="small muted space">Les paramètres sont conservés dans ce navigateur. Aucune donnée personnelle ni clé API n’est demandée.</p></section>
      <section class="card"><h2>Contrat d’intégration prévu</h2><div class="row"><span>Interface</span><strong>Lovelace</strong></div><div class="row"><span>Authentification</span><strong>Session HA</strong></div><div class="row"><span>Historique</span><strong>Statistiques HA</strong></div><div class="row"><span>Exécution automatique</span><strong>Côté HA</strong></div><div class="notice">Pas de déploiement effectué. Aucune entité détectée ou inventée. Les modèles et protections doivent être validés avant tout pilotage.</div><p class="small muted">Sources à raccorder : énergie électrique, chaleur produite, température extérieure, climat, eau chaude, présence et capteurs de pièces. Les fonctions absentes devront être marquées indisponibles.</p></section></div>
      <section class="card"><h2>Couverture fonctionnelle et limites</h2><div class="featurelist space">${features.map(([label, status, desc]) => `<div class="feature"><div><strong>${label}</strong><p class="small muted">${desc}</p></div><span class="pill">${status}</span></div>`).join('')}</div><a href="methodologie-calculs.md" download class="space" style="display:inline-block">Télécharger la méthodologie des calculs</a></section>`;
  }
  function render() {
    const focused = document.activeElement?.id;
    document.getElementById('nav').innerHTML = Object.entries(tabs).map(([key, label]) => `<a href="#${key}" data-go="${key}" ${current === key ? 'aria-current="page"' : ''}>${icon(key)}${label}</a>`).join('');
    document.getElementById('view').innerHTML = ({ overview, analysis, simulation, automation, reports, homeassistant })[current]();
    if (focused) document.getElementById(focused)?.focus({ preventScroll: true });
    document.getElementById('theme').textContent = document.documentElement.dataset.theme === 'dark' ? 'Mode clair' : 'Mode sombre';
  }
  function download(text, filename, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(`${filename} exporté. Données de démonstration uniquement.`);
  }
  function navigate(tab) {
    if (!Object.hasOwn(tabs, tab)) return;
    if (location.hash === `#${tab}`) { current = tab; render(); }
    else location.hash = tab;
  }
  window.addEventListener('hashchange', () => {
    const tab = location.hash.slice(1);
    current = Object.hasOwn(tabs, tab) ? tab : 'overview';
    render();
    document.getElementById('content').focus({ preventScroll: true });
  });
  document.addEventListener('input', event => {
    const element = event.target;
    if (element.matches('input[type=range][data-set]')) {
      const out = document.getElementById(`${element.dataset.set}Out`);
      if (out) out.textContent = `${n(Number(element.value))} ${element.dataset.unit || ''}`;
    }
  });
  document.addEventListener('change', async event => {
    const el = event.target;
    if (el.id === 'importFile') {
      const file = el.files[0];
      if (!file) return;
      try {
        if (file.size > 100000) throw new Error('Fichier trop volumineux (maximum 100 Ko).');
        state = M.validate(JSON.parse(await file.text()));
        generatedMonth = null; save(); render(); notify('Scénario importé. Aucune connexion externe.');
      } catch (error) { notify(`Import refusé : ${error.message}`); }
      return;
    }
    if (!el.dataset.set && el.dataset.room === undefined) return;
    if (!el.checkValidity() || (el.type === 'number' && el.value.trim() === '')) {
      el.setCustomValidity('Saisis une valeur dans les limites indiquées.');
      el.reportValidity();
      el.addEventListener('input', () => el.setCustomValidity(''), { once: true });
      return;
    }
    try {
      const next = JSON.parse(JSON.stringify(state));
      if (el.dataset.room !== undefined) next.rooms[Number(el.dataset.room)].target = Number(el.value);
      else {
        let value = el.type === 'checkbox' ? el.checked : el.value;
        if (el.dataset.type === 'number') value = Number(el.value);
        if (el.dataset.type === 'time') { const [h, m] = el.value.split(':').map(Number); value = h * 60 + m; }
        next[el.dataset.set] = value;
      }
      state = M.validate(next);
      if (el.dataset.set === 'month' || el.dataset.set === 'price') generatedMonth = null;
      save(); render();
    } catch (error) { notify(error.message); render(); }
  });
  document.addEventListener('click', event => {
    const el = event.target.closest('button');
    if (!el || el.disabled) return;
    if (el.id === 'theme') {
      document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('pac-energy-theme', document.documentElement.dataset.theme); }
      catch (error) { notify(`Thème non mémorisé : ${error.message}`); }
      const url = new URL(location.href);
      if (url.searchParams.has('scoutTheme')) {
        url.searchParams.set('scoutTheme', document.documentElement.dataset.theme);
        window.history.replaceState(null, '', url);
      }
      render(); return;
    }
    if (el.dataset.go) { navigate(el.dataset.go); return; }
    if (el.dataset.person !== undefined) {
      const person = state.people[Number(el.dataset.person)]; person.home = !person.home;
      log(`${person.name} : ${person.home ? 'retour simulé' : 'départ simulé'}`);
    } else if (el.dataset.window !== undefined) {
      const room = state.rooms[Number(el.dataset.window)];
      room.windowUntil = room.windowUntil > state.clock ? 0 : state.clock + 30;
      log(`${room.name} : ${room.windowUntil ? 'aération simulée pendant 30 min' : 'fin de l’aération'}`);
    } else {
      switch (el.dataset.action) {
        case 'csv': download(M.csv(M.data.slice(-state.days), state.price), 'pac-energie-demo.csv', 'text/csv;charset=utf-8'); return;
        case 'month-csv': download(M.csv(M.monthly(state.month), state.price), `pac-demo-${state.month}.csv`, 'text/csv;charset=utf-8'); return;
        case 'export': download(JSON.stringify(state, null, 2), 'pac-scenario-demo.json', 'application/json'); return;
        case 'import': document.getElementById('importFile').click(); return;
        case 'generate': generatedMonth = state.month; notify('Rapport mensuel fictif généré localement.'); break;
        case 'print':
          if (!generatedMonth) return;
          document.getElementById('printReport').innerHTML = reportMarkup(generatedMonth);
          window.print(); return;
        case 'advance': state.clock += 15; log(`Horloge avancée à ${time(state.clock)}`); break;
        case 'record-dhw': log(`ECS : ${state.dhwTemperature} °C, ${state.dhwHours} h, écart simulé ${money(M.dhw(state).savedCost)}/an`); notify('Scénario conservé localement. Aucune consigne envoyée.'); break;
        case 'comfort': log(`Confort déclaré satisfaisant : pente ${state.slope}, niveau ${state.level}`); notify('Retour de confort ajouté au journal local.'); break;
        case 'cold': state.slope = 0.8; state.level = 0; log('Trop froid : paramètres de courbe restaurés à 0,8 / 0'); break;
        case 'reset-curve': state.slope = 0.8; state.level = 0; state.curveRoom = 20; state.curveVariant = 'standard'; log('Courbe réinitialisée au profil standard'); break;
        case 'reset':
          if (!window.confirm('Réinitialiser uniquement les données de démonstration de ce navigateur ?')) return;
          state = M.fresh(); generatedMonth = null; notify('Démonstration réinitialisée.'); break;
        default: return;
      }
    }
    save(); render();
  });
  render();
  if (loadError || window.themeStorageError) notify([loadError, window.themeStorageError].filter(Boolean).join(' '));
})();
