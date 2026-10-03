export type RouteKind = 'home' | 'tool' | 'guide' | 'info' | 'notfound';

export interface RouteDef {
  path: string;
  title: string;
  description: string;
  kind: RouteKind;
  /** Short label for navigation, breadcrumbs and link lists. */
  label: string;
  /** Page heading when it differs from the label. */
  h1?: string;
  /** Example runs the page needs (computed by the real engine at build time). */
  examples: string[];
  /** `/app/?preset=` value for the tool launch button. */
  preset?: string;
}

export const ROUTES: RouteDef[] = [
  {
    path: '/',
    title: 'RowSignal — Compare Spreadsheets. Resolve Differences.',
    description: 'Compare two Excel or CSV files by key. Find missing rows, changed values and duplicates on your own device — no account, no formulas.',
    kind: 'home',
    label: 'Home',
    examples: ['orders'],
  },
  {
    path: '/compare-excel-files',
    title: 'Compare Two Excel Files by Key | RowSignal',
    description: 'Compare two .xlsx workbooks by an ID column, not row order. Pick the sheet, keep leading zeros, read real Excel dates, and export what differs.',
    kind: 'tool',
    label: 'Compare Excel files',
    h1: 'Compare two Excel files by key',
    examples: ['excel'],
    preset: 'excel',
  },
  {
    path: '/compare-csv-files',
    title: 'Compare CSV Files by Key, Any Delimiter | RowSignal',
    description: 'Compare two CSV files even when one uses semicolons and European numbers. Delimiters and encodings are detected per file; nothing is uploaded.',
    kind: 'tool',
    label: 'Compare CSV files',
    h1: 'Compare CSV files by key — whatever the delimiter',
    examples: ['csv'],
    preset: 'csv',
  },
  {
    path: '/find-missing-rows',
    title: 'Find Missing Rows Between Two Lists | RowSignal',
    description: 'See which records are in one list but not the other, even when emails differ by case or spaces. Export the missing rows as a follow-up list.',
    kind: 'tool',
    label: 'Find missing rows',
    h1: 'Find missing rows between two lists',
    examples: ['missing'],
    preset: 'missing',
  },
  {
    path: '/compare-inventory',
    title: 'Compare Inventory Counts to a Stock List | RowSignal',
    description: 'Match a stock count to a system or supplier stock list by SKU. See quantity differences, uncounted items and unlisted items, with tolerances.',
    kind: 'tool',
    label: 'Compare inventory',
    h1: 'Compare an inventory count with a stock list',
    examples: ['inventory'],
    preset: 'inventory',
  },
  {
    path: '/guides/how-spreadsheet-matching-works',
    title: 'How Spreadsheet Matching Works: Keys, Not Row Order',
    description: 'Why comparing two spreadsheets line by line fails, how matching by an identifier works, and what matched, different, missing and ambiguous mean.',
    kind: 'guide',
    label: 'How spreadsheet matching works',
    h1: 'How spreadsheet matching works: keys, not row order',
    examples: ['orders'],
  },
  {
    path: '/guides/duplicate-keys-and-missing-records',
    title: 'Duplicate Keys and Missing Records: What To Do',
    description: 'What a repeated ID means, why guessing pairs is dangerous, and how adding a second identifier column turns an ambiguous group into clean matches.',
    kind: 'guide',
    label: 'Duplicate keys and missing records',
    h1: 'Duplicate keys and missing records: what to do',
    examples: ['duplicates-one-key', 'duplicates-two-keys'],
  },
  {
    path: '/guides/dates-numbers-and-leading-zeros',
    title: 'Dates, Numbers and Leading Zeros in Spreadsheet Comparisons',
    description: 'Why 00123 is not 123, how 03/04/2026 can mean two dates, what Excel does to numbers and dates, and how to set per-file formats safely.',
    kind: 'guide',
    label: 'Dates, numbers and leading zeros',
    h1: 'Dates, numbers and leading zeros',
    examples: [],
  },
  {
    path: '/privacy',
    title: 'Privacy: What RowSignal Does With Your Files',
    description: 'Files are read in your browser and are not uploaded. What is kept in memory, what is saved only if you choose, and what the site itself loads.',
    kind: 'info',
    label: 'Privacy',
    h1: 'Privacy: what RowSignal does with your files',
    examples: [],
  },
  {
    path: '/terms',
    title: 'Terms of Use | RowSignal',
    description: 'Plain-language terms for using RowSignal: what it is for, what it is not, and the limits of its results.',
    kind: 'info',
    label: 'Terms',
    h1: 'Terms of use',
    examples: [],
  },
  {
    path: '/methodology',
    title: 'Methodology: Exactly How RowSignal Compares Files',
    description: 'The matching rules in full: identifiers, duplicates, blanks, decimals, dates, formulas, approximate suggestions, limits and export safety.',
    kind: 'info',
    label: 'Methodology',
    h1: 'Methodology: exactly how RowSignal compares files',
    examples: ['orders'],
  },
  {
    path: '/about',
    title: 'About RowSignal',
    description: 'What RowSignal is for, the principles it is built on, and what it deliberately does not do.',
    kind: 'info',
    label: 'About',
    h1: 'About RowSignal',
    examples: [],
  },
  {
    path: '/contact',
    title: 'Contact and Diagnostics | RowSignal',
    description: 'How to get help, and how to download a diagnostics file that contains no file names, column names or data.',
    kind: 'info',
    label: 'Contact',
    h1: 'Contact and diagnostics',
    examples: [],
  },
];

export const NOT_FOUND: RouteDef = {
  path: '/404',
  title: 'Page not found | RowSignal',
  description: 'This page does not exist.',
  kind: 'notfound',
  label: 'Not found',
  examples: [],
};

export const routeFor = (path: string): RouteDef | undefined => ROUTES.find((r) => r.path === path);
export const TOOLS = ROUTES.filter((r) => r.kind === 'tool');
export const GUIDES = ROUTES.filter((r) => r.kind === 'guide');
