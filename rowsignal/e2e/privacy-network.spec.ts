import { expect, test } from '@playwright/test';
import { addSampleFiles, configureSampleRules } from './helpers/app';

const ORIGIN = 'http://localhost:4173';
const SENSITIVE = ['orders.csv', 'dispatch.csv', '1001', 'TAG-A', 'PEN', 'Weekly', 'mug'];

test('real-file processing makes no data-related network traffic, loads no third-party scripts, and logs nothing sensitive', async ({ page, request }) => {
  const requests: Array<{ url: string; method: string; body: string | null }> = [];
  const consoleLines: string[] = [];
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
  page.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => consoleLines.push(`pageerror: ${e.message}`));
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });

  const res = await page.goto('/app/');
  const csp = res!.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("connect-src 'none'");
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("default-src 'none'");
  expect(res!.headers()['x-robots-tag']).toContain('noindex');

  await addSampleFiles(page);
  await configureSampleRules(page);
  await page.getByTestId('compare-btn').click();
  await page.getByTestId('results').waitFor();
  await page.getByRole('button', { name: /Open details for 1004/ }).click();
  await page.keyboard.press('Escape');
  await page.getByTestId('export-open').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-go').click()]);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);

  // Every request went to this origin as a plain GET for a static asset — none carries data.
  for (const r of requests) {
    if (r.url.startsWith('blob:') || r.url.startsWith('data:')) continue;
    expect(new URL(r.url).origin, r.url).toBe(ORIGIN);
    expect(r.method, r.url).toBe('GET');
    expect(r.body, r.url).toBeNull();
    const u = new URL(r.url);
    expect(u.search, r.url).toBe('');
    for (const s of SENSITIVE) expect(decodeURIComponent(r.url), `request URL leaked ${s}`).not.toContain(s);
  }
  // No third-party scripts, frames or stylesheets are present in the workspace DOM.
  const external = await page.evaluate(() =>
    [...document.querySelectorAll('script[src],link[href],iframe,img[src],embed,object')].map((e) => (e as HTMLElement).getAttribute('src') ?? (e as HTMLElement).getAttribute('href') ?? '').filter((u) => /^(https?:)?\/\//.test(u) && !u.startsWith(location.origin)),
  );
  expect(external).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);

  // Nothing sensitive (or any warning/error) reached the console.
  const joined = consoleLines.join('\n');
  for (const s of SENSITIVE) expect(joined).not.toContain(s);
  expect(consoleLines.filter((l) => l.startsWith('error') || l.startsWith('warning') || l.startsWith('pageerror'))).toEqual([]);

  // The worker script is served with a policy that forbids any network connection from the worker.
  const workerUrl = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('engine.worker')));
  expect(workerUrl).toBeTruthy();
  const workerRes = await request.get(workerUrl!);
  expect(workerRes.headers()['content-security-policy']).toContain("connect-src 'none'");

  // The address bar never held anything about the files.
  expect(page.url()).toBe(`${ORIGIN}/app/`);
});

test('the public pages load no third-party or advertising scripts, and entering the workspace is a hard navigation', async ({ page }) => {
  const hosts = new Set<string>();
  page.on('request', (r) => hosts.add(new URL(r.url()).origin));
  for (const path of ['/', '/compare-excel-files', '/guides/how-spreadsheet-matching-works', '/privacy']) {
    await page.goto(path);
    const html = await page.content();
    for (const needle of ['adsbygoogle', 'googlesyndication', 'googletagmanager', 'google-analytics', 'doubleclick', 'hotjar', 'fullstory']) expect(html).not.toContain(needle);
    expect(await page.locator('ins, [data-ad-slot], .ad-slot').count()).toBe(0);
  }
  expect([...hosts]).toEqual([ORIGIN]);

  // A script-global set on the public page must NOT survive entering the workspace.
  await page.goto('/');
  await page.evaluate(() => ((window as unknown as { __publicMarker: number }).__publicMarker = 1));
  await page.getByRole('link', { name: 'Compare my files' }).first().click();
  await page.waitForURL('**/app/');
  expect(await page.evaluate(() => (window as unknown as { __publicMarker?: number }).__publicMarker)).toBeUndefined();
  expect(await page.locator('script[src]').evaluateAll((s) => s.map((x) => (x as HTMLScriptElement).src))).toEqual(expect.not.arrayContaining([expect.stringContaining('public-')]));
});

test('security headers are present on public pages too', async ({ request }) => {
  const r = await request.get('/compare-csv-files');
  expect(r.headers()['x-content-type-options']).toBe('nosniff');
  expect(r.headers()['referrer-policy']).toBe('no-referrer');
  expect(r.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
});
