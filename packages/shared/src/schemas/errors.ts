import { z } from 'zod';

// The API answers with stable error codes; each app translates them
// (i18n key `errors.<code>`), so no English prose leaks into Spanish UIs.
export const ERROR_CODES = [
  'validation_failed',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'invalid_credentials',
  'account_locked',
  'identifier_taken',
  'invalid_invite',
  'payload_too_large',
  'onboarding_required',
  'already_onboarded',
  'not_live',
  'live_elsewhere',
  'vacation_mode',
  // Photos and uploads
  'unsupported_media',
  'image_too_large',
  'upload_incomplete',
  'offset_mismatch',
  // "Still here?"
  'too_far',
  'account_too_new',
  'internal',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    // Field-level issues for validation errors (paths + zod codes), safe to show.
    issues: z.array(z.object({ path: z.string(), code: z.string() })).optional(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
