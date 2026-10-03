// Renders every public page to static HTML (using the SSR bundle and the real engine for the
// worked examples), then writes sitemap.xml, robots.txt, 404.html and the _headers file.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const baseUrl = (process.env.VITE_SITE_URL ?? '').replace(/\/+$/, '');

const manifest = JSON.parse(await readFile(join(dist, '.vite', 'manifest.json'), 'utf8'));
const entry = manifest['src/public-site/entry-client.tsx'];
if (!entry) throw new Error('Public client entry missing from the Vite manifest');

// Collect the CSS of the entry and of every chunk it imports.
const styles = new Set();
const seen = new Set();
const walk = (key) => {
  if (seen.has(key)) return;
  seen.add(key);
  const m = manifest[key];
  if (!m) return;
  for (const c of m.css ?? []) styles.add('/' + c);
  for (const i of m.imports ?? []) walk(i);
};
walk('src/public-site/entry-client.tsx');
const assets = { scripts: ['/' + entry.file], styles: [...styles] };

const ssr = await import(pathToFileURL(join(root, 'dist-ssr', 'entry-server.js')).href);
const write = async (rel, text) => {
  const file = join(dist, rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
};

const paths = ssr.ROUTES.map((r) => r.path);
for (const p of paths) await write(p === '/' ? 'index.html' : `${p.slice(1)}/index.html`, await ssr.renderPage(p, assets));
await write('404.html', await ssr.renderPage('/404', assets));

// robots + sitemap: absolute URLs only exist once the owner configures a verified production origin.
await write('robots.txt', `User-agent: *\nAllow: /\n${baseUrl ? `\nSitemap: ${baseUrl}/sitemap.xml\n` : ''}`);
if (baseUrl) {
  const urls = paths.map((p) => `  <url><loc>${baseUrl}${p === '/' ? '/' : p}</loc></url>`).join('\n');
  await write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
} else {
  console.warn('! VITE_SITE_URL is not set: no canonical URLs, Open Graph URLs or sitemap.xml were written.');
}

// Security headers (Netlify / Cloudflare Pages "_headers" format). The workspace may not make any
// network connection at all (connect-src 'none'); public pages may only talk to themselves.
const appCsp = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'none'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');
const publicCsp = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');
const common = [
  'X-Content-Type-Options: nosniff',
  'Referrer-Policy: no-referrer',
  'Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy: same-origin',
  'Cross-Origin-Resource-Policy: same-origin',
];
const block = (pattern, lines) => `${pattern}\n${lines.map((l) => `  ${l}`).join('\n')}\n`;
let headers = block('/*', common);
for (const p of paths) headers += block(p, [`Content-Security-Policy: ${publicCsp}`]);
headers += block('/404.html', [`Content-Security-Policy: ${publicCsp}`]);
headers += block('/app', [`Content-Security-Policy: ${appCsp}`, 'X-Robots-Tag: noindex, nofollow']);
headers += block('/app/*', [`Content-Security-Policy: ${appCsp}`, 'X-Robots-Tag: noindex, nofollow']);
headers += block('/assets/*', ['Cache-Control: public, max-age=31536000, immutable']);
await write('_headers', headers);

console.log(`Prerendered ${paths.length + 1} pages${baseUrl ? ` for ${baseUrl}` : ''}.`);
