// Fixed vocabularies shared by the API, web and mobile apps.
// User-facing labels live in the i18n files, keyed by these values.

export const ROLES = ['customer', 'vendor', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const CATEGORIES = [
  'hot_dogs',
  'tacos',
  'flowers',
  'elote',
  'fruit',
  'churros',
  'tamales',
  'pupusas',
  'paletas',
  'drinks',
  'snacks',
  'bakery',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

// Vendors only pick the type. Account handles or numbers are never collected.
export const PAYMENT_METHODS = ['cash', 'card', 'venmo', 'zelle', 'cash_app', 'apple_pay'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// ISO 639 codes. Includes Indigenous languages widely spoken by LA street vendors.
export const LANGUAGES = [
  'en',
  'es',
  'zap', // Zapotec
  'mix', // Mixtec
  'nah', // Nahuatl
  'quc', // K'iche'
  'kjb', // Q'anjob'al
  'ko',
  'zh',
  'tl',
  'vi',
  'hy',
  'ru',
  'pt',
  'fr',
  'ar',
  'fa',
  'ja',
  'th',
] as const;
export type LanguageCode = (typeof LANGUAGES)[number];

export const UI_LOCALES = ['en', 'es'] as const;
export type UiLocale = (typeof UI_LOCALES)[number];

export const PRECISIONS = ['approximate', 'exact'] as const;
export type Precision = (typeof PRECISIONS)[number];

export const MODERATION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export const REPORT_TARGETS = ['vendor', 'photo', 'review', 'status_post', 'upcoming_post'] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const REPORT_REASONS = ['spam', 'offensive', 'harassment', 'unsafe', 'wrong_info', 'privacy', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ['open', 'dismissed', 'upheld', 'resolved'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const VERIFICATION_STATUSES = ['none', 'verified', 'revoked'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const AUTO_OFF_HOURS = [2, 4, 8] as const;

export const LIMITS = {
  passwordMin: 10,
  passwordMax: 128,
  pinLength: 6,
  displayNameMax: 60,
  descriptionMax: 600,
  statusPostMax: 140,
  reviewMax: 500,
  menuItemNameMax: 60,
  menuItemDescriptionMax: 200,
  menuItemsMax: 60,
  priceCentsMax: 100_000,
  placeLabelMax: 80,
  reportDetailsMax: 500,
  photoMaxBytes: 10 * 1024 * 1024,
} as const;
