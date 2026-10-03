import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { runExample, type ExampleRun } from '../sample/runExample';
import { site } from '../site.config';
import { Layout } from './Layout';
import { DatesGuide, DuplicatesGuide, MatchingGuide } from './pages/Guides';
import { Home, HOME_FAQ } from './pages/Home';
import { AboutPage, BUILD_DATE, ContactPage, MethodologyPage, NotFoundPage, PrivacyPage, TermsPage } from './pages/Info';
import { CsvPage, ExcelPage, InventoryPage, MissingPage } from './pages/Tools';
import { NOT_FOUND, ROUTES, type RouteDef } from './routes';
import type { PageProps } from './types';

export { ROUTES, NOT_FOUND };

export interface Assets {
  scripts: string[];
  styles: string[];
}

const PAGES: Record<string, (p: PageProps) => React.ReactElement> = {
  '/': Home,
  '/compare-excel-files': ExcelPage,
  '/compare-csv-files': CsvPage,
  '/find-missing-rows': MissingPage,
  '/compare-inventory': InventoryPage,
  '/guides/how-spreadsheet-matching-works': MatchingGuide,
  '/guides/duplicate-keys-and-missing-records': DuplicatesGuide,
  '/guides/dates-numbers-and-leading-zeros': DatesGuide,
  '/privacy': PrivacyPage,
  '/terms': TermsPage,
  '/methodology': MethodologyPage,
  '/about': AboutPage,
  '/contact': ContactPage,
  '/404': NotFoundPage,
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jsonLd = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c');
const abs = (path: string) => `${site.baseUrl}${path}`;

function structuredData(route: RouteDef): unknown[] {
  if (!site.baseUrl) return [];
  const out: unknown[] = [];
  if (route.kind === 'home') {
    out.push({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: site.name,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Any (modern web browser)',
      description: site.description,
      url: abs('/'),
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    });
    const faq = HOME_FAQ.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: renderToStaticMarkup(<>{f.a}</>) },
    }));
    out.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq });
  } else if (route.kind !== 'notfound') {
    out.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: abs('/') },
        { '@type': 'ListItem', position: 2, name: route.label, item: abs(route.path) },
      ],
    });
    if (route.kind === 'guide') {
      out.push({ '@context': 'https://schema.org', '@type': 'TechArticle', headline: route.h1 ?? route.label, description: route.description, dateModified: BUILD_DATE, mainEntityOfPage: abs(route.path) });
    }
  }
  return out;
}

function head(route: RouteDef, assets: Assets): string {
  const url = site.baseUrl ? abs(route.path === '/404' ? '/' : route.path) : '';
  const noindex = route.kind === 'notfound';
  const og = [
    ['og:type', route.kind === 'guide' ? 'article' : 'website'],
    ['og:site_name', site.name],
    ['og:title', route.title],
    ['og:description', route.description],
    ...(url ? [['og:url', url]] : []),
    ...(site.baseUrl ? [['og:image', abs('/og-image.png')], ['og:image:width', '1200'], ['og:image:height', '630'], ['og:image:alt', 'RowSignal: Two spreadsheets. A clear answer.']] : []),
    ['twitter:card', site.baseUrl ? 'summary_large_image' : 'summary'],
    ['twitter:title', route.title],
    ['twitter:description', route.description],
  ];
  return [
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${esc(route.title)}</title>`,
    `<meta name="description" content="${esc(route.description)}" />`,
    noindex ? '<meta name="robots" content="noindex" />' : '',
    url && !noindex ? `<link rel="canonical" href="${esc(url)}" />` : '',
    '<meta name="referrer" content="no-referrer" />',
    '<meta name="theme-color" content="#2457d6" />',
    '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
    ...og.map(([k, v]) => `<meta ${k!.startsWith('og:') ? 'property' : 'name'}="${k}" content="${esc(v!)}" />`),
    ...assets.styles.map((href) => `<link rel="stylesheet" href="${href}" />`),
    ...structuredData(route).map((d) => `<script type="application/ld+json">${jsonLd(d)}</script>`),
  ]
    .filter(Boolean)
    .join('\n    ');
}

export async function loadRuns(ids: string[]): Promise<Record<string, ExampleRun>> {
  const out: Record<string, ExampleRun> = {};
  for (const id of ids) out[id] = await runExample(id);
  return out;
}

/** Render one public page to a complete HTML document. */
export async function renderPage(path: string, assets: Assets): Promise<string> {
  const route = path === '/404' ? NOT_FOUND : ROUTES.find((r) => r.path === path);
  const Page = PAGES[path];
  if (!route || !Page) throw new Error(`No page for ${path}`);
  const runs = await loadRuns(route.examples);
  const body = renderToString(
    <Layout route={route}>
      <Page runs={runs} />
    </Layout>,
  );
  return `<!doctype html>
<html lang="en">
  <head>
    ${head(route, assets)}
  </head>
  <body>
    <div id="root">${body}</div>
    ${assets.scripts.map((src) => `<script type="module" src="${src}"></script>`).join('\n    ')}
  </body>
</html>
`;
}

