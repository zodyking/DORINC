/**
 * Normalisation applied to every outgoing staff message (email + DM) before it
 * is stored and delivered:
 *  - auto sentence casing (capitalise the first letter of each sentence)
 *  - profanity masking (replace flagged words with asterisks)
 *
 * Kept dependency-free so it can run in Nuxt (TS) and Node workers alike.
 */

/** Words that get masked in outgoing customer/staff messages. */
const PROFANITY_WORDS = [
  'fuck', 'fuk', 'fucker', 'motherfucker', 'shit', 'bullshit', 'bitch',
  'bastard', 'asshole', 'ass', 'dick', 'douche', 'cunt', 'prick', 'piss',
  'slut', 'whore', 'wanker', 'bollocks', 'crap', 'damn', 'goddamn',
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'twat', 'jackass',
]

// Leetspeak-tolerant character classes so simple obfuscation is still caught.
const LEET_MAP: Record<string, string> = {
  a: '[a@4]',
  b: '[b8]',
  e: '[e3]',
  i: '[i1!|]',
  l: '[l1|]',
  o: '[o0]',
  s: '[s$5]',
  t: '[t7]',
}

function wordToPattern(word: string): string {
  return word
    .split('')
    .map(ch => LEET_MAP[ch] ?? ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('')
}

const PROFANITY_RE = new RegExp(
  `\\b(?:${PROFANITY_WORDS.map(wordToPattern).join('|')})\\b`,
  'gi',
)

/** Replace flagged words with an asterisk mask of the same length. */
export function filterProfanity(text: string): string {
  return text.replace(PROFANITY_RE, match => '*'.repeat(match.length))
}

// Characters allowed to precede the first letter of a sentence (quotes/brackets).
const SENTENCE_LEADING_RE = /["'“”‘’([{*_>-]/

/**
 * Capitalise the first alphabetic character of the message and of every
 * sentence that follows terminal punctuation. Existing capitals (names,
 * acronyms) are preserved — only lowercase sentence starts are lifted.
 *
 * A period only starts a new sentence when it is followed by whitespace, so
 * URLs, emails and abbreviations (e.g. "devononsiterepairs.com") are untouched.
 */
export function toSentenceCase(text: string): string {
  const chars = [...text]
  let capitalizeNext = true

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i]!

    if (capitalizeNext) {
      if (/\p{L}/u.test(char)) {
        chars[i] = char.toLocaleUpperCase()
        capitalizeNext = false
      }
      else if (!/\s/.test(char) && !SENTENCE_LEADING_RE.test(char)) {
        // A digit or other glyph opens the sentence — stop forcing capitals.
        capitalizeNext = false
      }
      continue
    }

    if (char === '\n') {
      capitalizeNext = true
    }
    else if (/[.!?]/.test(char)) {
      const next = chars[i + 1]
      if (next === undefined || /\s/.test(next)) capitalizeNext = true
    }
  }

  return chars.join('')
}

/** Apply sentence casing + profanity masking to an outgoing message body. */
export function normalizeOutgoingMessage(text: string): string {
  if (!text) return text
  return filterProfanity(toSentenceCase(text))
}
