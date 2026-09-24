import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const port = Number(process.env.PORT || 8767);
const roots = new Map([
  ['/pac_energy/', resolve('custom_components/pac_energy/www')],
  ['/tests/', resolve('tests')],
]);
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.md': 'text/markdown' };
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname === '/' ? '/tests/harness.html' : decodeURIComponent(url.pathname);
    const prefix = [...roots.keys()].find(p => path.startsWith(p));
    if (!prefix) { res.writeHead(404).end(); return; }
    const root = roots.get(prefix), file = resolve(root, path.slice(prefix.length));
    if (!file.startsWith(root + '/') || !types[extname(file)]) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[extname(file)] });
    res.end(await readFile(file));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error(error);
    if (!res.headersSent) res.writeHead(404);
    res.end();
  }
}).listen(port, '127.0.0.1', () => console.log(`Mock HA preview: http://127.0.0.1:${port}`));
