import { QueryClient } from '@tanstack/react-query';

/** One client for the app, so non-React code (the offline outbox) can update what screens show. */
export const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });

/** The signed-in vendor's own business (GET /vendor/me). */
export const MY_VENDOR_KEY = ['myVendor'] as const;
