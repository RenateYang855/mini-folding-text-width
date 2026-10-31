import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  measureWidth,
  foldWidth,
  charWidth,
  WIDE_RANGES,
  COMBINING_RANGES,
} from '../src/index.js';

test('measureWidth: ASCII', () => {
  assert.equal(measureWidth('hello'), 5);
  assert.equal(measureWidth(''), 0);
});

test('measureWidth: Latin-1', () => {
  assert.equal(measureWidth('café'), 4);
});

test('measureWidth: CJK ideographs are width 2', () => {
  assert.equal(measureWidth('漢字'), 4);
  assert.equal(measureWidth('你好'), 4);
});

test('measureWidth: fullwidth Latin is width 2', () => {
  // U+FF21 FULLWIDTH LATIN CAPITAL LETTER A
  assert.equal(measureWidth('ＡＢ'), 4);
});

test('measureWidth: emoji are width 2', () => {
  assert.equal(measureWidth('😀'), 2);
});

test('measureWidth: combining marks are zero width', () => {
  // 'é' as 'e' + U+0301 COMBINING ACUTE ACCENT → 1, not 2.
  assert.equal(measureWidth('e\u0301'), 1);
});

test('measureWidth: ZWJ is zero width', () => {
  assert.equal(measureWidth('a\u200db'), 2);
});

test('measureWidth: Hangul Jamo non-starter is zero width', () => {
  // U+1100 choseong is wide (2); U+1161 jungseong is a joiner (0).
  assert.equal(measureWidth('\u1100\u1161'), 2);
});

test('measureWidth: throws on non-string', () => {
  assert.throws(() => measureWidth(42), TypeError);
  assert.throws(() => measureWidth(null), TypeError);
});

test('charWidth: returns expected widths for known code points', () => {
  assert.equal(charWidth(0x0061), 1);            // 'a'
  assert.equal(charWidth(0x00e9), 1);            // 'é' (precomposed)
  assert.equal(charWidth(0x0301), 0);            // combining acute
  assert.equal(charWidth(0x4e2d), 2);            // 中
  assert.equal(charWidth(0x1f600), 2);           // 😀
  assert.equal(charWidth(0x200b), 0);            // ZWSP
  assert.equal(charWidth(0x0009), 1);            // TAB
});

test('foldWidth: hard wraps at column budget', () => {
  assert.deepEqual(foldWidth('abcdef', 3), ['abc', 'def']);
  assert.deepEqual(foldWidth('abcdefg', 3), ['abc', 'def', 'g']);
});

test('foldWidth: wide characters break mid-budget correctly', () => {
  // '中' is width 2. With budget 3: '中a' = 3 → break.
  assert.deepEqual(foldWidth('中a中', 3), ['中a', '中']);
  // With budget 2: each CJK ideograph on its own line.
  assert.deepEqual(foldWidth('中日', 2), ['中', '日']);
});

test('foldWidth: a wide character does not split across the wrap', () => {
  // Budget 1: a width-2 char cannot fit, so it goes on its own line and
  // we accept the overflow rather than splitting the code point.
  assert.deepEqual(foldWidth('a中', 1), ['a', '中']);
});

test('foldWidth: combining marks stay attached to base', () => {
  // 'e' + U+0301 fits in 1 column as a unit. With budget 2 the second
  // 'e' + U+0301 also fits, yielding 'e\u0301e\u0301' on the first line.
  assert.deepEqual(foldWidth('e\u0301e\u0301e', 2),
    ['e\u0301e\u0301', 'e']);
});

test('foldWidth: explicit newlines are preserved', () => {
  assert.deepEqual(foldWidth('a\nb\nc', 10), ['a', 'b', 'c']);
  assert.deepEqual(foldWidth('aa\nbbb', 2), ['aa', 'bb', 'b']);
});

test('foldWidth: empty input yields a single empty line', () => {
  assert.deepEqual(foldWidth('', 5), ['']);
});

test('foldWidth: rejects invalid maxWidth', () => {
  assert.throws(() => foldWidth('x', 0), RangeError);
  assert.throws(() => foldWidth('x', -1), RangeError);
  assert.throws(() => foldWidth('x', 2.5), RangeError);
});

test('foldWidth: TAB is width 1, no snapping', () => {
  assert.deepEqual(foldWidth('a\tb', 2), ['a\t', 'b']);
});

test('tables are exported and well-formed', () => {
  assert.ok(Array.isArray(WIDE_RANGES));
  assert.ok(Array.isArray(COMBINING_RANGES));
  for (const r of WIDE_RANGES) {
    assert.equal(r.length, 2);
    assert.ok(r[0] <= r[1]);
  }
  for (const r of COMBINING_RANGES) {
    assert.equal(r.length, 2);
    assert.ok(r[0] <= r[1]);
  }
});
