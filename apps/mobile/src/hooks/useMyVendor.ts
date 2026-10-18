import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MyVendor } from '@streeteats/shared';
import { vendorApi } from '@/api/vendor';

export const MY_VENDOR_KEY = ['myVendor'] as const;

export function useMyVendor() {
  return useQuery({ queryKey: MY_VENDOR_KEY, queryFn: vendorApi.me, retry: false });
}

/** Writes the server's latest copy into the cache (after a PATCH or quick start). */
export function useSetMyVendor() {
  const qc = useQueryClient();
  return (v: MyVendor) => qc.setQueryData(MY_VENDOR_KEY, v);
}
