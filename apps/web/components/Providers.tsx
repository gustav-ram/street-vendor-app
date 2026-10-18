"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import type { UiLocale } from "@streeteats/shared";
import { AuthProvider } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n/client";

export function Providers({ lang, children }: { lang: UiLocale; children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } } }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider lang={lang}>
        <AuthProvider>{children}</AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
