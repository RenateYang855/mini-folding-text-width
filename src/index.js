/**
 * mini-folding-text-width — public entry point.
 *
 * Re-exports the width table constants and the three core functions. No
 * runtime behavior is added here; this file exists so consumers can import
 * from `mini-folding-text-width` and see the whole surface at once.
 */
export {
  measureWidth,
  foldWidth,
  charWidth,
  WIDE_RANGES,
  COMBINING_RANGES,
  HANGUL_JAMO_ZERO_WIDTH,
} from './core.js';
