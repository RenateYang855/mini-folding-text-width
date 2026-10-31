/**
 * core.js — character-width tables and the core folding logic.
 *
 * The width model is deliberately simple and fully self-contained:
 *   - A code point is WIDE if it belongs to a closed range in WIDE_RANGES.
 *   - A code point is COMBINING if it belongs to a closed range in
 *     COMBINING_RANGES.
 *   - Everything else (including unassigned and control code points we do
 *     not special-case) counts as 1 column.
 *
 * We treat a non-starter Hangul Jamo (range 0x1160–0x11FF) as zero-width
 * because it joins into an LV syllable rather than occupying its own cell.
 * This is the one non-obvious call; see README for why.
 */

/**
 * Closed [start, end] ranges of code points that render double-width in a
 * monospace terminal. Curated subset of UAX #11 East Asian Wide/Fullwidth —
 * we omit the deprecated and the ambiguous classes because there is no font
 * context to resolve them.
 */
export const WIDE_RANGES = [
  [0x1100, 0x115f],   // Hangul Jamo (lead/choseong), explicitly wide per UAX #11
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],   // CJK Extension A
  [0x4e00, 0x9fff],   // CJK Unified Ideographs
  [0xa000, 0xa4cf],
  [0xac00, 0xd7a3],   // Hangul Syllables (precomposed LV/LVT)
  [0xf900, 0xfaff],   // CJK Compatibility Ideographs
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],   // Fullwidth forms
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f], // Emoji block (Misc Symbols & Pictographs, Emoticons)
  [0x1f900, 0x1f9ff], // Supplemental Symbols and Pictographs
  [0x20000, 0x2fffd], // CJK Extension B–F
  [0x30000, 0x3fffd], // CJK Extension G
];

/**
 * Closed [start, end] ranges of combining (zero-width) code points: a
 * representative subset of Unicode combining marks and joiners. We include
 * the common ranges that terminals actually render as zero advance.
 */
export const COMBINING_RANGES = [
  [0x0300, 0x036f],   // Combining Diacritical Marks
  [0x0483, 0x0489],
  [0x0591, 0x05bd],
  [0x05bf, 0x05bf],
  [0x05c1, 0x05c2],
  [0x05c4, 0x05c5],
  [0x05c7, 0x05c7],
  [0x0600, 0x0605],   // Arabic formatting marks
  [0x0610, 0x061a],
  [0x061c, 0x061c],
  [0x064b, 0x065f],
  [0x0670, 0x0670],
  [0x06d6, 0x06dc],
  [0x06df, 0x06e4],
  [0x06e7, 0x06e8],
  [0x06ea, 0x06ed],
  [0x070f, 0x070f],
  [0x0711, 0x0711],
  [0x0730, 0x074a],
  [0x200b, 0x200f],   // ZWSP/ZWNJ/ZWJ/BOM-ish
  [0x202a, 0x202e],   // Bi-directional embedding controls
  [0x2060, 0x2064],
  [0x2066, 0x206f],
  [0xfe00, 0xfe0f],   // Variation selectors
  [0xfe20, 0xfe2f],   // Combining Half Marks
  [0xfeff, 0xfeff],   // BOM
];

/**
 * Hangul Jamo non-starters — joiners that fuse into an LV syllable rather
 * than rendering their own cell. We keep these in their own table to make
 * the intent explicit: they are zero-width, not "combining" in the mark
 * sense.
 */
export const HANGUL_JAMO_ZERO_WIDTH = [
  [0x1160, 0x11ff],   // Hangul Jamo (vowels + trails)
  [0xd7b0, 0xd7ff],   // Hangul Jamo Extended B
];

/**
 * Binary-search a sorted, non-overlapping list of [lo, hi] ranges for a
 * scalar code point. Returns true if cp falls inside any range.
 */
function inRanges(cp, ranges) {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const [s, e] = ranges[mid];
    if (cp < s) {
      hi = mid - 1;
    } else if (cp > e) {
      lo = mid + 1;
    } else {
      return true;
    }
  }
  return false;
}

/**
 * Column width of a single Unicode code point, ignoring surrogates.
 *
 *   - Combining marks and ZWJ-family controls: 0
 *   - Hangul Jamo joiners:                    0
 *   - East Asian wide / fullwidth / emoji:    2
 *   - Everything else:                        1
 *
 * Control characters like \n, \r, \t are NOT folded here — see foldWidth.
 */
export function charWidth(cp) {
  if (cp < 0x20) return 1; // treat C0 controls (incl. \t) as width 1
  if (inRanges(cp, COMBINING_RANGES)) return 0;
  if (inRanges(cp, HANGUL_JAMO_ZERO_WIDTH)) return 0;
  if (inRanges(cp, WIDE_RANGES)) return 2;
  return 1;
}

/**
 * Sum of charWidth across every code point in `str`.
 *
 * Iteration is by code point using string iterator semantics, which yields
 * surrogate pairs as a single 32-bit value. Invalid lone surrogates pass
 * through and count as width 1 each, matching how U+FFFD-ish fallbacks are
 * usually drawn.
 */
export function measureWidth(str) {
  if (typeof str !== 'string') {
    throw new TypeError('measureWidth expects a string');
  }
  let total = 0;
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    total += charWidth(cp);
  }
  // Lone surrogate pairs in `for...of` contribute their width via the
  // high/low surrogate's own code point, so no special handling is needed.
  return total;
}

/**
 * Fold `str` into lines no longer than `maxWidth` columns.
 *
 * Folding policy, stated plainly so the tests can pin it down:
 *   - Hard wrap on column count. No word-boundary heuristics.
 *   - Newlines already in the string are preserved as explicit breaks.
 *   - \r is treated as a normal single-column character (not a CRLF
 *     terminator) so that "a\nb" gives three lines, not two.
 *   - \t is width 1. We do not snap to tab stops.
 *   - Combining marks attach to the preceding base grapheme, so they never
 *     force a break and they never count toward the column budget on their
 *     own line.
 *
 * Returns an array of strings (the lines), with NO trailing newline. Empty
 * input yields `['']`.
 */
export function foldWidth(str, maxWidth) {
  if (typeof str !== 'string') {
    throw new TypeError('foldWidth expects a string');
  }
  if (!Number.isInteger(maxWidth) || maxWidth < 1) {
    throw new RangeError('foldWidth: maxWidth must be a positive integer');
  }

  const lines = [];
  let buf = '';
  let col = 0;

  // We walk by code point so combining marks stay attached to their base.
  const chars = [...str];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const cp = ch.codePointAt(0);

    if (ch === '\n') {
      lines.push(buf);
      buf = '';
      col = 0;
      continue;
    }

    const w = charWidth(cp);

    // A combining/zero-width character never starts a new line — it just
    // rides with whatever we already have in buf. If buf is empty (a
    // combining mark at line start), we still keep it; a real terminal
    // would drop it onto an empty cell.
    if (w === 0) {
      buf += ch;
      continue;
    }

    if (col + w > maxWidth) {
      lines.push(buf);
      buf = ch;
      col = w;
    } else {
      buf += ch;
      col += w;
    }
  }

  lines.push(buf);
  return lines;
}
