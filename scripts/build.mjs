import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

execFileSync(process.execPath, ['demo/build.mjs'], { stdio: 'inherit' });
const base = 'custom_components/pac_energy';
await mkdir(`${base}/www/demo`, { recursive: true });
await copyFile('demo/model.js', `${base}/www/model.js`);
await copyFile('demo/index.html', `${base}/www/demo/index.html`);
await copyFile('demo/methodologie-calculs.md', `${base}/www/demo/methodologie-calculs.md`);
const template = await readFile('demo/template.html', 'utf8');
const css = template.match(/<style>([\s\S]*?)<\/style>/)[1]
  .replaceAll('html[data-theme="dark"]', ':host([dark])')
  .replaceAll(':root', ':host')
  .replaceAll('body', '.body');
await writeFile(`${base}/www/theme.mjs`, `// Generated from the standalone demo theme.\nexport default ${JSON.stringify(css)};\n`);

const labels = {
  en: {
    name: 'Installation name', electricity: 'Total electrical energy (including backup)',
    thermal: 'Produced thermal energy', heating: 'Heating electrical energy (detail)',
    dhw: 'Hot water electrical energy (detail)', backup: 'Backup electrical energy (detail)',
    outside: 'Outdoor temperature', room: 'Room temperature', climate: 'Climate entity (read-only)',
    presence: 'Presence entity (read-only)', same_scope: 'I confirm thermal and electrical counters cover the same equipment, including backup',
    tariff: 'Constant tariff estimate (EUR/kWh, optional)', profile: 'Explicit chart profile',
    minimum: 'Configured minimum supply temperature (°C)', maximum: 'Configured maximum supply temperature (°C)',
  },
  fr: {
    name: "Nom de l'installation", electricity: 'Énergie électrique totale (appoint inclus)',
    thermal: 'Chaleur produite', heating: 'Électricité chauffage (détail)',
    dhw: 'Électricité eau chaude (détail)', backup: 'Électricité appoint (détail)',
    outside: 'Température extérieure', room: 'Température de pièce', climate: 'Entité climat (lecture seule)',
    presence: 'Entité de présence (lecture seule)', same_scope: 'Je confirme que chaleur et électricité couvrent les mêmes équipements, appoint inclus',
    tariff: 'Tarif constant estimatif (EUR/kWh, facultatif)', profile: 'Profil explicite du tracé',
    minimum: 'Borne de départ minimale configurée (°C)', maximum: 'Borne de départ maximale configurée (°C)',
  },
};
const errors = {
  en: { invalid_config: 'Invalid configuration value.', missing: 'Entity not found.', invalid_value: 'Expected a finite non-negative energy value.',
    invalid_domain: 'Unsupported entity domain.', invalid_device_class: 'Wrong device class.',
    invalid_state_class: 'Energy needs total or total_increasing state class.',
    invalid_unit: 'Use Wh/kWh/MWh or °C/°F/K.', duplicate_source: 'Select a different source for each role.',
    bounds_pair: 'Provide both bounds or neither.', invalid_bounds: 'Minimum must not exceed maximum.' },
  fr: { invalid_config: 'Valeur de configuration invalide.', missing: 'Entité introuvable.', invalid_value: 'Valeur numérique finie attendue, énergie positive ou nulle.',
    invalid_domain: "Domaine d'entité non pris en charge.", invalid_device_class: 'Classe de mesure incorrecte.',
    invalid_state_class: "L'énergie doit avoir la classe total ou total_increasing.",
    invalid_unit: 'Utiliser Wh/kWh/MWh ou °C/°F/K.', duplicate_source: 'Choisir une source différente pour chaque rôle.',
    bounds_pair: 'Saisir les deux bornes ou aucune.', invalid_bounds: 'La borne minimale dépasse la maximale.' },
};
await mkdir(`${base}/translations`, { recursive: true });
for (const language of ['en', 'fr']) {
  const fr = language === 'fr';
  const form = { title: 'Energy Assistant', description: fr
    ? 'Lecture seule. Choisir des compteurs cumulatifs existants. Aucune commande ne sera envoyée. Unités énergie : Wh, kWh, MWh. Les bornes et le profil inconnus ne sont jamais déduits.'
    : 'Read-only. Select existing cumulative counters. No commands are sent. Energy units: Wh, kWh, MWh. Unknown bounds and profiles are never inferred.',
  data: labels[language] };
  const result = {
    title: 'Energy Assistant',
    config: { step: { user: form, reconfigure: form }, error: errors[language],
      abort: { reconfigure_successful: fr ? 'Configuration mise à jour.' : 'Configuration updated.' } },
    options: { step: { init: form }, error: errors[language] },
    selector: { profile: { options: { unknown: fr ? 'Inconnu (indisponible)' : 'Unknown (unavailable)',
      standard: 'Standard', 'legacy-pac-0': fr ? 'PAC ancienne génération, circuit 0' : 'Legacy heat pump, circuit 0' } } },
    entity: { sensor: Object.fromEntries(
      ['status', 'electricity', 'thermal', 'heating', 'dhw', 'backup', 'outside', 'room'].map(key => [
        key, key === 'status' ? { name: fr ? 'État' : 'Status',
          state: { ready: fr ? 'Prêt' : 'Ready', source_error: fr ? 'Vérifier les sources' : 'Check sources' } }
          : { name: labels[language][key] },
      ])
    ) },
  };
  const json = JSON.stringify(result, null, 2) + '\n';
  await writeFile(`${base}/translations/${language}.json`, json);
  if (!fr) await writeFile(`${base}/strings.json`, json);
}
