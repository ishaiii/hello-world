import { Menu } from 'lucide-react';
import type { ReactNode } from 'react';
import { Brand } from '../shared/Logo';
import { GUIDES, TOOLS, type RouteDef } from './routes';
import { appHref, site } from '../site.config';

function Header({ route }: { route: RouteDef }) {
  const current = (p: string) => (route.path === p ? ('page' as const) : undefined);
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Brand />
        <nav className="nav" aria-label="Main">
          <div className="nav__links">
            <a href="/#how-it-works">How it works</a>
            <a href="/#use-cases">Use cases</a>
            <a href="/guides/how-spreadsheet-matching-works" aria-current={route.kind === 'guide' ? 'page' : undefined}>
              Guides
            </a>
          </div>
          <a className="btn btn--primary btn--sm" href={appHref()}>
            Compare files
          </a>
          <details className="nav__menu">
            <summary aria-label="Menu">
              <Menu size={20} aria-hidden="true" />
            </summary>
            <div className="nav__panel">
              <a href="/#how-it-works">How it works</a>
              <a href="/#use-cases">Use cases</a>
              <a href="/guides/how-spreadsheet-matching-works" aria-current={current('/guides/how-spreadsheet-matching-works')}>
                Guides
              </a>
              <a href="/methodology">Methodology</a>
              <a href="/privacy">Privacy</a>
            </div>
          </details>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="site-footer__grid">
          <div>
            <Brand />
            <p className="muted">
              Compare spreadsheets on your own device. Find what changed, what’s missing, and what needs your attention.
            </p>
          </div>
          <div>
            <h2>Tools</h2>
            <ul>
              {TOOLS.map((r) => (
                <li key={r.path}>
                  <a href={r.path}>{r.label}</a>
                </li>
              ))}
              <li>
                <a href={appHref()}>Open the workspace</a>
              </li>
            </ul>
          </div>
          <div>
            <h2>Guides</h2>
            <ul>
              {GUIDES.map((r) => (
                <li key={r.path}>
                  <a href={r.path}>{r.label}</a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>About</h2>
            <ul>
              <li>
                <a href="/privacy">Privacy</a>
              </li>
              <li>
                <a href="/terms">Terms</a>
              </li>
              <li>
                <a href="/methodology">Methodology</a>
              </li>
              <li>
                <a href="/about">About</a>
              </li>
              <li>
                <a href="/contact">Contact</a>
              </li>
            </ul>
          </div>
        </div>
        <p className="site-footer__fine">
          {site.name} {site.version} · Your files are read in your browser and are not uploaded.
        </p>
      </div>
    </footer>
  );
}

export function Layout({ route, children }: { route: RouteDef; children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <Header route={route} />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <Footer />
    </>
  );
}

export function PageHead({ route, lead, crumbs = true }: { route: RouteDef; lead: ReactNode; crumbs?: boolean }) {
  return (
    <div className="page-head">
      <div className="container">
        {crumbs && (
          <nav className="crumbs" aria-label="Breadcrumb">
            <a href="/">Home</a> / {route.kind === 'guide' ? <>Guides / </> : null}
            <span aria-current="page">{route.label}</span>
          </nav>
        )}
        <h1>{route.h1 ?? route.label}</h1>
        <p className="lead">{lead}</p>
      </div>
    </div>
  );
}
