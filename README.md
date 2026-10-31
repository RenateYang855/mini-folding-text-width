# mini-folding-text-width

Measures the rendered column width of Unicode strings in a monospace cell model, accounting for East Asian wide characters, fullwidth forms, emoji, combining marks, and zero-width joiners.

```js
import { measureWidth, foldWidth, charWidth } from 'mini-folding-text-width';

measureWidth('café');            // 4
measureWidth('漢字');            // 4 — each CJK ideograph is 2 columns
measureWidth('e\u0301');         // 1 — combining acute attaches to 'e'

foldWidth('中日友好', 6);         // ['中日', '友好']
foldWidth('abcdef', 3);          // ['abc', 'def']

charWidth(0x1f600);              // 2 — emoji
charWidth(0x0301);               // 0 — combining mark
```

## Why this exists

Terminals and fixed-cell text layouts need a width estimate before they can wrap text, but the actual glyph width depends on the font. This library picks the convention used by most monospace renderers and sticks to it: a closed, hand-curated set of Unicode ranges decides whether a code point is width 0, 1, or 2. There is no font probing, no UAX #11 "Ambiguous" class (that one is irreducibly font-dependent), and no grapheme-cluster segmentation beyond attaching combining marks to their base.

## The edge you will hit

A width-2 character that lands one column short of the budget does **not** split. `foldWidth('a中', 1)` returns `['a', '中']` — the wide character overflows onto its own line rather than being sliced. This is intentional: code points are atomic for our purposes. If you need soft wrapping at word boundaries, layer that policy on top of the lines this returns.

Hangul Jamo vowels and trails (`U+1160`–`U+11FF`) are treated as zero-width because they fuse into an LV syllable rather than occupying a cell. Precomposed Hangul Syllables (`U+AC00`–`U+D7A3`) are width 2, as terminals draw them.

## Exports

- `measureWidth(str): number` — total column count.
- `foldWidth(str, maxWidth): string[]` — hard-wrap into lines, preserving `\n`.
- `charWidth(cp): number` — width of a single code point (0, 1, or 2).
- `WIDE_RANGES`, `COMBINING_RANGES`, `HANGUL_JAMO_ZERO_WIDTH` — the range tables, exported for inspection and reuse.
