/* ════════════════════════════════════════════════
   syllable.js — Malay Syllabifier (Pembahagi Suku Kata)

   Rules (Aturan Suku Kata BM):
   1. Setiap suku kata mesti ada satu vokal
   2. V·CV  — satu konsonan antara dua vokal: pergi ke suku kata berikut
   3. VC·CV — dua konsonan: dibahagi di tengah
   4. VCC·CV — tiga konsonan: dua pertama, satu ke hadapan
   5. Digraf (ng, ny, sy, kh, gh) dikira satu huruf
   6. Diftong (ai, au, oi, ua, ia) kekal dalam satu suku kata
   ════════════════════════════════════════════════ */

const VOWELS    = new Set(['a','e','i','o','u','A','E','I','O','U']);
const DIGRAPHS  = ['ng','ny','sy','kh','gh'];          // longest first
const DIPHTHONGS = new Set(['ai','au','oi','ua','ia']); // Malay diphthongs

function isVowel(c) { return VOWELS.has(c); }

/**
 * Split a single token (word + surrounding punctuation) into suku kata.
 * Returns array of strings, e.g. ["se","la","mat"] for "selamat"
 * Punctuation is kept attached to nearest syllable.
 *
 * @param {string} token
 * @returns {string[]}
 */
function splitSukuKata(token) {
  if (!token) return [token];

  // Separate leading / trailing punctuation
  const leadPunct = token.match(/^[^a-zA-Z]*/)?.[0] ?? '';
  const trailPunct = token.match(/[^a-zA-Z]*$/)?.[0] ?? '';
  const core = token.slice(leadPunct.length, token.length - trailPunct.length || undefined);

  if (!core) return [token];

  const syllables = _syllabifyCore(core);

  // Reattach punctuation to first and last syllable
  syllables[0] = leadPunct + syllables[0];
  syllables[syllables.length - 1] += trailPunct;

  return syllables;
}

/**
 * Internal: syllabify an alphabetic-only string.
 * @param {string} word
 * @returns {string[]}
 */
function _syllabifyCore(word) {
  /* ── Step 1: Tokenise into units (digraph = 1 unit) ── */
  const units = [];
  const lw = word.toLowerCase();
  let i = 0;

  while (i < word.length) {
    let matched = false;
    for (const dg of DIGRAPHS) {
      if (lw.startsWith(dg, i)) {
        units.push({ text: word.slice(i, i + dg.length), vowel: false });
        i += dg.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      units.push({ text: word[i], vowel: isVowel(word[i]) });
      i++;
    }
  }

  /* ── Step 2: Locate vowel positions ── */
  const vowelPos = units.reduce((acc, u, idx) => {
    if (u.vowel) acc.push(idx);
    return acc;
  }, []);

  // 0 or 1 vowel → can't split
  if (vowelPos.length <= 1) return [word];

  /* ── Step 3: Determine split points ── */
  const splitPoints = [];

  for (let v = 0; v < vowelPos.length - 1; v++) {
    const v1 = vowelPos[v];
    const v2 = vowelPos[v + 1];

    // Adjacent vowels: check for diphthong
    if (v2 === v1 + 1) {
      const pair = (units[v1].text + units[v2].text).toLowerCase();
      if (!DIPHTHONGS.has(pair)) {
        splitPoints.push(v2); // VV but not diphthong → V|V
      }
      continue;
    }

    // Consonants between v1 and v2
    const cons = [];
    for (let k = v1 + 1; k < v2; k++) cons.push(k);

    if (cons.length === 1) {
      // VCV → V|CV  (consonant goes to next syllable)
      splitPoints.push(cons[0]);
    } else if (cons.length >= 2) {
      // VCCV → VC|CV  (first consonant stays, rest go next)
      splitPoints.push(cons[1]);
    }
    // 0 consonants between non-adjacent vowels shouldn't happen, skip
  }

  /* ── Step 4: Build syllable strings ── */
  splitPoints.sort((a, b) => a - b);
  const syllables = [];
  let start = 0;

  for (const sp of splitPoints) {
    const s = units.slice(start, sp).map(u => u.text).join('');
    if (s) syllables.push(s);
    start = sp;
  }
  const last = units.slice(start).map(u => u.text).join('');
  if (last) syllables.push(last);

  return syllables.length > 0 ? syllables : [word];
}
