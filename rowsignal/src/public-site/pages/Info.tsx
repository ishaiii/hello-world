import { PageHead } from '../Layout';
import { DEFAULT_LIMITS, formatBytes } from '../../import/limits';
import { site } from '../../site.config';
import { summarySentence } from '../../shared/summary';
import { StaticResultTable } from '../parts';
import { DiagnosticsButton } from '../islands';
import { routeFor } from '../routes';
import type { PageProps } from '../types';

const Single = ({ children }: { children: React.ReactNode }) => (
  <div className="container page-body page-body--single">
    <article className="prose">{children}</article>
  </div>
);

export const BUILD_DATE = new Date().toISOString().slice(0, 10);

export function PrivacyPage() {
  const route = routeFor('/privacy')!;
  return (
    <>
      <PageHead route={route} lead="RowSignal is built so that your spreadsheets never have to leave your device. This page says exactly what that means, and where the edges are." />
      <Single>
        <p className="muted">Last updated {BUILD_DATE}. This page describes how this version of the software is built.</p>
        <h2>The short version</h2>
        <ul>
          <li>Your files are read and compared inside your browser tab. They are not uploaded.</li>
          <li>There are no accounts, and RowSignal sets no cookies.</li>
          <li>The workspace loads no advertising, analytics, session-replay or third-party scripts, and no external fonts.</li>
          <li>Anything saved is saved on your device, only when you choose, and you can delete it.</li>
        </ul>
        <h2>What happens to a file you add</h2>
        <p>
          When you choose or drop a file, your browser gives the page access to its bytes. They are read into memory and processed by a background worker running in the same browser tab. The file name, the column names, every cell value, your identifiers, your notes and the results are never put into a web address, a log, an error report or a request to any server.
        </p>
        <p>
          The workspace page is delivered with a Content-Security-Policy that tells the browser to block every network connection from that page (<code>connect-src 'none'</code>) and to allow scripts and fonts only from the site itself. That is a technical backstop: even a bug could not send file contents elsewhere. It applies when the site is served with the headers supplied with the software.
        </p>
        <h2>Temporary memory</h2>
        <p>
          By default everything lives in memory only: your files, the results, your review flags and notes. Close or reload the tab and it is gone. The app warns you before you leave a tab that holds work you have not saved.
        </p>
        <h2>Saving on this device — optional</h2>
        <p>Two things can be saved, each only after you press a save button:</p>
        <ul>
          <li>
            <strong>Recipes</strong> hold your rules: which columns (by header name) identify a record, the values compared, the formats chosen. They contain no rows of data. Header names and labels can still reveal something about your business, so treat a recipe file as you would any other work document.
          </li>
          <li>
            <strong>Projects</strong> also hold your two files, your review notes and any links you made, so you can reopen a comparison later.
          </li>
        </ul>
        <p>
          Both are stored in your browser’s local database (IndexedDB) on this device. They are <strong>not encrypted</strong>, so anyone who can use the same browser profile on this device could open them. They are <strong>not a backup</strong>: you, your browser or your operating system can clear them, and a nearly full device can evict them. They are never synced to another device. The “Saved” window lists them with sizes and lets you delete one, all projects, or all recipes; deleting removes the stored files and settings, not just the list entry.
        </p>
        <h2>Exports and downloads</h2>
        <p>
          Exports are created on your device and handed to your browser as a download. They contain your data (and, in Excel exports, the names of your files), so they deserve the same care as the originals. Nothing is uploaded or shared by RowSignal.
        </p>
        <h2>What the website itself does</h2>
        <p>
          The pages you are reading are static files. Like any website, whoever hosts them can see ordinary request information — your IP address, the page requested, your browser type — in server logs. That information never includes anything from your spreadsheets, because your spreadsheets are never sent.
        </p>
        <p>
          The public pages (home, tool pages, guides) are built so that advertising and analytics can be added later by the site owner. They are off in this build. If they are ever turned on, they will be limited to the public pages, will respect any consent required where you live, will never receive file contents, names or column names, and will never be loaded in the workspace.
        </p>
        <h2>Diagnostics</h2>
        <p>
          If you ask for help, you can download a small diagnostics file. It lists the software version, your browser, and the limits in use. It contains no file names, column names, values or results, and it is only created when you press the button.
        </p>
        <h2>Who operates this site</h2>
        <p>{site.operatorName ? <>This site is operated by {site.operatorName}.</> : <>The operator’s details have not been published in this build. They are supplied by the site owner at launch.</>}</p>
        <p>
          Questions about this page: see <a href="/contact">Contact</a>.
        </p>
      </Single>
    </>
  );
}

export function TermsPage() {
  const route = routeFor('/terms')!;
  return (
    <>
      <PageHead route={route} lead="Plain-language terms for using RowSignal." />
      <Single>
        <p className="muted">Last updated {BUILD_DATE}.</p>
        <h2>What RowSignal is</h2>
        <p>RowSignal is a free tool that compares two spreadsheet files you provide and shows where they agree and differ. It runs in your browser.</p>
        <h2>What it is not</h2>
        <p>
          RowSignal is not a tax-filing system, an accounting or audit service, a bank integration, or an automatic decision-maker. Its output is a comparison under the rules you chose. It does not tell you which file is correct, and nothing it produces is financial, tax, legal or professional advice or a certification of any kind.
        </p>
        <h2>Your responsibilities</h2>
        <ul>
          <li>Only use files you are allowed to use. Do not rely on RowSignal to meet a legal or contractual obligation without checking the results yourself.</li>
          <li>Check the rules you set (identifiers, number and date formats, tolerances). Results are only as meaningful as those choices; the app shows them and the exports record them.</li>
          <li>Keep your own copies of anything important. Saved projects and recipes on your device are not backups.</li>
        </ul>
        <h2>No warranty</h2>
        <p>
          RowSignal is provided “as is”. It is tested, and its matching rules are documented on the <a href="/methodology">methodology page</a>, but spreadsheets are messy and software has bugs. To the extent the law allows, the site’s owner is not liable for losses arising from decisions made using its output.
        </p>
        <h2>Acceptable use</h2>
        <p>Do not use the site to attack, overload or probe it or other people’s systems, or to process data you have no right to process.</p>
        <h2>Changes</h2>
        <p>The tool and these terms may change. The date above shows the last update to this version.</p>
        <h2>The site’s operator</h2>
        <p>{site.operatorName ? <>Operated by {site.operatorName}.</> : <>The operator’s legal details, and the governing law that applies to these terms, are supplied by the site owner at launch and are not set in this build.</>}</p>
      </Single>
    </>
  );
}

export function MethodologyPage({ runs }: PageProps) {
  const route = routeFor('/methodology')!;
  const run = runs.orders!;
  const L = DEFAULT_LIMITS;
  return (
    <>
      <PageHead route={route} lead="The rules in full, so you can judge whether a result is right. Everything here describes what the software actually does." />
      <Single>
        <nav aria-label="On this page" className="note-box">
          <strong>On this page:</strong> <a href="#pipeline">Pipeline</a> · <a href="#identifiers">Identifiers</a> · <a href="#values">Compared values</a> · <a href="#numbers">Numbers</a> · <a href="#dates">Dates</a> · <a href="#excel">Excel files</a> · <a href="#accounting">Accounting</a> · <a href="#approximate">Approximate suggestions</a> · <a href="#limits">Limits</a> · <a href="#exports">Exports</a> · <a href="#not">What it does not do</a>
        </nav>
        <h2 id="pipeline">Pipeline</h2>
        <ol>
          <li>Read each file into a table of text cells, remembering for every cell whether the file stored it as a number, date, yes/no, error or formula.</li>
          <li>Build an identifier for each row from the columns you chose.</li>
          <li>Group rows by identifier. Pair identifiers that appear exactly once on each side; report the rest.</li>
          <li>Compare the selected values of each pair under your rules.</li>
          <li>Check that every loaded row is accounted for exactly once. If that check fails, the results are discarded and an error is shown instead.</li>
        </ol>
        <p>Row order is never used. Column positions are never used: columns are referred to by their identity in the current file, and a saved recipe finds them again by header name.</p>
        <h2 id="identifiers">Identifiers</h2>
        <ul>
          <li>An identifier is exact text. <code>00123</code> ≠ <code>123</code>; <code>1E3</code> ≠ <code>1000</code>; <code>ABC</code> ≠ <code>abc</code>. Ignoring outer spaces or upper/lower case are options, off by default, per identifier.</li>
          <li>With several identifier columns the values are combined so that no value can imitate a separator: each part is stored with its length, so <code>a|b</code> + <code>c</code> never equals <code>a</code> + <code>b|c</code>, nor <code>12</code> + <code>3</code> equal <code>1</code> + <code>23</code>.</li>
          <li>An empty (or all-spaces) identifier, or an identifier cell that holds an error value or a formula with no saved result, makes the row an <strong>invalid key</strong>. It is never matched.</li>
          <li>If an identifier occurs more than once in either file, the whole group — every row from both files — is one <strong>ambiguous key</strong>. No pairing is attempted and no row is used twice.</li>
          <li>A valid identifier that occurs once in one file and not at all in the other is <strong>only in A</strong> or <strong>only in B</strong>.</li>
        </ul>
        <h2 id="values">Compared values</h2>
        <p>
          Each compared value has a type: text, identifier, number, date or yes/no. A pair is <strong>matched</strong> only when every selected value agrees, and <strong>different</strong> otherwise; the reason names each differing value with both originals. A value that cannot be read under your rules makes the pair different and says why; it never becomes zero, blank or “agrees”.
        </p>
        <p>
          Only the normalisation you switch on is applied: ignoring outer spaces, ignoring case (text), and treating whitespace-only cells as blank. Punctuation, accents, internal spaces and leading zeros are never removed. When two texts differ only by spaces or case, the reason says so and names the option.
        </p>
        <h2 id="numbers">Numbers</h2>
        <ul>
          <li>Numbers are exact decimals (arbitrary-precision integers with a scale). Binary floating point is never used to compare them, so 0.1 + 0.2 style noise cannot create or hide a difference.</li>
          <li>Text numbers are read with the file’s decimal separator, thousands separator (including Indian 12,34,567.50 grouping) and optional “ignore currency symbols”. Misplaced separators, brackets, and stray text are refused with a reason.</li>
          <li>The allowed difference starts at zero. A pair agrees when |A − B| ≤ allowed; the tolerance used is written in the reason and the export’s rules sheet.</li>
          <li>Blank, 0, the text NULL and malformed numbers are distinct. Two blanks agree; a blank and a zero do not.</li>
          <li>A number stored as a number in an Excel file is taken from its stored value, rounded to the 15 significant digits Excel itself keeps, so a value Excel computed as 0.30000000000000004 compares equal to 0.3.</li>
          <li>Currencies and units are never converted, and unlike currencies are never summed.</li>
        </ul>
        <h2 id="dates">Dates</h2>
        <ul>
          <li>Dates are calendar days (<code>YYYY-MM-DD</code>) with no time zone, so they cannot shift. A time of day, when present, is ignored for date comparison.</li>
          <li>Numeric day/month dates such as 03/04/2026 need the file’s order (day-first or month-first), which you must choose when such dates are present. Year-first dates and dates with month names are unambiguous and always accepted. Two-digit years and impossible dates (31/04/2026) are refused.</li>
          <li>Excel dates are read with the workbook’s own date system (1900 or 1904). Serial 60 in the 1900 system (the non-existent 29 February 1900) is flagged.</li>
        </ul>
        <h2 id="excel">Excel and CSV specifics</h2>
        <ul>
          <li>Formulas are never run or recalculated; the saved result is compared. A formula with no saved result is flagged. Hyperlinks are not followed, external workbook links are not resolved, macros are never run, and macro-enabled, legacy and password-protected files are not opened.</li>
          <li>Only the selected sheet is read. Hidden rows are included and counted; hidden columns can be chosen; merged cells carry their value only in the top-left cell.</li>
          <li>Row numbers shown are the numbers a spreadsheet application would show. Blank rows are skipped and counted; rows above the header are ignored and counted.</li>
          <li>CSV delimiters (comma, semicolon, tab) and encodings are detected per file and can be overridden; quoted fields, escaped quotes and embedded line breaks are supported.</li>
        </ul>
        <h2 id="accounting">Accounting</h2>
        <p>
          Every non-skipped source row appears exactly once: in an exact pair, a manual pair, an unmatched bucket, an ambiguous group, or an invalid-key bucket. Pairs, groups and rows are different units, so they are shown separately and never added into one total. For the sample comparison: {summarySentence(run.result.summary)}
        </p>
        <StaticResultTable run={run} caption="Sample comparison used throughout the documentation" />
        <h2 id="approximate">Approximate suggestions</h2>
        <p>
          Optional and off until you ask. After exact matching, rows that are only in one file can be compared with the unmatched rows of the other. For each value you choose, text is scored with the Dice coefficient over character pairs (ignoring case and punctuation for scoring only), numbers by relative closeness, and dates and yes/no values by equality; the pair’s score is the average, between 0 and 1. It is a similarity score, not the probability that a pair is correct.
        </p>
        <p>
          Candidates come from a character-trigram index, so the search does not compare every row with every row. It is bounded: very common trigrams are ignored, the number of candidate pairs and the elapsed time are capped, and if a cap is reached the app says the search was limited. Suggestions are one-to-one — a row is offered at most once — and never override an exact match or touch an ambiguous group. Accepting one creates a pair labelled <strong>Manually linked</strong> that keeps both original identifiers and re-compares the selected values; links can be undone individually.
        </p>
        <h2 id="limits">Limits and safety</h2>
        <ul>
          <li>Starting limits per file: {formatBytes(L.maxFileBytes)}, {L.maxRows.toLocaleString('en-US')} rows, {L.maxCols} columns, {L.maxCells.toLocaleString('en-US')} filled cells. They are conservative settings, not performance claims; the app shows the limits in use.</li>
          <li>Excel files are unpacked under a budget: archive entries are counted, decompressed bytes are metered as they appear (up to {Math.round(L.maxDecompressedBytes / (1024 * 1024))} MB in total), a document-type declaration is refused, and worksheet dimension attributes are never used to size memory.</li>
          <li>Reading and comparing run in a background worker and can be cancelled; results from an earlier request can never replace newer ones.</li>
          <li>Text from your files is always displayed as text, never as HTML.</li>
        </ul>
        <h2 id="exports">Exports</h2>
        <p>
          CSV (UTF-8 with a byte-order mark, CRLF line endings) and Excel exports contain your original values exactly as found. Spreadsheet applications can run formulas from text that starts with = + − or @, and quoting alone does not stop that. So in CSV, text that starts with those characters (or a tab or line break) and is not a plain number gets a visible apostrophe in front; real negative numbers such as -12.50 are left alone. In Excel exports every value is written as literal text, so nothing can run, and cells that start with a formula character are also marked so they stay text if edited. The original values inside RowSignal are never changed.
        </p>
        <h2 id="not">What it does not do</h2>
        <p>
          It does not upload files, connect to banks, take payments, store anything in the cloud, share with a team, schedule imports, run macros, read PDFs or images, match one row to several automatically, or guess which duplicate belongs with which. It does not certify accounts or decide which file is right.
        </p>
      </Single>
    </>
  );
}

export function AboutPage() {
  const route = routeFor('/about')!;
  return (
    <>
      <PageHead route={route} lead="A practical mismatch finder for ordinary business spreadsheets." />
      <Single>
        <h2>What it is for</h2>
        <p>
          Small businesses, online sellers and office teams constantly hold two versions of the same list: orders and dispatches, a stock count and a stock list, this week’s catalogue and last week’s. RowSignal answers “what is different, what is missing, and what needs my attention?” without lookup formulas, and shows the reason behind every answer.
        </p>
        <h2>Principles</h2>
        <ul>
          <li>
            <strong>Honest ambiguity.</strong> When it cannot be sure — a repeated ID, a date that could be read two ways — it says so instead of guessing.
          </li>
          <li>
            <strong>Nothing silent.</strong> Spaces, case, zeros and formats are only normalised when you turn that on, and the exports record the rules.
          </li>
          <li>
            <strong>Your data stays yours.</strong> Files are processed on your device. Saving is opt-in and visible.
          </li>
          <li>
            <strong>Less effort next week.</strong> Saved recipes make a repeat comparison two files and one click. The goal is a short, correct task, not a long session.
          </li>
        </ul>
        <h2>What it is not</h2>
        <p>
          It is not an accounting system, a tax tool, an audit service or a bank integration. See the <a href="/terms">terms</a> and the <a href="/methodology">methodology</a>.
        </p>
        <h2>Who is behind it</h2>
        <p>{site.operatorName ? <>RowSignal is operated by {site.operatorName}.</> : <>Operator details are supplied by the site owner at launch and are not set in this build.</>}</p>
      </Single>
    </>
  );
}

export function ContactPage() {
  const route = routeFor('/contact')!;
  return (
    <>
      <PageHead route={route} lead="How to get help, without sending anyone your spreadsheets." />
      <Single>
        <h2>Contact</h2>
        {site.contactEmail ? (
          <p>
            You can write to <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>. Please do not attach spreadsheets containing private data; describe the problem and, if you can, attach the diagnostics file below.
          </p>
        ) : (
          <p>
            No contact address has been configured in this build, so this page does not offer a message form — a form that pretended to send a message would be misleading. The site owner adds a contact address at launch.
          </p>
        )}
        <h2>Diagnostics file</h2>
        <p>
          This downloads a small file made entirely on your device with the software version, your browser and the limits in use. It contains <strong>no file names, column names, values or results</strong>, and nothing is sent anywhere. You choose whether to share it.
        </p>
        <div data-island="diagnostics">
          <DiagnosticsButton />
        </div>
        <h2>Before you ask</h2>
        <ul>
          <li>
            A file was refused? The message names the reason (type, size, rows, columns). <a href="/methodology#limits">Limits</a> are listed on the methodology page.
          </li>
          <li>
            Dates or numbers look wrong? Check the per-file format settings. See <a href="/guides/dates-numbers-and-leading-zeros">dates, numbers and leading zeros</a>.
          </li>
          <li>
            Many “only in” rows? Look at the identifier columns and whether spaces or case differ.
          </li>
        </ul>
      </Single>
    </>
  );
}

export function NotFoundPage() {
  return (
    <div className="container page-body page-body--single">
      <article className="prose">
        <h1>Page not found</h1>
        <p>
          That page does not exist. You can go to the <a href="/">home page</a> or open the <a href="/app/">workspace</a>.
        </p>
      </article>
    </div>
  );
}
