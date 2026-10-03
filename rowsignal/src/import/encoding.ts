export type EncodingChoice = 'auto' | 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252' | 'windows-1250' | 'iso-8859-15';

export const ENCODING_LABELS: Record<EncodingChoice, string> = {
  auto: 'Detect automatically',
  'utf-8': 'UTF-8',
  'utf-16le': 'UTF-16 (little-endian)',
  'utf-16be': 'UTF-16 (big-endian)',
  'windows-1252': 'Windows-1252 (Western European)',
  'windows-1250': 'Windows-1250 (Central European)',
  'iso-8859-15': 'ISO-8859-15 (Latin-9)',
};

export interface Decoded {
  text: string;
  /** Encoding actually used. */
  encoding: Exclude<EncodingChoice, 'auto'>;
  /** Plain-language explanation shown when the choice was not obvious. */
  note?: string;
}

function guessUtf16WithoutBom(bytes: Uint8Array): 'utf-16le' | 'utf-16be' | null {
  const n = Math.min(bytes.length, 400);
  if (n < 8) return null;
  let even = 0;
  let odd = 0;
  for (let i = 0; i < n; i++) {
    if (bytes[i] === 0) {
      if (i % 2 === 0) even++;
      else odd++;
    }
  }
  const threshold = n * 0.2;
  if (odd > threshold && even < n * 0.02) return 'utf-16le';
  if (even > threshold && odd < n * 0.02) return 'utf-16be';
  return null;
}

/** Decode bytes to text. A byte-order mark wins; otherwise strict UTF-8 is tried before falling back. */
export function decodeText(bytes: Uint8Array, choice: EncodingChoice): Decoded {
  if (choice !== 'auto') {
    return { text: new TextDecoder(choice).decode(bytes), encoding: choice };
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'utf-8', note: 'Starts with a UTF-8 byte-order mark (removed).' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(bytes), encoding: 'utf-16le', note: 'Starts with a UTF-16 byte-order mark.' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(bytes), encoding: 'utf-16be', note: 'Starts with a UTF-16 byte-order mark.' };
  }
  const u16 = guessUtf16WithoutBom(bytes);
  if (u16) return { text: new TextDecoder(u16).decode(bytes), encoding: u16, note: 'Detected as UTF-16 from the byte pattern.' };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch {
    return {
      text: new TextDecoder('windows-1252').decode(bytes),
      encoding: 'windows-1252',
      note: 'The file is not valid UTF-8, so it was read as Windows-1252. If accented or non-English characters look wrong, choose another encoding.',
    };
  }
}
