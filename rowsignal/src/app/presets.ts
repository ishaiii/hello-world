/** Presets launched from the public tool pages (`/app?preset=<id>`): role names only — no data, no rules. */
export interface Preset {
  roleNames: { A: string; B: string };
  hint: string;
}

export const PRESETS: Record<string, Preset> = {
  excel: { roleNames: { A: 'First workbook', B: 'Second workbook' }, hint: 'Add two Excel workbooks. Choose the sheet in each one if it has several.' },
  csv: { roleNames: { A: 'First CSV', B: 'Second CSV' }, hint: 'Add two CSV files. Commas, semicolons and tabs are detected for each file.' },
  missing: { roleNames: { A: 'Full list', B: 'Checked list' }, hint: 'Add the list you expect to be complete and the list you want to check against it.' },
  inventory: { roleNames: { A: 'Count sheet', B: 'Stock list' }, hint: 'Add your stock count and your system or supplier stock list. Match on SKU or item code.' },
  lists: { roleNames: { A: 'List A', B: 'List B' }, hint: 'Add the two lists. Choose the column that identifies each record, such as an email or ID.' },
};
