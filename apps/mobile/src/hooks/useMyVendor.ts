import { useQuery } from '@tanstack/react-query';
import Storage from 'expo-sqlite/kv-store';
import { useMemo } from 'react';
import { applyPending, type MyVendor } from '@streeteats/shared';
import { vendorApi } from '@/api/vendor';
import { MY_VENDOR_KEY, queryClient } from '@/lib/queryClient';
import { useOutboxItems } from '@/offline/outbox';

export { MY_VENDOR_KEY };

/**
 * The vendor's business, kept on the phone so the dashboard opens and works
 * with no signal (PLAN.md §6.4). What's shown is the last copy from the
 * server with every change still waiting in the outbox laid on top.
 */
const CACHE_KEY = 'vendor.me.v1';

function readCache(): { v: MyVendor; at: number } | null {
  try {
    const raw = Storage.getItemSync(CACHE_KEY);
    return raw ? (JSON.parse(raw) as { v: MyVendor; at: number }) : null;
  } catch {
    return null;
  }
}

function writeCache(v: MyVendor) {
  try {
    Storage.setItemSync(CACHE_KEY, JSON.stringify({ v, at: Date.now() }));
  } catch {
    // Not cached this time.
  }
}

/** Signing out: nothing about the business stays on the phone. */
export function clearVendorCache() {
  try {
    Storage.removeItemSync(CACHE_KEY);
  } catch {
    // Nothing cached.
  }
  queryClient.removeQueries({ queryKey: MY_VENDOR_KEY });
}

export function useMyVendor() {
  const items = useOutboxItems();
  const query = useQuery({
    queryKey: MY_VENDOR_KEY,
    queryFn: async () => {
      const v = await vendorApi.me();
      writeCache(v);
      return v;
    },
    retry: false,
    initialData: () => readCache()?.v,
    initialDataUpdatedAt: () => readCache()?.at,
  });
  const data = useMemo(() => (query.data ? applyPending(query.data, items) : undefined), [query.data, items]);
  return { ...query, data, savedAt: query.dataUpdatedAt };
}

/** Writes the server's latest copy into the cache (after a PATCH or quick start). */
export function useSetMyVendor() {
  return (v: MyVendor) => {
    writeCache(v);
    queryClient.setQueryData(MY_VENDOR_KEY, v);
  };
}
