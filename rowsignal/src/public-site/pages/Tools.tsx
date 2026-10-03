import { ArrowRight } from 'lucide-react';
import { PageHead } from '../Layout';
import { AdSlot, CtaBand, LaunchButton, RelatedLinks, WorkedExample } from '../parts';
import { routeFor } from '../routes';
import type { PageProps } from '../types';
import { appHref } from '../../site.config';

function Aside({ preset, related }: { preset: string; related: string[] }) {
  return (
    <aside className="aside-card" aria-label="Start a comparison">
      <h2 className="h-sm">Start here</h2>
      <p className="muted">Open the workspace with the right labels already in place. Your files stay on your device.</p>
      <LaunchButton href={appHref(`?preset=${preset}`)} size="md">
        Compare my files
        <ArrowRight size={16} aria-hidden="true" />
      </LaunchButton>
      <LaunchButton href={appHref('?sample=1')} variant="secondary" size="md">
        Try sample comparison
      </LaunchButton>
      <h3 className="h-xs">Related</h3>
      <RelatedLinks paths={related} />
    </aside>
  );
}

export function ExcelPage({ runs }: PageProps) {
  const route = routeFor('/compare-excel-files')!;
  const run = runs.excel!;
  return (
    <>
      <PageHead route={route} lead="Match rows by an ID instead of by position, pick the right sheet in each workbook, and see every changed value, missing row and duplicate — with the reason for each." />
      <div className="container page-body">
        <article className="prose">
          <h2>What it does</h2>
          <p>
            You add two .xlsx workbooks. RowSignal reads the sheet you choose in each one, pairs rows that share an identifier (a rep ID, an order number, a SKU), and compares the values you select. It tells you which pairs agree, which differ and exactly how, and which rows exist in only one workbook. You do not write a lookup formula, and the order of the rows does not matter.
          </p>
          <AdSlot id="excel-top" />
          <h2>A worked example</h2>
          <p>
            Finance keeps a targets workbook; HR keeps a roster. The targets sheet has two title rows above its headers and sits behind a “Notes” sheet. The rep IDs are stored as text, so the leading zeros are real. RowSignal was pointed at the <strong>Targets</strong> sheet with headers on <strong>row 3</strong>, and told that Rep ID is the identifier.
          </p>
          <WorkedExample run={run} title="q1-targets.xlsx compared with roster.xlsx" />
          <p>
            Read the result like this: <strong>007</strong> agrees on every selected value. <strong>008</strong> is the same person with a different target (42000 against 45000). <strong>009</strong> has a different start date — compared as a real calendar date, so a formatting difference alone would not show up. <strong>010</strong> is in the targets workbook only, and <strong>011</strong> in the roster only.
          </p>
          <h2>What is specific to Excel files</h2>
          <ul>
            <li>
              <strong>Sheets.</strong> Only the sheet you select is read. A workbook with several sheets shows a sheet picker; a hidden sheet is read only if you pick it, and you are told it is hidden.
            </li>
            <li>
              <strong>Header row.</strong> If the table does not start on row 1, choose the row that holds the column names. Rows above it are ignored and counted. Source row numbers in the results always match the row numbers you see in Excel.
            </li>
            <li>
              <strong>Hidden rows and columns.</strong> Hidden rows are included in the comparison (hiding is a display choice, not a deletion) and the app says how many. Hidden columns can still be chosen.
            </li>
            <li>
              <strong>Formulas.</strong> RowSignal compares the value Excel saved in the cell. It never runs or recalculates a formula. If a formula cell has no saved result, the row is flagged rather than guessed; copying the column and pasting it back as values fixes that.
            </li>
            <li>
              <strong>Dates.</strong> A cell formatted as a date is read as a calendar date using the workbook’s own date system (Excel has two). No time zone is ever applied. Dates typed as text need the day/month order chosen for that file.
            </li>
            <li>
              <strong>Numbers stored as numbers.</strong> If an order number like 00123 was typed into a numeric cell, Excel kept only 123. That information was lost before RowSignal opened the file, and it cannot be restored. The app warns you when an identifier column is stored as numbers.
            </li>
            <li>
              <strong>Not supported.</strong> Macro-enabled files (.xlsm), the old .xls format and password-protected workbooks are not opened; the app explains how to save a copy as a normal .xlsx. Macros are never run.
            </li>
          </ul>
          <h2>Limits worth knowing</h2>
          <p>
            A file can be up to 10 MB, with 100,000 rows, 100 columns and 2 million filled cells per sheet. Archives that expand to an unreasonable size are refused. These are starting limits chosen to keep the page responsive, not promises about speed. See the <a href="/methodology">methodology</a> for the full rules.
          </p>
        </article>
        <Aside preset="excel" related={['/compare-csv-files', '/guides/dates-numbers-and-leading-zeros', '/guides/duplicate-keys-and-missing-records']} />
      </div>
      <CtaBand preset="excel" />
    </>
  );
}

export function CsvPage({ runs }: PageProps) {
  const route = routeFor('/compare-csv-files')!;
  const run = runs.csv!;
  return (
    <>
      <PageHead route={route} lead="Each CSV file is read on its own terms: its delimiter, its text encoding, and its number format. A comma-separated ledger and a semicolon-separated bank export can be compared directly." />
      <div className="container page-body">
        <article className="prose">
          <h2>Why CSV comparisons go wrong</h2>
          <p>
            “CSV” is not one format. One system exports commas and decimal points; another exports semicolons and decimal commas (1.250,50 for one thousand two hundred fifty and fifty cents). If both files are forced through the same assumptions, amounts silently turn into different numbers or into text. RowSignal reads each file with its own settings and shows you what it chose.
          </p>
          <AdSlot id="csv-top" />
          <h2>A worked example</h2>
          <p>
            The ledger is comma-separated with US-style numbers. The bank export is semicolon-separated with European-style numbers. The delimiter of each file was detected automatically; the second file was told its decimal separator is a comma and its thousands separator a point. The identifier is the invoice number.
          </p>
          <WorkedExample run={run} title="ledger.csv compared with bank-export.csv" />
          <p>
            <strong>INV-001</strong> is 1,250.50 in one file and 1.250,50 in the other — the same amount, so it matches. <strong>INV-003</strong> differs for real (12,000.00 against 12.500,00). Amounts are compared as exact decimals, never as floating-point numbers, so there is no rounding noise.
          </p>
          <h2>What RowSignal handles for you</h2>
          <ul>
            <li>
              <strong>Delimiters.</strong> Comma, semicolon or tab, detected per file, and overridable. A delimiter inside quotes does not confuse the detection.
            </li>
            <li>
              <strong>Quoting.</strong> Quoted fields, doubled quote marks, and line breaks inside a field are read correctly. Row numbers follow records, the way a spreadsheet shows them.
            </li>
            <li>
              <strong>Encodings.</strong> UTF-8 (with or without a byte-order mark) and UTF-16 are recognised. If the bytes are not valid UTF-8, the file is read as Windows-1252 and you are told, with a picker to choose another encoding.
            </li>
            <li>
              <strong>Excel’s separator hint.</strong> A first line such as <code>sep=;</code> is honoured and is not counted as a row.
            </li>
            <li>
              <strong>Numbers and dates.</strong> Decimal and thousands separators, Indian digit grouping (12,34,567.50), and whether 03/04/2026 is day-first or month-first are set per file, never guessed from where you are.
            </li>
            <li>
              <strong>Identifiers.</strong> Everything in a CSV is text, so 00123 stays 00123 unless you ask to ignore spaces or case.
            </li>
          </ul>
          <h2>What it will not do</h2>
          <p>
            It will not repair a damaged file. If a quote mark is never closed, RowSignal says so instead of quietly merging rows. A file with more than 100,000 rows, 100 columns or 10 MB is refused with the reason.
          </p>
        </article>
        <Aside preset="csv" related={['/compare-excel-files', '/guides/dates-numbers-and-leading-zeros', '/methodology']} />
      </div>
      <CtaBand preset="csv" />
    </>
  );
}

export function MissingPage({ runs }: PageProps) {
  const route = routeFor('/find-missing-rows')!;
  const run = runs.missing!;
  return (
    <>
      <PageHead route={route} lead="Which records are in one list but not the other? RowSignal answers that without a VLOOKUP, and gives you the missing rows as a list you can send on." />
      <div className="container page-body">
        <article className="prose">
          <h2>The question behind most comparisons</h2>
          <p>
            Before anyone asks whether values changed, they usually ask what is <em>missing</em>: customers on the full list who are not on the mailing list, items in last week’s supplier catalogue that vanished from this week’s, orders that were placed but never dispatched. RowSignal reports these as <strong>Only in A</strong> and <strong>Only in B</strong>, and you can export just those rows.
          </p>
          <AdSlot id="missing-top" />
          <h2>A worked example</h2>
          <p>
            The full list and the checked list are both keyed on email address. But the checked list has <code>Ana@Example.com </code> — capital letters and a trailing space — where the full list has <code>ana@example.com</code>. Treated literally those are different strings, so the identifier rule was set to ignore spaces around values and upper/lower case. Both options are off unless you turn them on.
          </p>
          <WorkedExample run={run} title="full-list.csv compared with checked-list.csv" />
          <p>
            Ana, Ben and Dev are found in both lists. <strong>Cara</strong> and <strong>Eli</strong> are only on the full list — the people to follow up. <strong>Fay</strong> is only on the checked list: someone who is there but should not be, or whom the full list is missing.
          </p>
          <h2>Getting the identifier right</h2>
          <ul>
            <li>
              <strong>Pick something unique.</strong> An email, an ID or a SKU works. A name usually does not: two people called Ben Khan would be reported as an ambiguous group, not paired.
            </li>
            <li>
              <strong>Know what you switched on.</strong> “Ignore spaces” and “ignore case” are explicit choices. If a list has stray spaces, the app points it out and tells you the count, so you can decide.
            </li>
            <li>
              <strong>Blank identifiers are never matched.</strong> A row with no email cannot be shown to be missing from anywhere, so it is listed separately as an invalid key.
            </li>
            <li>
              <strong>Similar, not identical?</strong> If one list has <code>ana.k@example.com</code> and the other <code>ana@example.com</code>, exact matching reports both as missing. The optional “possible matches” search can suggest the pair for you to accept or reject.
            </li>
          </ul>
          <h2>Sending the result on</h2>
          <p>
            Export to Excel for a sheet per category — “Only in File A”, “Only in File B”, duplicates and invalid keys — or to CSV for one flat table. Review flags and notes are included only if you tick that option.
          </p>
        </article>
        <Aside preset="missing" related={['/guides/duplicate-keys-and-missing-records', '/compare-inventory', '/guides/how-spreadsheet-matching-works']} />
      </div>
      <CtaBand preset="missing" />
    </>
  );
}

export function InventoryPage({ runs }: PageProps) {
  const route = routeFor('/compare-inventory')!;
  const run = runs.inventory!;
  return (
    <>
      <PageHead route={route} lead="Match a physical count to a system or supplier stock list by SKU. See quantity differences, items nobody counted, and items missing from the list — each with the reason." />
      <div className="container page-body">
        <article className="prose">
          <h2>Three different problems, three different labels</h2>
          <p>A count rarely disagrees with the stock list in only one way, and each kind of disagreement needs a different follow-up. RowSignal keeps them apart:</p>
          <ul>
            <li>
              <strong>Different</strong> — the SKU is in both, but a compared value (quantity, bin) disagrees. Recount or adjust.
            </li>
            <li>
              <strong>Only in the count sheet</strong> — someone counted a SKU the stock list does not know about. Possibly a new item, possibly a typo.
            </li>
            <li>
              <strong>Only in the stock list</strong> — the system says you have it but nobody counted it. Possibly missing, possibly just not reached.
            </li>
          </ul>
          <AdSlot id="inventory-top" />
          <h2>A worked example</h2>
          <p>
            The count sheet lists SKU, counted quantity and bin. The stock list calls the same columns Item Code, On hand and Bin. The columns were paired by meaning, the SKU is the identifier, quantity is compared as an exact number, and the bin as exact text.
          </p>
          <WorkedExample run={run} title="count-sheet.csv compared with stock-list.csv" />
          <p>
            <strong>SKU-101</strong> was counted as 0 but the system shows 3. <strong>SKU-102</strong> has the right quantity in a different bin (B1 against B4). <strong>SKU-103</strong> was counted but is not on the stock list, and <strong>SKU-104</strong> is on the stock list but was not counted.
          </p>
          <h2>Tolerances, used carefully</h2>
          <p>
            For goods sold by weight or volume you may accept a small difference. Set an <strong>allowed difference</strong> on the quantity — with 0.5, a count of 24.3 and a stock figure of 24.0 agree, while 24.6 does not. The tolerance is applied as “difference no more than the allowed amount”, it is zero unless you change it, and it is written into the rules summary of any export so a reader can see it was used.
          </p>
          <h2>What this is not</h2>
          <p>
            RowSignal is a comparison tool, not an inventory system or an audit service. It tells you where two lists disagree; it does not decide which one is right, adjust stock, or certify anything. Quantities are never converted between units, and values in different currencies are never summed or converted.
          </p>
        </article>
        <Aside preset="inventory" related={['/find-missing-rows', '/compare-csv-files', '/guides/dates-numbers-and-leading-zeros']} />
      </div>
      <CtaBand preset="inventory" />
    </>
  );
}
