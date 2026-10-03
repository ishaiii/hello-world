import { ArrowRight, Columns2, FileSpreadsheet, ListChecks, Package, ShieldCheck } from 'lucide-react';
import { StaticResultTable, CtaBand, Faq, HeroPreview, LaunchButton, TrustList } from '../parts';
import { summarySentence } from '../../shared/summary';
import { ReorderDemo } from '../islands';
import type { PageProps } from '../types';
import { appHref } from '../../site.config';

const FAQ = [
  {
    q: 'Does the order of rows matter?',
    a: <p>No. RowSignal pairs rows by the identifier columns you choose, so the same orders in a different order give the same answer. Row position is never used to decide what belongs together.</p>,
  },
  {
    q: 'Will leading zeros survive?',
    a: (
      <p>
        In CSV files and in Excel cells stored as text, yes: identifiers are kept as exact text, so 00123 and 123 are different. If Excel already stored the cell as a number, the zeros were removed before RowSignal saw the file and cannot be restored — the app tells you when an identifier column is stored as numbers.
      </p>
    ),
  },
  {
    q: 'What happens with duplicate IDs?',
    a: (
      <p>
        If an identifier appears more than once in either file, the whole group is reported as ambiguous. RowSignal does not guess which row goes with which. The usual fix is to add a second identifier column, such as a SKU, so each combination is unique. <a href="/guides/duplicate-keys-and-missing-records">Read the guide</a>.
      </p>
    ),
  },
  {
    q: 'Does it find approximate matches?',
    a: <p>Only if you ask. After exact matching, you can optionally search the unmatched rows for similar ones, such as a typo in an ID. Suggestions show a similarity score (not a probability), never change the results by themselves, and are labelled “Manually linked” if you accept one.</p>,
  },
  {
    q: 'How big can the files be?',
    a: <p>The starting limits are 10 MB, 100,000 rows, 100 columns and 2 million filled cells per file. They are conservative settings chosen to keep the page responsive, and the app shows the limits it is using. Larger files are refused with an explanation rather than slowing your browser down.</p>,
  },
  {
    q: 'Is anything stored or uploaded?',
    a: (
      <p>
        Files are read in your browser tab and are not uploaded. They are kept in memory only while the page is open. If you choose to save a recipe (rules only) or a project (rules and files), it is stored in this browser on this device — not encrypted and not a backup. <a href="/privacy">Privacy details</a>.
      </p>
    ),
  },
  {
    q: 'What about formulas in Excel files?',
    a: <p>RowSignal compares the value saved in each cell and never runs or recalculates a formula. If a formula cell has no saved result, it is flagged instead of guessed, with a hint on how to save the values.</p>,
  },
  {
    q: 'Does it convert currencies?',
    a: <p>No. Dollar and rupee amounts are only formatted differently when you ask it to ignore currency symbols; no exchange rate is ever applied. Compare values that are already in the same unit.</p>,
  },
];

export const HOME_FAQ = FAQ;

export function Home({ runs }: PageProps) {
  const orders = runs.orders!;
  return (
    <>
      <section className="hero" aria-labelledby="hero-h">
        <div className="container hero__grid">
          <div>
            <p className="hero__eyebrow">
              <FileSpreadsheet size={16} aria-hidden="true" />
              Spreadsheet comparison for everyday business records
            </p>
            <h1 id="hero-h">Two spreadsheets. A clear answer.</h1>
            <p className="hero__lead">Compare orders, inventory, and everyday business records. Find missing rows, changed values, and duplicates—without building another formula.</p>
            <div className="hero__actions">
              <LaunchButton href={appHref()}>
                Compare my files
                <ArrowRight size={18} aria-hidden="true" />
              </LaunchButton>
              <LaunchButton href={appHref('?sample=1')} variant="secondary">
                Try sample comparison
              </LaunchButton>
            </div>
            <TrustList />
          </div>
          <HeroPreview run={orders} />
        </div>
      </section>

      <section className="band" id="how-it-works" aria-labelledby="how-h">
        <div className="container">
          <div className="band__head">
            <h2 id="how-h">How it works</h2>
            <p>Three steps, no formulas, and the reason behind every result.</p>
          </div>
          <ol className="cols-3 plain-ol">
            <li className="step-card">
              <span className="step-card__n" aria-hidden="true">
                1
              </span>
              <h3>Add two files</h3>
              <p>Drop in .csv or .xlsx files. Choose the sheet and the header row when a workbook has several. You see a preview of exactly what will be compared.</p>
            </li>
            <li className="step-card">
              <span className="step-card__n" aria-hidden="true">
                2
              </span>
              <h3>Choose how rows match</h3>
              <p>Say which columns identify the same record — an order number, a SKU, an email — and which values should agree. Column names are suggested; you confirm them.</p>
            </li>
            <li className="step-card">
              <span className="step-card__n" aria-hidden="true">
                3
              </span>
              <h3>Review differences</h3>
              <p>See what matches, what changed, what is missing and what needs attention. Open any row for the original values and the exact reason.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="band band--white" id="use-cases" aria-labelledby="uc-h">
        <div className="container">
          <div className="band__head">
            <h2 id="uc-h">Built for ordinary business spreadsheets</h2>
            <p>Start with the comparisons people actually repeat every week.</p>
          </div>
          <div className="cols-3">
            <a className="usecase" href="/compare-excel-files">
              <span className="usecase__tag">
                <ListChecks size={14} aria-hidden="true" /> Orders vs dispatch
              </span>
              <h3>Which orders never shipped?</h3>
              <p>Compare a marketplace orders export with a warehouse dispatch sheet. Find orders missing from dispatch and shipments with a different quantity or amount.</p>
              <span className="usecase__go">
                Compare Excel files <ArrowRight size={16} aria-hidden="true" />
              </span>
            </a>
            <a className="usecase" href="/compare-inventory">
              <span className="usecase__tag">
                <Package size={14} aria-hidden="true" /> Inventory count vs stock list
              </span>
              <h3>Does the shelf match the system?</h3>
              <p>Match your physical count to the system stock list by SKU. See quantity differences, items nobody counted, and items missing from the list.</p>
              <span className="usecase__go">
                Compare inventory <ArrowRight size={16} aria-hidden="true" />
              </span>
            </a>
            <a className="usecase" href="/find-missing-rows">
              <span className="usecase__tag">
                <Columns2 size={14} aria-hidden="true" /> Updated list vs previous list
              </span>
              <h3>What was added or removed?</h3>
              <p>Compare this week’s supplier list with last week’s. See new and removed items and changed values, without lookup formulas.</p>
              <span className="usecase__go">
                Find missing rows <ArrowRight size={16} aria-hidden="true" />
              </span>
            </a>
          </div>
        </div>
      </section>

      <section className="band" aria-labelledby="demo-h">
        <div className="container">
          <div className="band__head">
            <h2 id="demo-h">Same rows, different order</h2>
            <p>Comparing line by line makes reordered data look broken. Matching by an identifier does not. Try it:</p>
          </div>
          <div data-island="reorder-demo">
            <ReorderDemo />
          </div>
          <p className="help demo-note">
            <a href="/guides/how-spreadsheet-matching-works">Read how matching works</a>
          </p>
        </div>
      </section>

      <section className="band band--white" id="privacy" aria-labelledby="priv-h">
        <div className="container cols-2">
          <div>
            <h2 id="priv-h">Your files stay on your device</h2>
            <p className="muted">
              <ShieldCheck size={18} className="inline-icon" aria-hidden="true" /> RowSignal reads and compares files inside your browser tab. They are not uploaded, and the workspace loads no advertising, analytics or third-party scripts.
            </p>
          </div>
          <div className="prose">
            <h3>Temporary by default</h3>
            <p>Files, results and notes live in memory while the page is open. Close the tab and they are gone.</p>
            <h3>Saved only if you choose</h3>
            <p>
              You can save a <strong>recipe</strong> (your rules, never your rows) or a <strong>project</strong> (rules plus files) on this device. These are not encrypted, are not a backup, and can be deleted at any time. <a href="/privacy">Read the full privacy page</a>.
            </p>
          </div>
        </div>
      </section>

      <section className="band" aria-labelledby="ex-h">
        <div className="container">
          <div className="band__head">
            <h2 id="ex-h">A worked result</h2>
            <p>This is the whole sample comparison — ten orders against ten dispatch lines — with every row accounted for. {summarySentence(orders.result.summary)}</p>
          </div>
          <StaticResultTable run={orders} caption="All twelve result rows of the sample comparison" />
          <div className="hero__actions">
            <LaunchButton href={appHref('?sample=1')} variant="secondary" size="md">
              Open this result in RowSignal
            </LaunchButton>
            <LaunchButton href="/methodology" variant="secondary" size="md">
              How each status is decided
            </LaunchButton>
          </div>
          <div className="cols-3 band__links">
            <a className="usecase" href="/guides/how-spreadsheet-matching-works">
              <span className="usecase__tag">Guide</span>
              <h3>How spreadsheet matching works</h3>
              <p>Keys instead of row order, and what every status means.</p>
            </a>
            <a className="usecase" href="/guides/duplicate-keys-and-missing-records">
              <span className="usecase__tag">Guide</span>
              <h3>Duplicate keys and missing records</h3>
              <p>Why repeated IDs are reported, not guessed, and how to fix them.</p>
            </a>
            <a className="usecase" href="/guides/dates-numbers-and-leading-zeros">
              <span className="usecase__tag">Guide</span>
              <h3>Dates, numbers and leading zeros</h3>
              <p>Why 03/04/2026 needs a setting and 00123 is not 123.</p>
            </a>
          </div>
        </div>
      </section>

      <section className="band band--white" aria-labelledby="faq-h">
        <div className="container">
          <div className="band__head">
            <h2 id="faq-h">Questions people ask</h2>
          </div>
          <Faq items={FAQ} />
        </div>
      </section>

      <CtaBand />
    </>
  );
}
