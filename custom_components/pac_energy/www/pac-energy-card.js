import './model.js';
import theme from './theme.mjs';
import { ENERGY_KEYS, energyValue, periodWindow, fetchStatistics, summarizePeriod, dailyRows, localDate } from './data.mjs?v=0.1.3';
import { fields, liveValue, scenarioValues, curveResult, dhwEstimate, automationResult } from './live.mjs?v=0.1.3';

const M = globalThis.PacModel;
const esc = value => String(value).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);
const number = value => Number.isFinite(value)
  ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value) : 'Indisponible';
const labels = {
  overview: 'Vue d’ensemble', analysis: 'Analyses', simulation: 'Simulateurs',
  automation: 'Automatismes', reports: 'Rapports mensuels', settings: 'Home Assistant',
};
const sourceLabels = {
  electricity: 'Électricité totale', thermal: 'Chaleur produite', heating: 'Chauffage (détail)',
  dhw: 'Eau chaude (détail)', backup: 'Appoint (détail)', outside: 'Extérieur',
  room: 'Pièce', climate: 'Climat', presence: 'Présence sélectionnée', window: 'Fenêtre sélectionnée',
  supply: 'Départ', return: 'Retour', dhw_current: 'Ballon ECS', cold_water: 'Eau froide',
  room_target: 'Consigne chauffage', dhw_target: 'Consigne ECS', curve_slope: 'Pente',
  curve_level: 'Décalage', dhw_performance: 'Performance ECS déclarée (pas un COP de période)',
};
const diagnostic = {
  missing: 'Entité absente', unavailable: 'Source indisponible', invalid_value: 'Valeur invalide',
  invalid_unit: 'Unité incompatible', invalid_domain: 'Domaine incompatible',
  invalid_device_class: 'Classe de mesure incompatible', invalid_state_class: 'Compteur cumulatif requis',
};
const css = `
  :host{display:block;--cp-surface:var(--ha-card-background,var(--card-background-color,#fff));
    --cp-bg:var(--primary-background-color,#f7f4ef);--cp-text:var(--primary-text-color,#242424);
    --cp-text-soft:var(--secondary-text-color,#5c5c5c);--cp-border:var(--divider-color,#dedede)}
  :host([dark]){--cp-surface:var(--ha-card-background,var(--card-background-color,#292929));
    --cp-bg:var(--primary-background-color,#3d3b3a);--cp-text:var(--primary-text-color,#dedede);
    --cp-text-soft:var(--secondary-text-color,#b0b0b0);--cp-border:var(--divider-color,#474747)}
  .body{padding:20px;border:1px solid var(--cp-border);border-radius:16px;background:var(--cp-bg)}
  header{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:20px}
  nav{grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:20px}
  nav button[aria-current=page]{background:var(--cp-brand-soft);border-color:var(--cp-brand-text)}
  nav button{min-width:0;overflow-wrap:anywhere}
  h1{font-size:28px}h2{margin-bottom:12px}p{overflow-wrap:anywhere}
  .grid.kpis{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
  .grid.twocol{grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))}
  .actions{margin:16px 0}.number{font-size:26px}.row{flex-wrap:wrap}
  .tablewrap th,.tablewrap td{white-space:normal;min-width:80px}
  .status{white-space:normal;text-align:right}.error{color:var(--cp-danger)}
  .bars{display:flex;align-items:flex-end;gap:3px;height:160px;margin:24px 0}
  .bars div{flex:1;min-width:1px;background:var(--cp-brand);border:1px solid var(--cp-brand-text)}
  .bars .missing{height:4px;background:var(--cp-surface);border-style:dashed}
  @media(max-width:500px){.body{padding:12px}header{align-items:flex-start}nav button{font-size:13px;padding:8px}.card{padding:16px}}
`;

export class PacEnergyCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.tab = 'overview';
    this.days = 7;
    this.overrides = {};
    this.history = [];
    this.generation = 0;
    this.shadowRoot.addEventListener('click', event => this.click(event));
    this.shadowRoot.addEventListener('change', event => this.change(event));
  }

  setConfig(config) {
    if (!config || typeof config.entity !== 'string' || !config.entity.startsWith('sensor.'))
      throw new Error('Choisir l’entité État de l’intégration Energy Assistant : entity: sensor.exemple_etat');
    if (config.demo !== undefined) throw new Error('La démo est séparée. Utiliser le lien dans Home Assistant.');
    this.overrides = {};
    this.history = [];
    this.config = { ...config };
    this.signature = undefined;
    this.series = undefined;
    this.window = undefined;
    this.generation++;
    this.render();
    if (this._hass) this.hass = this._hass;
  }

  set hass(hass) {
    this._hass = hass;
    this.toggleAttribute('dark', Boolean(hass.themes?.darkMode));
    if (!this.config) return;
    const contract = this.contract;
    if (contract && this.scenarioEntry !== contract.entry_id) {
      this.overrides = {};
      this.history = [];
      this.scenarioEntry = contract.entry_id;
    }
    const signature = JSON.stringify([
      contract, hass.config?.time_zone, hass.user?.id,
      Object.values(contract?.sources || {}).map(id => Boolean(hass.states[id])),
    ]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.series = undefined;
      this.window = undefined;
      this.generation++;
      if (contract && this.isConnected) this.load();
    }
    this.render();
  }

  get contract() {
    const state = this._hass?.states?.[this.config?.entity];
    const attributes = state?.attributes;
    return !['unavailable', 'unknown'].includes(state?.state) &&
      attributes?.contract_version === 1 && attributes?.read_only === true &&
      attributes.sources?.electricity && attributes.entry_id ? attributes : null;
  }

  connectedCallback() { if (this.contract) this.load(); }
  disconnectedCallback() { this.generation++; this.loading = false; }
  getCardSize() { return 12; }
  static getStubConfig(hass) {
    return { entity: Object.keys(hass.states).find(id => hass.states[id].attributes.contract_version === 1) || 'sensor.exemple_etat' };
  }

  async load() {
    const contract = this.contract;
    if (!contract || !this.isConnected) return;
    const generation = ++this.generation;
    this.loading = true;
    this.error = '';
    this.series = undefined;
    this.window = undefined;
    this.render();
    try {
      const window = periodWindow({
        days: this.days, month: this.tab === 'reports' ? this.month : undefined,
        timeZone: this._hass.config.time_zone,
      });
      const sources = Object.fromEntries(Object.entries(contract.sources).filter(([key]) =>
        !contract.input_errors?.[key] || contract.input_errors[key] === 'unavailable'));
      const series = await fetchStatistics(this._hass, sources, window);
      if (generation !== this.generation || !this.isConnected) return;
      this.window = window;
      this.series = series;
      this.loadedAt = new Date().toLocaleTimeString('fr-FR');
    } catch (error) {
      if (generation !== this.generation || !this.isConnected) return;
      this.error = error.message || String(error);
    }
    if (generation === this.generation) {
      this.loading = false;
      this.render();
    }
  }

  get result() {
    return this.series && this.window ? summarizePeriod(this.series, this.contract.sources, this.window, {
      tariff: this.contract.tariff_eur_kwh, sameScope: this.contract.same_scope,
    }) : {};
  }

  metric(label, value, unit = '') {
    return `<article class="card"><div class="kpi-label">${label}</div><div class="number">${number(value)} <small>${Number.isFinite(value) ? unit : ''}</small></div></article>`;
  }

  periodControls() {
    return `<div class="actions">${this.tab === 'reports'
      ? `<label>Mois terminé <input id="month" type="month" value="${esc(this.month || '')}" required></label>`
      : `<label>Jours complets <select id="days">${[7, 30, 90].map(n =>
        `<option value="${n}" ${this.days === n ? 'selected' : ''}>${n} jours</option>`).join('')}</select></label>`}
      <button data-action="refresh" ${this.loading ? 'disabled' : ''}>Actualiser les statistiques</button></div>
      <p class="small muted">${this.window ? `${this.window.startDate} inclus au ${this.window.endDate} exclu. Fuseau ${esc(this.window.timeZone)}. Lecture à ${esc(this.loadedAt)}.` : 'Périodes locales complètes uniquement, sans la journée en cours.'}</p>
      ${this.loading ? '<p role="status" class="notice">Chargement des statistiques HA…</p>' : ''}
      ${this.result.detailExceedsTotal?.length ? `<p role="alert" class="notice">Détail supérieur au total sur la même période : ${this.result.detailExceedsTotal.map(key => sourceLabels[key]).join(', ')}.
      Vérifier les périmètres et la qualité des sources. Valeurs conservées séparément, sans correction inventée.</p>` : ''}
      ${this.error ? `<p role="alert" class="notice error">Statistiques indisponibles : ${esc(this.error)}</p>` : ''}`;
  }

  overview() {
    const r = this.result, c = this.contract;
    return `<h2>Votre énergie, sans commande sur la PAC.</h2>${this.periodControls()}
      <div class="grid kpis space">${this.metric('Électricité de période', r.electricity, 'kWh')}
      ${this.metric('Estimation à tarif constant', r.cost, 'EUR')}
      ${this.metric('COP de période', r.cop)}
      <article class="card"><div class="kpi-label">Économies attribuables</div><div class="number">Non calculées</div></article></div>
      <p class="notice">Le coût n’est pas une facture historique. Hors abonnement, tarif constant configuré en EUR/kWh.
      Le COP nécessite des statistiques complètes sur les mêmes heures et la confirmation d’un périmètre thermique/électrique identique. Aucun ratio de compteurs cumulés n’est utilisé.</p>
      <div class="grid twocol"><section class="card"><h2>Compteurs en direct</h2>${ENERGY_KEYS.filter(k => c.sources[k]).map(key =>
        `<div class="row"><span>${sourceLabels[key]}</span><strong>${number(energyValue(this._hass.states[c.sources[key]]))} kWh</strong></div>`).join('')}
      <p class="small muted space">Index cumulatifs, pas une consommation de période. L’appoint n’est jamais ajouté au total sélectionné.</p></section>
      <section class="card"><h2>Confort et réglages en direct</h2>${['outside', 'room', 'supply', 'return', 'room_target', 'curve_slope', 'curve_level', 'dhw_target', 'dhw_current', 'dhw_performance', 'climate', 'presence', 'window'].filter(key => c.sources[key]).map(key => {
        const state = this._hass.states[c.sources[key]];
        const value = state && !c.input_errors?.[key] && !['unknown', 'unavailable'].includes(state.state) ? `${state.state} ${state.attributes.unit_of_measurement || ''}` : 'Indisponible';
        return `<div class="row"><span>${sourceLabels[key]}</span><strong>${esc(value)}</strong></div>`;
      }).join('')}<p class="small muted space">États HA sélectionnés uniquement. Aucune géolocalisation collectée.</p></section></div>`;
  }

  analysis() {
    const r = this.result;
    return `<h2>Comprendre, puis comparer.</h2>${this.periodControls()}
      <div class="grid kpis space">${this.metric('Électricité actuelle', r.electricity, 'kWh')}
      ${this.metric('Période précédente', r.previous, 'kWh')}${this.metric('Variation brute', r.change, '%')}</div>
      <p class="notice">Une variation n’est pas une économie. Comparaison non corrigée de la météo.
      Une heure absente, un compteur décroissant ou une borne manquante rend le total indisponible.</p>
      ${this.historyTable()}<section class="card spaced"><h2>Prévisions</h2><p>Indisponibles en mode réel. Pas de météo ni de modèle calibré. La démo séparée contient une prévision fictive.</p></section>`;
  }

  historyTable() {
    if (!this.series || !this.window) return '<p class="empty space">Aucun historique complet chargé.</p>';
    const rows = dailyRows(this.series, this.contract.sources, this.window);
    const max = Math.max(1, ...rows.map(r => r.electricity || 0));
    return `<section class="card space"><h2>Énergie quotidienne</h2>
      <div class="bars" aria-hidden="true">${rows.map(r => `<div class="${r.electricity === null ? 'missing' : ''}"
        style="${r.electricity === null ? '' : `height:${r.electricity / max * 100}%`}"
        title="${r.date}: ${number(r.electricity)} kWh"></div>`).join('')}</div>
      <div class="actions"><button data-action="csv">Exporter CSV réel</button></div>
      <div class="tablewrap"><table><caption>Statistiques HA, kWh. Vide signifie indisponible dans le CSV.</caption>
      <thead><tr><th>Date</th>${ENERGY_KEYS.map(k => `<th>${sourceLabels[k]}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr><td>${r.date}</td>${ENERGY_KEYS.map(k => `<td>${number(r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
  }

  get scenario() { return scenarioValues(this._hass, this.contract, this.overrides); }

  field(key) {
    const { role, label, min, max, step } = fields[key];
    const state = this._hass.states[this.contract.sources[role]];
    const baseline = role ? liveValue(this._hass, this.contract, role) : null;
    const edited = Object.hasOwn(this.overrides, key), value = this.scenario[key];
    return `<label class="field"><span>${label}${edited ? ' : hypothèse locale' : ''}</span><input id="${key}" data-scenario="${key}"
      type="number" min="${min}" max="${max}" step="${step}" value="${value === null ? '' : Number(value.toFixed(4))}"
      placeholder="Indisponible"><small>${role
        ? `HA : ${number(baseline)}. ${esc(state?.entity_id || this.contract.sources[role] || 'Source non configurée')}. Mise à jour : ${esc(state?.last_updated || 'indisponible')}.`
        : 'Hypothèse à saisir explicitement, aucune valeur par défaut.'}
      ${edited ? 'Effacer pour suivre de nouveau HA.' : ''}</small></label>`;
  }

  simulation() {
    const s = this.scenario, c = this.contract.curve;
    const baseline = scenarioValues(this._hass, this.contract, {});
    const d = dhwEstimate(s, baseline.dhwTemperature), curve = curveResult(M, s, c);
    return `<h2>Tester sans toucher à la PAC.</h2><p class="notice">SCÉNARIO LOCAL NON ACTUANT. Les champs suivent les sources HA sélectionnées jusqu’à votre modification. Les hypothèses locales restent séparées des réglages réels. Aucun bouton ne commande un appareil.</p>
      <div class="actions"><button data-action="reset-live">Revenir aux valeurs HA</button></div>
      <div class="grid twocol"><section class="card"><h2>Courbe de chauffe</h2>
      <p>Profil configuré : ${esc(c?.profile || 'unknown')}. Bornes : ${number(c?.minimum)} / ${number(c?.maximum)} °C.</p>
      ${['outside', 'slope', 'level', 'curveRoom'].map(key => this.field(key)).join('')}
      <div class="result"><span>Tracé du scénario : </span><strong id="curve-result">${number(curve)} ${curve === null ? '' : '°C'}</strong></div>
      <p>Tracé avec les entrées HA actuelles : ${number(curveResult(M, baseline, c))} °C.
      Départ mesuré : ${number(liveValue(this._hass, this.contract, 'supply'))} °C (pas une validation du tracé).</p>
      <p class="small">Profil ou bornes inconnus : tracé indisponible. Aucun remplacement par les bornes de démo 20 à 55 °C. Formule de visualisation, pas loi de commande matérielle.</p>
      <button data-action="save-curve">Conserver le scénario de courbe</button></section>
      <section class="card"><h2>Calculateur eau chaude</h2><p>Consigne HA : ${number(baseline.dhwTemperature)} °C.
      Ballon mesuré : ${number(liveValue(this._hass, this.contract, 'dhw_current'))} °C.
      Chauffage de l’eau uniquement, sans pertes ni programmation sanitaire.</p>
      ${['dhwTemperature', 'coldWater', 'volume', 'dhwCop'].map(key => this.field(key)).join('')}
      <div class="result">Chaleur théorique : ${number(d.thermal)} kWh/j. Électricité estimée : ${number(d.electricity)} kWh/j.
      Écart estimé à la consigne HA, mêmes hypothèses : ${number(d.difference)} kWh/j.</div>
      <p class="small">Le volume, l’eau froide et le COP doivent être connus ou saisis comme hypothèses. Un facteur de performance saisonnier n’est jamais utilisé comme COP ECS. Pas d’économies annuelles extrapolées.</p>
      <p class="notice">Ne valide ni la température sanitaire ni le cycle d’hygiène. Ne pas en déduire une consigne réelle.</p>
      <button data-action="save-dhw">Conserver le scénario ECS</button></section></div>${this.scenarioHistory()}`;
  }

  automation() {
    const s = this.scenario, a = automationResult(s);
    const context = (key, label) => {
      const value = liveValue(this._hass, this.contract, key);
      const selected = Object.hasOwn(this.overrides, key) ? String(s[key]) : '';
      return `<label class="field"><span>${label}. HA : ${value === null ? 'Indisponible' : value ? 'Oui' : 'Non'}</span>
      <select id="${key}" data-context="${key}">${[['', 'Suivre HA'], ['true', 'Oui, hypothèse'], ['false', 'Non, hypothèse']].map(([v, text]) =>
        `<option value="${v}" ${selected === v ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
    };
    const result = { window: 'Fenêtre ouverte : pause hypothétique', present: 'Présence sélectionnée : consigne maintenue',
      absent: 'Absence sélectionnée : abaissement hypothétique', unavailable: 'Indisponible : compléter les entrées de la règle' }[a.state];
    return `<h2>Automatismes : simulation uniquement.</h2>
      <p class="notice">Contexte HA sélectionné, sans personnes ni pièces inventées. Une source de présence ne prouve pas l’absence de tout le foyer. Pas de service, vanne, cycle sanitaire ou programme de chauffe modifié.</p>
      <div class="actions"><button data-action="reset-live">Revenir aux valeurs HA</button></div>
      <section class="card"><h2>Règle locale de présence et d’aération</h2>
      ${context('presence', 'Présence sélectionnée')}${context('window', 'Fenêtre ouverte')}
      ${this.field('curveRoom')}${this.field('setback')}
      <p class="result">${result}. Consigne hypothétique : ${number(a.target)} °C.</p>
      <p>Température de pièce mesurée : ${number(liveValue(this._hass, this.contract, 'room'))} °C.
      Anticipation de chauffe indisponible : aucun modèle thermique calibré. Aucun temps de retour inventé.</p>
      <button data-action="save-automation">Conserver la règle simulée</button></section>
      <p class="small space">Le laboratoire séparé conserve les expériences fictives avancées (horloge, pièces, modulation et programmation).</p>${this.scenarioHistory()}`;
  }

  scenarioHistory() {
    return `<section class="card spaced"><h2>Historique local de cette carte</h2>
      <p class="small">Scénarios en mémoire jusqu’au rechargement. L’export contient les valeurs HA de référence et vos hypothèses, sans identifiants d’entités ni noms de personnes. Traitez ce fichier comme des données privées.</p>
      <div class="actions"><button data-action="scenario-export">Exporter les scénarios JSON</button></div>
      ${this.history.length ? this.history.map(h => `<div class="row"><span>${esc(h.text)}</span><span>${esc(h.at)}</span></div>`).join('') : '<p>Aucun scénario conservé.</p>'}</section>`;
  }

  reports() {
    const r = this.result;
    return `<h2>Rapport mensuel réel</h2>${this.periodControls()}
      <p class="notice">Export de statistiques HA, pas une facture ni un certificat de performance. Le mois précédent peut avoir un nombre de jours différent.</p>
      <div class="grid kpis space">${this.metric('Électricité', r.electricity, 'kWh')}
      ${this.metric('Chaleur', r.thermal, 'kWh')}${this.metric('COP du mois', r.cop)}
      ${this.metric('Coût estimatif constant', r.cost, 'EUR')}</div>${this.historyTable()}`;
  }

  settings() {
    const c = this.contract;
    return `<h2>Configuration et limites</h2><section class="card"><p>Modifier les entités, le tarif, le périmètre et les bornes dans Paramètres / Appareils et services / Energy Assistant / Configurer. L’interface utilise votre session HA.</p>
      ${Object.entries(c.sources).map(([key, value]) => `<div class="row"><span>${esc(sourceLabels[key] || key)}</span><code>${esc(value)}</code></div>`).join('')}
      <p class="notice">Le total électrique doit couvrir la PAC et son appoint. Les détails ne sont jamais additionnés au total.
      Aucun pilotage réel n’est disponible dans cette version.</p>
      <p>Les statistiques restent dans Recorder. Les copies de compteurs Energy Assistant n’enregistrent pas de nouvelles statistiques longue durée. Les données réelles ne sont pas persistées automatiquement dans le navigateur.</p>
      <div class="actions"><a href="/pac_energy/demo/index.html" target="_blank" rel="noopener">Ouvrir le laboratoire séparé (DONNÉES FICTIVES)</a></div>
      <a href="/pac_energy/demo/methodologie-calculs.md" download>Méthodologie des simulateurs</a>
      <p class="small space">L’interface est en français. Les formulaires et capteurs HA sont traduits en français et en anglais.</p></section>`;
  }

  render() {
    const focused = this.shadowRoot.activeElement?.id;
    const contract = this.contract;
    this.shadowRoot.innerHTML = `<style>${theme}\n${css}</style><div class="body">
      <header><div><div class="eyebrow">Lecture seule</div><h1>Energy Assistant</h1></div><span class="pill status">DONNÉES HA<br>Scénarios séparés</span></header>
      ${contract ? `<nav aria-label="Navigation Energy Assistant">${Object.entries(labels).map(([key, label]) =>
        `<button data-tab="${key}" ${key === this.tab ? 'aria-current="page"' : ''}>${label}</button>`).join('')}</nav>
      ${Object.keys(contract.input_errors || {}).length ? `<p role="alert" class="notice">Sources à vérifier : ${Object.entries(contract.input_errors).map(([key, error]) =>
        `${esc(sourceLabels[key] || key)} : ${esc(diagnostic[error] || error)}`).join(' ; ')}.</p>` : ''}
      ${this[this.tab]()}`
      : '<p role="alert" class="notice">Entité État Energy Assistant absente, inaccessible ou incompatible. Configurer l’intégration puis sélectionner son entité État. Aucune donnée de démonstration n’est utilisée.</p>'}
      ${this.message ? `<p role="status" class="notice">${esc(this.message)}</p>` : ''}
      </div>`;
    if (focused) this.shadowRoot.getElementById(focused)?.focus({ preventScroll: true });
  }

  log(text) {
    this.history.unshift({ text, at: new Date().toISOString(),
      baseline: scenarioValues(this._hass, this.contract, {}), overrides: { ...this.overrides },
      values: this.scenario, curve: { ...this.contract.curve } });
    this.history = this.history.slice(0, 100);
  }

  download(text, name, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  click(event) {
    const el = event.target.closest('button');
    if (!el || el.disabled) return;
    if (el.dataset.tab) {
      const old = this.tab;
      this.tab = el.dataset.tab;
      if (this.tab === 'reports' && !this.month) {
        const current = localDate(Date.now(), this._hass.config.time_zone).slice(0, 7);
        const date = new Date(`${current}-01T12:00:00Z`);
        date.setUTCMonth(date.getUTCMonth() - 1);
        this.month = date.toISOString().slice(0, 7);
      }
      if ((old === 'reports') !== (this.tab === 'reports')) this.load();
    } else {
      const s = this.scenario;
      switch (el.dataset.action) {
        case 'refresh': this.load(); break;
        case 'save-curve': this.log(`Courbe simulée : pente ${s.slope}, niveau ${s.level}`); break;
        case 'save-dhw': this.log(`ECS simulée : ${number(s.dhwTemperature)} °C`); break;
        case 'save-automation': this.log('Règle locale simulée'); break;
        case 'reset-live': this.overrides = {}; this.message = 'Hypothèses effacées, suivi des sources HA rétabli.'; break;
        case 'scenario-export':
          this.download(JSON.stringify({ read_only: true, at: new Date().toISOString(),
            baseline: scenarioValues(this._hass, this.contract, {}), overrides: this.overrides,
            values: s, curve: this.contract.curve, history: this.history }, null, 2),
          'energy-assistant-scenario-local.json', 'application/json'); break;
        case 'csv': {
          if (!this.series || !this.window) return;
          const rows = dailyRows(this.series, this.contract.sources, this.window);
          const csv = ['date,' + ENERGY_KEYS.map(k => `${k}_kWh`).join(','),
            ...rows.map(r => [r.date, ...ENERGY_KEYS.map(k => r[k] === null ? '' : r[k])].join(','))].join('\n');
          this.download(csv, `energy-assistant-live-${this.window.startDate}.csv`, 'text/csv;charset=utf-8');
          break;
        }
        default: return;
      }
    }
    this.render();
  }

  change(event) {
    const el = event.target;
    if (!el.checkValidity()) { el.reportValidity(); return; }
    if (el.dataset.context) {
      if (el.value === '') delete this.overrides[el.dataset.context];
      else this.overrides[el.dataset.context] = el.value === 'true';
      this.render(); return;
    }
    if (el.id === 'days') { this.days = Number(el.value); this.load(); return; }
    if (el.id === 'month') { this.month = el.value; this.load(); return; }
    if (el.dataset.scenario) {
      if (!el.value.trim()) delete this.overrides[el.dataset.scenario];
      else this.overrides[el.dataset.scenario] = Number(el.value);
      this.message = '';
      this.render();
    }
  }
}

if (!customElements.get('pac-energy-card')) customElements.define('pac-energy-card', PacEnergyCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'pac-energy-card', name: 'Energy Assistant',
  description: 'Énergie PAC réelle en lecture seule, simulations locales séparées.',
});
