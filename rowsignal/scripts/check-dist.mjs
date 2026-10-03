// Post-build checks on the generated site. Fails (exit 1) on any problem.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(fileURLToPath(new URL('..', import.meta.url)), 'dist');
const problems = [];
const bad = (m) => problems.push(m);

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}
const htmlFiles = [];
for await (const f of walk(dist)) if (f.endsWith('.html')) htmlFiles.push(f);

const titles = new Map();
const descs = new Map();
const baseUrl = (process.env.VITE_SITE_URL ?? '').replace(/\/+$/, '');
for (const f of htmlFiles) {
  const rel = f.slice(dist.length);
  const html = await readFile(f, 'utf8');
  const isApp = rel.startsWith('/app/');
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1];
  const desc = /<meta name="description" content="([^"]*)"/.exec(html)?.[1];
  if (!title) bad(`${rel}: missing <title>`);
  if (!desc) bad(`${rel}: missing meta description`);
  if (title && rel !== '/404.html') {
    if (titles.has(title)) bad(`${rel}: duplicate title with ${titles.get(title)}`);
    titles.set(title, rel);
  }
  if (desc && !isApp && rel !== '/404.html') {
    if (descs.has(desc)) bad(`${rel}: duplicate description with ${descs.get(desc)}`);
    descs.set(desc, rel);
  }
  if (!/<html lang="en"/.test(html)) bad(`${rel}: missing html lang`);
  if (isApp) {
    if (!/<meta name="robots" content="noindex/.test(html)) bad(`${rel}: workspace must be noindex`);
    if (/<link rel="canonical"/.test(html)) bad(`${rel}: workspace must not have a canonical URL`);
    continue;
  }
  const h1s = (html.match(/<h1[ >]/g) ?? []).length;
  if (h1s !== 1) bad(`${rel}: expected exactly one <h1>, found ${h1s}`);
  const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1];
  if (baseUrl && rel !== '/404.html' && !canonical?.startsWith(baseUrl)) bad(`${rel}: canonical missing or not on ${baseUrl}`);
  if (!baseUrl && canonical) bad(`${rel}: canonical emitted without a configured production URL (${canonical})`);
  if (/localhost|127\.0\.0\.1/.test(html)) bad(`${rel}: development hostname in HTML`);
  // JSON-LD must parse and carry no fabricated ratings.
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const j = JSON.parse(m[1]);
      if (JSON.stringify(j).includes('aggregateRating') || JSON.stringify(j).includes('"review"')) bad(`${rel}: structured data contains ratings/reviews`);
    } catch {
      bad(`${rel}: invalid JSON-LD`);
    }
  }
  if (/adsbygoogle|googlesyndication|googletagmanager|google-analytics|<ins /.test(html)) bad(`${rel}: advertising/analytics markup present`);
  if (/ style="/.test(html)) bad(`${rel}: inline style attribute (would violate style-src 'self')`);
  if (/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>/.test(html)) bad(`${rel}: inline script`);
  // Subresources must be local (the canonical <link> and plain <a> links are not subresources).
  for (const m of html.matchAll(/<(?:script|img|iframe|embed|source)\b[^>]*\bsrc="(https?:\/\/[^"]+)"/g)) bad(`${rel}: external subresource ${m[1]}`);
  for (const m of html.matchAll(/<link\b[^>]*rel="(?:stylesheet|preload|modulepreload|icon)"[^>]*\bhref="(https?:\/\/[^"]+)"/g)) bad(`${rel}: external subresource ${m[1]}`);
}

const headers = await readFile(join(dist, '_headers'), 'utf8').catch(() => '');
if (!headers.includes("connect-src 'none'")) bad('_headers: workspace CSP must set connect-src none');
if (!headers.includes('X-Robots-Tag: noindex')) bad('_headers: workspace must send X-Robots-Tag noindex');
if (/unsafe-inline|unsafe-eval/.test(headers)) bad('_headers: CSP must not allow unsafe-inline or unsafe-eval');

const robots = await readFile(join(dist, 'robots.txt'), 'utf8').catch(() => '');
if (!robots.includes('User-agent')) bad('robots.txt missing');
const sitemap = await stat(join(dist, 'sitemap.xml')).catch(() => null);
if (baseUrl && !sitemap) bad('sitemap.xml missing although a production URL is configured');
if (!baseUrl && sitemap) bad('sitemap.xml written without a production URL');
if (baseUrl) {
  const sm = await readFile(join(dist, 'sitemap.xml'), 'utf8');
  if (/\/app/.test(sm)) bad('sitemap.xml must not list the workspace');
  if ((sm.match(/<loc>/g) ?? []).length !== 13) bad(`sitemap.xml should list 13 public pages, found ${(sm.match(/<loc>/g) ?? []).length}`);
}

// Every shipped script/style asset is local; the font is bundled.
for await (const f of walk(join(dist, 'assets'))) {
  if (f.endsWith('.js') || f.endsWith('.css')) {
    const t = await readFile(f, 'utf8');
    const m = t.match(/https?:\/\/(?!www\.w3\.org|react\.dev|localhost)[a-z0-9.-]+\.[a-z]{2,}[^\s"'`)]*/gi) ?? [];
    const external = [...new Set(m)].filter((u) => !/schema\.org|sitemaps\.org|openxmlformats|reactjs\.org|github\.com\/facebook|mozilla\.org|developer\.|fb\.me/.test(u));
    if (external.length) console.warn(`note: ${f.slice(dist.length)} mentions URLs (not requested at runtime): ${external.slice(0, 3).join(', ')}`);
  }
}

if (problems.length) {
  console.error('\nDist check FAILED:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log(`Dist check passed: ${htmlFiles.length} HTML files${baseUrl ? ` for ${baseUrl}` : ' (no production URL configured)'}.`);
