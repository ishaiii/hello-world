/**
 * Minimal helpers for the regular, machine-written XML inside OOXML packages. No general XML
 * parser, no DTD or external-entity handling: only the five predefined entities, numeric
 * character references, and OOXML's `_xHHHH_` escapes are decoded.
 */

const ENTITY_RE = /&(?:#x([0-9a-fA-F]+)|#(\d+)|(amp|lt|gt|quot|apos));/g;
const UNDERSCORE_ESC_RE = /_x([0-9a-fA-F]{4})_/g;

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function codePoint(n: number): string {
  if (n === 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return '�';
  return String.fromCodePoint(n);
}

export function decodeXmlText(s: string): string {
  let out = s;
  if (out.includes('&')) {
    out = out.replace(ENTITY_RE, (_m, hex?: string, dec?: string, named?: string) => {
      if (named) return NAMED[named]!;
      return codePoint(hex ? parseInt(hex, 16) : parseInt(dec!, 10));
    });
  }
  if (out.includes('_x')) {
    // `_x005F_` is an escaped literal underscore; anything else is an escaped control character.
    out = out.replace(UNDERSCORE_ESC_RE, (_m, hex: string) => {
      const n = parseInt(hex, 16);
      return n === 0x5f ? '_' : codePoint(n);
    });
  }
  return out;
}

const ATTR_RE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export function parseAttrs(tagBody: string): Record<string, string> {
  const out: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(tagBody)) !== null) {
    out[m[1]!] = decodeXmlText(m[2] ?? m[3] ?? '');
  }
  return out;
}

const T_RE = /<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g;
const RPH_RE = /<rPh\b[\s\S]*?<\/rPh>/g;

/** Concatenate the `<t>` text runs of a shared-string item or inline string (phonetic runs excluded). */
export function collectText(xml: string): string {
  const body = xml.includes('<rPh') ? xml.replace(RPH_RE, '') : xml;
  let out = '';
  T_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = T_RE.exec(body)) !== null) {
    if (m[1] !== undefined) out += decodeXmlText(m[1]);
  }
  return out;
}

export function isTruthy(v: string | undefined): boolean {
  return v === '1' || v === 'true';
}

/** Resolve a relationship target relative to the `xl/` folder, normalising `..` segments. */
export function resolvePartPath(target: string): string {
  const raw = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const out: string[] = [];
  for (const seg of raw.split('/')) {
    if (seg === '..') out.pop();
    else if (seg !== '.' && seg !== '') out.push(seg);
  }
  return out.join('/');
}
