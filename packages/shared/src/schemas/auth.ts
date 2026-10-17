import { z } from 'zod';
import { LIMITS, UI_LOCALES } from '../constants';

export const emailSchema = z.email().max(254).transform((s) => s.trim().toLowerCase());

// Phone is an optional login identifier only (never displayed, never texted).
// Stored in a loose E.164-ish form: digits with an optional leading +.
export const phoneSchema = z
  .string()
  .transform((s) => s.replace(/[\s().-]/g, ''))
  .pipe(z.string().regex(/^\+?[0-9]{7,15}$/, 'invalid_phone'));

export const passwordSchema = z.string().min(LIMITS.passwordMin).max(LIMITS.passwordMax);
export const pinSchema = z.string().regex(new RegExp(`^[0-9]{${LIMITS.pinLength}}$`), 'invalid_pin');

export const credentialSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('password'), secret: passwordSchema }),
  z.object({ kind: z.literal('pin'), secret: pinSchema }),
]);

const identifierFields = {
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
};

export const registerSchema = z
  .object({
    ...identifierFields,
    role: z.enum(['customer', 'vendor']),
    credential: credentialSchema,
    // Public nickname for customers (shown on reviews). Vendors set a business name during onboarding.
    displayName: z.string().trim().min(1).max(LIMITS.displayNameMax).optional(),
    locale: z.enum(UI_LOCALES).optional(),
    inviteCode: z.string().trim().max(32).optional(),
  })
  .refine((v) => Boolean(v.email) !== Boolean(v.phone), { message: 'email_or_phone_required' });
export type RegisterInput = z.input<typeof registerSchema>;

export const loginSchema = z
  .object({
    ...identifierFields,
    secret: z.string().min(1).max(LIMITS.passwordMax),
  })
  .refine((v) => Boolean(v.email) !== Boolean(v.phone), { message: 'email_or_phone_required' });
export type LoginInput = z.input<typeof loginSchema>;

// Mobile sends the refresh token in the body; web relies on the httpOnly cookie.
export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(200).optional() });

export const updateMeSchema = z.object({
  displayName: z.string().trim().min(1).max(LIMITS.displayNameMax).optional(),
  locale: z.enum(UI_LOCALES).optional(),
});

export const meSchema = z.object({
  id: z.uuid(),
  role: z.enum(['customer', 'vendor', 'admin']),
  displayName: z.string().nullable(),
  locale: z.enum(UI_LOCALES),
  hasEmail: z.boolean(),
  hasPhone: z.boolean(),
  vendorId: z.uuid().nullable(),
  createdAt: z.string(),
});
export type Me = z.infer<typeof meSchema>;

export const authResponseSchema = z.object({
  accessToken: z.string(),
  accessTokenExpiresAt: z.string(),
  refreshToken: z.string().optional(),
  user: meSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;
