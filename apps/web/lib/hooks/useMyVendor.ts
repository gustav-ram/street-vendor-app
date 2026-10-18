"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MyVendor } from "@streeteats/shared";
import { MY_VENDOR_KEY, vendorApi } from "@/lib/auth";

export function useMyVendor(enabled = true) {
  return useQuery({ queryKey: MY_VENDOR_KEY, queryFn: vendorApi.me, retry: false, enabled, staleTime: 15_000 });
}

/** Cache helpers: write the server's latest copy, patch it optimistically, or re-fetch it. */
export function useMyVendorCache() {
  const qc = useQueryClient();
  return {
    set: (v: MyVendor) => qc.setQueryData(MY_VENDOR_KEY, v),
    patch: (fn: (v: MyVendor) => MyVendor) => qc.setQueryData<MyVendor>(MY_VENDOR_KEY, (v) => (v ? fn(v) : v)),
    refetch: () => qc.invalidateQueries({ queryKey: MY_VENDOR_KEY }),
  };
}
