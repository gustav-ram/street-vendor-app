// Demo logins (also listed in README.md). Every demo account uses the
// reserved .test domain and is flagged is_demo, so `npm run seed:clear` removes it.
export const DEMO_PASSWORD = 'streeteats-demo';

export const DEMO_ACCOUNTS = {
  admin: { email: 'admin@demo.test', displayName: 'Demo Admin' },
  customer: { email: 'customer@demo.test', displayName: 'Maya R.' },
  // Owns "Danger Dogs de la Esquina" (fully onboarded).
  vendor: { email: 'vendor@demo.test', vendorKey: 'danger-dogs' },
  // Vendor account with no business yet, for trying the quick start.
  newVendor: { email: 'newvendor@demo.test' },
} as const;

// Extra customers who wrote the demo reviews.
export const DEMO_REVIEWERS = ['Luis G.', 'Ana P.', 'Jordan K.', 'Sofía M.', 'Kevin T.', 'Marisol V.', 'Dani L.'];

export const DEMO_INVITE = { code: 'DEMO-2026', label: 'Demo flyers (seed data)' };
