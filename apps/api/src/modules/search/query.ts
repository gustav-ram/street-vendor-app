import { inArray, sql } from 'drizzle-orm';
import { CATEGORY_BASE_TAG, type Category, normalizeText, type Tag } from '@streeteats/shared';
import type { Db } from '../../db/client';
import { tags, tagSynonyms } from '../../db/schema';

/**
 * Understands a free-text query using the synonym table:
 * "LA style hot dog" -> tags bacon-wrapped-hot-dog, danger-dog, sonoran-dog, hot-dog.
 * Longest phrases win; words that aren't a synonym fall through to
 * full-text search over vendor names, menus and descriptions.
 */
export interface ParsedQuery {
  normalized: string;
  tagIds: string[];
  matchedTags: Tag[];
  /** Categories whose base tag matched ("flores" -> flowers). */
  categories: Category[];
  /** Remaining words for full-text search (prefix matches). */
  ftsTokens: string[];
}

const MAX_PHRASE_WORDS = 6;

// Filler words that shouldn't have to appear in a vendor's text to match.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'for', 'with', 'near', 'me', 'my', 'best', 'good', 'food', 'style', 'cart', 'stand', 'vendor', 'open', 'now',
  'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'y', 'o', 'con', 'cerca', 'mi', 'comida', 'estilo', 'carrito', 'puesto', 'abierto', 'ahora',
]);

const CATEGORY_BY_BASE_TAG = new Map(
  Object.entries(CATEGORY_BASE_TAG)
    .filter((e): e is [Category, string] => e[1] !== null)
    .map(([category, slug]) => [slug, category]),
);

// The synonym table is small and changes rarely: keep it in memory.
let synonymCache: { at: number; byPhrase: Map<string, string[]> } | null = null;
const CACHE_MS = 5 * 60_000;

async function synonymIndex(db: Db) {
  if (synonymCache && Date.now() - synonymCache.at < CACHE_MS) return synonymCache.byPhrase;
  const rows = await db.select({ phrase: tagSynonyms.phrase, tagId: tagSynonyms.tagId }).from(tagSynonyms);
  const byPhrase = new Map<string, string[]>();
  for (const r of rows) byPhrase.set(r.phrase, [...(byPhrase.get(r.phrase) ?? []), r.tagId]);
  synonymCache = { at: Date.now(), byPhrase };
  return byPhrase;
}

export function clearSynonymCache() {
  synonymCache = null;
}

export async function parseQuery(db: Db, q: string | undefined): Promise<ParsedQuery | null> {
  const normalized = normalizeText(q ?? '');
  if (!normalized) return null;
  const words = normalized.split(' ').slice(0, 12);
  const index = await synonymIndex(db);

  const tagIds = new Set<string>();
  const consumed = new Array<boolean>(words.length).fill(false);
  for (let n = Math.min(MAX_PHRASE_WORDS, words.length); n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      if (consumed.slice(i, i + n).some(Boolean)) continue;
      const hit = index.get(words.slice(i, i + n).join(' '));
      if (!hit) continue;
      hit.forEach((id) => tagIds.add(id));
      for (let k = i; k < i + n; k++) consumed[k] = true;
    }
  }

  const leftover = words.filter((w, i) => !consumed[i] && !STOPWORDS.has(w));

  // Typo tolerance: nothing matched exactly, so try close synonym phrases.
  if (tagIds.size === 0) {
    const fuzzy = await db.execute<{ tag_id: string }>(sql`
      SELECT DISTINCT tag_id FROM (
        SELECT tag_id, similarity(phrase, ${normalized}) AS s
        FROM tag_synonyms
        WHERE phrase % ${normalized}
        ORDER BY s DESC
        LIMIT 5
      ) best
      WHERE s >= 0.45`);
    fuzzy.forEach((r) => tagIds.add(r.tag_id));
  }

  const matched = tagIds.size
    ? await db
        .select({ id: tags.id, slug: tags.slug, nameEn: tags.nameEn, nameEs: tags.nameEs })
        .from(tags)
        .where(inArray(tags.id, [...tagIds]))
    : [];
  const categories = matched.map((t) => CATEGORY_BY_BASE_TAG.get(t.slug)).filter((c): c is Category => Boolean(c));

  return {
    normalized,
    tagIds: [...tagIds],
    matchedTags: matched.map(({ slug, nameEn, nameEs }) => ({ slug, nameEn, nameEs })),
    categories,
    // Tokens are normalized (letters and digits only), so they are safe tsquery terms.
    ftsTokens: leftover.slice(0, 6),
  };
}

/** SQL condition matching a vendor row aliased `v` against a parsed query. */
export function textMatchSql(pq: ParsedQuery) {
  const parts = [];
  if (pq.tagIds.length) {
    parts.push(sql`EXISTS (SELECT 1 FROM vendor_tags vt WHERE vt.vendor_id = v.id AND vt.tag_id IN ${pq.tagIds})`);
  }
  if (pq.categories.length) parts.push(sql`v.categories && ${textArray(pq.categories)}`);
  if (pq.ftsTokens.length) {
    const tsq = pq.ftsTokens.map((t) => `${t}:*`).join(' & ');
    parts.push(sql`v.search_doc @@ to_tsquery('simple', ${tsq})`);
  }
  // Typos in a business name ("danger dogz", "tacos el guero").
  parts.push(sql`similarity(lower(unaccent(v.display_name)), ${pq.normalized}) >= 0.35`);
  return sql`(${sql.join(parts, sql` OR `)})`;
}

export function textArray(values: readonly string[]) {
  return sql`ARRAY[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`;
}
