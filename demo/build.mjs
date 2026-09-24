import { readFile, writeFile, access } from 'node:fs/promises';
const template = await readFile(new URL('./template.html', import.meta.url), 'utf8');
const model = await readFile(new URL('./model.js', import.meta.url), 'utf8');
const app = await readFile(new URL('./app.js', import.meta.url), 'utf8');
await writeFile(new URL('./index.html', import.meta.url), template.replace('/* MODEL */', model).replace('/* APP */', app));
await access(new URL('./methodologie-calculs.md', import.meta.url));
console.log('Standalone demo generated. Local methodology is available separately.');
