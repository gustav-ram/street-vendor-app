import type { BadgeCriteria, VerificationProgress } from './schemas/verification';

/**
 * The four "Community Verified" steps, ready to show: a translation key
 * (dashboard namespace) with its values for what's needed and for how far
 * along the vendor is, plus a 0–1 fraction for a progress bar.
 */
export type BadgeTextKey =
  | 'badge.liveDays'
  | 'badge.liveDaysProgress'
  | 'badge.confirmations'
  | 'badge.confirmationsProgress'
  | 'badge.reviews'
  | 'badge.reviewsProgress'
  | 'badge.reviewsNone'
  | 'badge.reports'
  | 'badge.reportsOk'
  | 'badge.reportsProgress';
type Text = [BadgeTextKey, Record<string, string | number>];

export interface BadgeStep {
  key: 'liveDays' | 'confirmations' | 'reviews' | 'reports';
  met: boolean;
  fraction: number;
  need: Text;
  have: Text;
}

/** What each step asks for, for "How is this earned?" on a vendor's public page. */
export function badgeNeeds(c: BadgeCriteria): Text[] {
  return [
    ['badge.liveDays', { count: c.liveDays }],
    ['badge.confirmations', { count: c.confirmations, accounts: c.confirmationAccounts, days: c.confirmationDays, window: c.confirmationWindowDays }],
    ['badge.reviews', { count: c.reviews, average: c.reviewAverage.toFixed(1) }],
    ['badge.reports', { days: c.reportWindowDays }],
  ];
}

const ratio = (have: number, need: number) => (need <= 0 ? 1 : Math.min(1, have / need));

export function badgeSteps(v: VerificationProgress): BadgeStep[] {
  const c = v.criteria;
  const p = v.progress;
  const done = (met: boolean, fraction: number) => (met ? 1 : Math.min(fraction, 0.95));
  const [liveDays, confirmations, reviews, reports] = badgeNeeds(c) as [Text, Text, Text, Text];
  return [
    {
      key: 'liveDays',
      met: p.liveDays.met,
      fraction: done(p.liveDays.met, ratio(p.liveDays.count, c.liveDays)),
      need: liveDays,
      have: ['badge.liveDaysProgress', { count: p.liveDays.count, total: c.liveDays }],
    },
    {
      key: 'confirmations',
      met: p.confirmations.met,
      fraction: done(
        p.confirmations.met,
        Math.min(
          ratio(p.confirmations.count, c.confirmations),
          ratio(p.confirmations.accounts, c.confirmationAccounts),
          ratio(p.confirmations.days, c.confirmationDays),
        ),
      ),
      need: confirmations,
      have: ['badge.confirmationsProgress', { count: p.confirmations.count, accounts: p.confirmations.accounts, days: p.confirmations.days }],
    },
    {
      key: 'reviews',
      met: p.reviews.met,
      fraction: done(p.reviews.met, ratio(p.reviews.count, c.reviews)),
      need: reviews,
      have:
        p.reviews.average === null
          ? ['badge.reviewsNone', {}]
          : ['badge.reviewsProgress', { count: p.reviews.count, average: p.reviews.average.toFixed(1) }],
    },
    {
      key: 'reports',
      met: p.reports.met,
      fraction: p.reports.met ? 1 : 0,
      need: reports,
      have: p.reports.upheld === 0 ? ['badge.reportsOk', {}] : ['badge.reportsProgress', { count: p.reports.upheld }],
    },
  ];
}
