import { PageHead } from '../Layout';
import { decToString } from '../../engine/decimal';
import { excelSerialToIso, parseDateText } from '../../engine/dates';
import { parseNumberText } from '../../engine/values';
import { defaultFormat } from '../../engine/config';
import type { FileFormat } from '../../engine/types';
import { summarySentence } from '../../shared/summary';
import { ReorderDemo } from '../islands';
import { AdSlot, CtaBand, RelatedLinks, StaticResultTable, WorkedExample } from '../parts';
import { routeFor } from '../routes';
import type { PageProps } from '../types';
import { appHref } from '../../site.config';

function GuideAside({ related }: { related: string[] }) {
  return (
    <aside className="aside-card" aria-label="Related">
      <h2 className="h-sm">Keep reading</h2>
      <RelatedLinks paths={related} />
      <a className="btn btn--primary btn--sm" href={appHref('?sample=1')}>
        Try sample comparison
      </a>
    </aside>
  );
}

export function MatchingGuide({ runs }: PageProps) {
  const route = routeFor('/guides/how-spreadsheet-matching-works')!;
  const run = runs.orders!;
  return (
    <>
      <PageHead route={route} lead="Two exports of the same orders almost never list them in the same order. Here is why comparing line by line fails, and what matching by an identifier does instead." />
      <div className="container page-body">
        <article className="prose">
          <h2>Why line-by-line comparison misleads</h2>
          <p>
            The simplest comparison — row 1 against row 1, row 2 against row 2 — only works if both files are sorted identically and contain exactly the same records. The moment one file has an extra row, a missing row or a different sort order, every row after it is out of step and almost everything looks “different”. Try it:
          </p>
          <div data-island="reorder-demo">
            <ReorderDemo />
          </div>
          <AdSlot id="matching-top" />
          <h2>Matching by an identifier</h2>
          <p>
            Instead, you tell RowSignal which column (or combination of columns) identifies a record: an order number, a SKU, an email. Rows are paired when their identifiers are equal, wherever they sit in the file. Equal means exactly equal text: <code>00123</code> and <code>123</code> are different identifiers, and so are <code>ABC</code> and <code>abc</code> unless you choose to ignore case.
          </p>
          <p>Once rows are paired, the values you selected are compared one by one. Every selected value must agree for the pair to count as matched.</p>
          <h2>What every status means</h2>
          <p>The sample below compares ten orders with ten dispatch lines. {summarySentence(run.result.summary)}</p>
          <StaticResultTable run={run} caption="All result rows of the orders sample" />
          <ul>
            <li>
              <strong>Matched</strong> — paired by identifier, all compared values agree (here 1001, 1002, 1003 and 1006). Order 1003 agrees only because the SKU rule ignores the spaces around “ MUG ” and upper/lower case; without those options it would be reported as different.
            </li>
            <li>
              <strong>Different</strong> — paired, but at least one value disagrees. 1004 has quantity 5 against 4; 1005 has amount 800.00 against 850.00. The cell that differs is highlighted and described in text.
            </li>
            <li>
              <strong>Only in A / Only in B</strong> — the identifier exists in one file only. Order 1007 is on the orders list but not in dispatch; 1009 and 1010 are in dispatch but not in orders.
            </li>
            <li>
              <strong>Ambiguous key</strong> — the identifier appears more than once. Order 1008 appears twice in File A (two lines, TAG-A and TAG-B) and once in File B. RowSignal will not choose which line pairs with which. <a href="/guides/duplicate-keys-and-missing-records">What to do about it</a>.
            </li>
            <li>
              <strong>Invalid key</strong> — the identifier is blank. A blank can never be shown to match anything, so those rows are listed on their own.
            </li>
          </ul>
          <h2>Counting without fooling yourself</h2>
          <p>
            A pair uses one row from each file; an ambiguous group can contain several rows of each; an unmatched row is a single row. Because these are different units, RowSignal never adds them into one grand total. Instead it accounts for the rows of each file separately: every row you loaded appears in exactly one place. In the sample, File A’s ten rows are 6 in pairs, 1 only in A, 2 in the ambiguous group and 1 invalid — and File B’s are 6, 2, 1 and 1.
          </p>
          <h2>When exact matching is not enough</h2>
          <p>
            If an ID has a typo, exact matching reports the row as missing from both sides. RowSignal can optionally search those unmatched rows for similar ones and suggest pairs. A suggestion carries a similarity score — a measure of how alike two pieces of text are, <em>not</em> the probability that the pair is right — and nothing changes until you accept it. An accepted pair is always labelled “Manually linked”.
          </p>
        </article>
        <GuideAside related={['/guides/duplicate-keys-and-missing-records', '/guides/dates-numbers-and-leading-zeros', '/methodology']} />
      </div>
      <CtaBand />
    </>
  );
}

export function DuplicatesGuide({ runs }: PageProps) {
  const route = routeFor('/guides/duplicate-keys-and-missing-records')!;
  const one = runs['duplicates-one-key']!;
  const two = runs['duplicates-two-keys']!;
  return (
    <>
      <PageHead route={route} lead="An identifier that appears more than once cannot safely be paired. Here is what that means, why guessing is dangerous, and the usual fix." />
      <div className="container page-body">
        <article className="prose">
          <h2>Duplicate, missing, or both?</h2>
          <p>
            These are different situations and they need different responses. A <strong>missing</strong> record is an identifier present in one file and absent from the other. A <strong>duplicate</strong> is an identifier that appears more than once <em>within</em> a file. A file can have both.
          </p>
          <AdSlot id="dup-top" />
          <h2>Why RowSignal will not guess</h2>
          <p>
            Suppose order 5001 has two lines in each file. Which line in File A belongs with which line in File B? You could pair them in the order they appear, but if the files are sorted differently you would silently compare the wrong lines — and report a difference that does not exist, or hide one that does. Pairing every line with every line is worse: two lines against two lines would create four pairs and consume the same rows twice. So the whole group is reported as one <strong>ambiguous key</strong>, listing every row involved, and nothing in it is matched.
          </p>
          <h2>Example: one identifier</h2>
          <p>Here, order lines are identified by the order number alone.</p>
          <WorkedExample run={one} title="Identifier: Order" launch={false} />
          <p>
            Order 5001 appears twice in each file, so it is ambiguous (two rows from each file); the single-line order 5002 matches. A difference in quantity on one of the 5001 lines is hidden inside the group — which is exactly why the group is reported rather than pretended away.
          </p>
          <h2>The fix: a second identifier column</h2>
          <p>
            Add the SKU as a second part of the identifier. Rows now pair only when order number <em>and</em> SKU are both equal, and the combination is unique. The values are joined safely: the combination <code>12</code> + <code>3</code> can never be confused with <code>1</code> + <code>23</code>.
          </p>
          <WorkedExample run={two} title="Identifier: Order + SKU" launch={false} />
          <p>
            Now there is nothing ambiguous. The PEN line and the MUG line match, and the BOOK line is revealed as a real difference: 2 sent, 3 received. {summarySentence(two.result.summary)}
          </p>
          <h2>Blank identifiers</h2>
          <p>
            A row with an empty identifier — or, when you use two columns, an empty part of one — is reported as an <strong>invalid key</strong>. It is never matched, not even to another blank. If many rows are blank, check that you chose the right column and the right header row.
          </p>
          <h2>If a duplicate is genuine</h2>
          <p>
            Sometimes the same ID legitimately repeats and no second column separates the rows. RowSignal will not invent a pairing for you in that case. Export the ambiguous rows (each row of the group is listed, with the group size) and resolve them by hand or with data you have outside the spreadsheet.
          </p>
        </article>
        <GuideAside related={['/guides/how-spreadsheet-matching-works', '/find-missing-rows', '/methodology']} />
      </div>
      <CtaBand />
    </>
  );
}

const FMT: Record<string, FileFormat> = {
  point: defaultFormat(),
  euro: { ...defaultFormat(), decimal: ',', thousands: '.' },
  currency: { ...defaultFormat(), currency: true },
};

function num(text: string, f: FileFormat): string {
  const r = parseNumberText(text, f);
  return r.ok ? `read as ${decToString(r.dec)}` : `refused — ${r.reason}`;
}
function date(text: string, order: 'DMY' | 'MDY' | null): string {
  const r = parseDateText(text, order);
  return r.ok ? `read as ${r.iso}` : `refused — ${r.reason}`;
}

function Tbl({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label={head.join(', ')}>
      <table className="dt">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="mono">{r[0]}</td>
              <td>{r[1]}</td>
              <td>{r[2]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DatesGuide(_props: PageProps) {
  const route = routeFor('/guides/dates-numbers-and-leading-zeros')!;
  const numRows: Array<[string, string, string]> = [
    ['1,200.00', 'decimal point, comma thousands (US/India default)', num('1,200.00', FMT.point!)],
    ['12,34,567.50', 'same settings; Indian digit grouping', num('12,34,567.50', FMT.point!)],
    ['1.234,56', 'same settings (a European-style number)', num('1.234,56', FMT.point!)],
    ['1.234,56', 'decimal comma, point thousands', num('1.234,56', FMT.euro!)],
    ['₹1,200', 'default (currency symbols not ignored)', num('₹1,200', FMT.point!)],
    ['₹1,200', 'ignore currency symbols turned on', num('₹1,200', FMT.currency!)],
    ['(5.00)', 'any setting — brackets are not a minus sign', num('(5.00)', FMT.point!)],
  ];
  const dateRows: Array<[string, string, string]> = [
    ['03/04/2026', 'day first', date('03/04/2026', 'DMY')],
    ['03/04/2026', 'month first', date('03/04/2026', 'MDY')],
    ['03/04/2026', 'no choice made yet', date('03/04/2026', null)],
    ['2026-04-03', 'any setting (year first is unambiguous)', date('2026-04-03', null)],
    ['3 Apr 2026', 'any setting (month name)', date('3 Apr 2026', null)],
    ['31/04/2026', 'day first', date('31/04/2026', 'DMY')],
    ['03/04/26', 'day first', date('03/04/26', 'DMY')],
  ];
  const serial = [
    ['46115', '1900 date system', excelSerialToIso(46115, false).text],
    ['44653', '1904 date system', excelSerialToIso(44653, true).text],
    ['60', '1900 date system', excelSerialToIso(60, false).ok ? 'a date' : 'not a real date (Excel’s 1900 leap-year quirk)'],
  ];
  return (
    <>
      <PageHead route={route} lead="The cells that look the same on screen are often different underneath. These are the cases that cause false mismatches — and how RowSignal treats them." />
      <div className="container page-body">
        <article className="prose">
          <h2>Leading zeros: 00123 is not 123</h2>
          <p>
            Identifiers such as order numbers, phone numbers and account codes are labels, not quantities, so RowSignal keeps them as exact text. <code>00123</code> and <code>123</code> are different identifiers unless you decide otherwise — turning an ID into a number would let unrelated records collide.
          </p>
          <p>
            In a CSV file the zeros are in the text and survive. In an Excel file it depends on how the cell was stored. A cell typed as text keeps <code>00123</code>. A cell that Excel stored as a number keeps only <code>123</code>: the zeros were thrown away when the cell was saved, and no tool can bring them back. RowSignal tells you when an identifier column is stored as numbers so you can fix the source (format the column as text before typing or importing).
          </p>
          <AdSlot id="dates-top" />
          <h2>Numbers: separators are per file</h2>
          <p>
            1.234 might be one thousand two hundred thirty-four or a little over one, depending on the file. So the decimal separator, thousands separator and the “ignore currency symbols” option are set <strong>per file</strong> and are never guessed from your location. Numbers are compared as exact decimals — no floating-point rounding — and nothing is converted between currencies.
          </p>
          <Tbl head={['Text in the file', 'File setting', 'How RowSignal reads it']} rows={numRows} />
          <p>
            Blank, zero, the word NULL and a malformed number are four different things. A blank is not zero. NULL in a number column is reported as unreadable rather than treated as blank. A value that cannot be read is flagged as its own reason; it is never silently turned into zero and never counted as agreeing.
          </p>
          <h2>Dates: 03/04/2026 means two things</h2>
          <p>
            In the US 03/04/2026 is 4 March; in India and much of the world it is 3 April. RowSignal asks you to choose the order for each file when it holds dates as text, and it will not run until you have. The two files in a comparison can differ — the sample compares a day-first file with a month-first file. A date is compared as a calendar day with no time zone, so it cannot slip a day.
          </p>
          <Tbl head={['Text in the file', 'File setting', 'How RowSignal reads it']} rows={dateRows} />
          <h2>Excel’s own dates</h2>
          <p>
            A date typed into Excel is stored as a number of days. Excel has two systems with different starting points, and a workbook records which it uses; RowSignal reads that, rather than assuming. In the 1900 system the number 60 is a date that never existed (Excel treats 1900 as a leap year); RowSignal flags it instead of inventing a day.
          </p>
          <Tbl head={['Stored number', 'Workbook setting', 'Calendar date']} rows={serial} />
          <h2>Tolerances</h2>
          <p>
            For measurements you can allow a small difference on a number field. The test is “the difference is no larger than the allowed amount”, using exact decimals, so a tolerance of 0.05 accepts 10.00 against 10.05 and rejects 10.06. It starts at zero.
          </p>
        </article>
        <GuideAside related={['/compare-csv-files', '/compare-excel-files', '/methodology']} />
      </div>
      <CtaBand />
    </>
  );
}
