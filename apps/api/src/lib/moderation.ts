import { normalizeText } from '@streeteats/shared';

/**
 * A basic screen for review text (PLAN.md §9.7). Anything it flags waits for
 * a moderator instead of appearing right away. It's deliberately simple: it
 * catches links and contact details (spam, or someone posting a vendor's
 * phone number) and a short list of slurs and insults in English and Spanish.
 */

const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|ly|app|xyz)\b/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
// 7+ digits, allowing spaces, dots, dashes and parentheses between them.
const PHONE = /(?:\d[\s().-]*){7,}/;

const FLAGGED_WORDS = [
  // English
  'fuck', 'fucking', 'fucked', 'motherfucker', 'shit', 'shitty', 'bullshit', 'asshole', 'bitch', 'cunt', 'whore', 'slut', 'retard', 'nigger', 'nigga', 'faggot', 'fag', 'spic', 'wetback', 'beaner', 'chink', 'kike', 'tranny',
  // Spanish
  'puta', 'puto', 'pendejo', 'pendeja', 'cabron', 'chinga', 'chingada', 'chingado', 'chingar', 'verga', 'culero', 'culera', 'maricon', 'mayate', 'joto', 'zorra', 'mierda',
];
// Whole words (and plurals) only, so "spicy" or "Scunthorpe" don't trip it.
const FLAGGED = new RegExp(`\\b(?:${FLAGGED_WORDS.join('|')})(?:s|es)?\\b`);

export function needsReview(text: string): boolean {
  if (!text.trim()) return false;
  if (LINK.test(text) || EMAIL.test(text) || PHONE.test(text)) return true;
  return FLAGGED.test(normalizeText(text));
}
