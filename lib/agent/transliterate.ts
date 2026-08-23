/**
 * Devanagari → Latin transliteration for place names.
 *
 * The agent hears "नासिक" and passes it straight to the weather tool, but the
 * geocoder only indexes Latin spellings. Rather than hardcode a district list,
 * this romanises mechanically — approximate spellings ("nasika") still match,
 * because the geocoder is fuzzy.
 *
 * Deliberately not a general Hindi transliterator: it handles the consonant,
 * vowel and matra range that appears in place names, and nothing more.
 */

const DEVANAGARI = /[ऀ-ॿ]/;

/** Independent vowels. */
const VOWELS: Record<string, string> = {
  अ: 'a', आ: 'a', इ: 'i', ई: 'i', उ: 'u', ऊ: 'u',
  ऋ: 'ri', ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au',
};

/** Vowel signs that replace a consonant's inherent "a". */
const MATRAS: Record<string, string> = {
  'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u',
  'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
};

const CONSONANTS: Record<string, string> = {
  क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'ng',
  च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'n',
  ट: 't', ठ: 'th', ड: 'd', ढ: 'dh', ण: 'n',
  त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n',
  प: 'p', फ: 'ph', ब: 'b', भ: 'bh', म: 'm',
  य: 'y', र: 'r', ल: 'l', व: 'v', ळ: 'l',
  श: 'sh', ष: 'sh', स: 's', ह: 'h',
  // Nukta forms, common in Urdu-influenced place names.
  क़: 'q', ख़: 'kh', ग़: 'gh', ज़: 'z', ड़: 'r', ढ़: 'rh', फ़: 'f',
};

const VIRAMA = '्';
const ANUSVARA = 'ं';
const CHANDRABINDU = 'ँ';
const VISARGA = 'ः';

export const hasDevanagari = (value: string) => DEVANAGARI.test(value);

/**
 * Romanises a Devanagari string. Latin characters pass through untouched, so
 * mixed input like "नासिक district" survives.
 */
export function transliterate(input: string): string {
  const characters = [...input.normalize('NFC')];
  let output = '';

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    const next = characters[index + 1];

    if (CONSONANTS[character]) {
      output += CONSONANTS[character];

      // A following matra or virama replaces the inherent vowel; otherwise the
      // consonant carries an implicit "a".
      if (next && MATRAS[next]) {
        output += MATRAS[next];
        index += 1;
      } else if (next === VIRAMA) {
        index += 1;
      } else if (next !== undefined) {
        // Hindi drops the final inherent vowel — "नासिक" is said "nasik", not
        // "nasika" — so only non-final consonants carry it.
        output += 'a';
      }
      continue;
    }

    if (VOWELS[character]) {
      output += VOWELS[character];
      continue;
    }

    if (character === ANUSVARA || character === CHANDRABINDU) {
      output += 'n';
      continue;
    }

    if (character === VISARGA) {
      output += 'h';
      continue;
    }

    // Anything else — spaces, Latin letters, punctuation — passes through.
    if (!MATRAS[character] && character !== VIRAMA) output += character;
  }

  return output.trim();
}
