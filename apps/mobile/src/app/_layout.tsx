import '@/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { initAuth, onSignedOut } from '@/auth/session';
import { clearVendorCache } from '@/hooks/useMyVendor';
import { queryClient } from '@/lib/queryClient';
import { clearOutbox, startSync } from '@/offline/outbox';
import { colors } from '@/theme';

export default function RootLayout() {
  const { t } = useTranslation();
  useEffect(() => {
    // Nothing about a vendor's business stays on a phone after they sign out.
    const off = onSignedOut(() => {
      void clearOutbox();
      clearVendorCache();
    });
    const stop = startSync();
    void initAuth();
    return () => {
      off();
      stop();
    };
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.paper },
          headerTintColor: colors.chile,
          headerTitleStyle: { color: colors.ink, fontWeight: '800' },
          headerBackTitle: t('actions.back'),
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="vendor/[id]" options={{ title: '' }} />
        <Stack.Screen name="filters" options={{ presentation: 'modal', title: t('filters', { ns: 'search' }) }} />
        <Stack.Screen name="auth/sign-in" options={{ presentation: 'modal', title: t('signInTitle', { ns: 'auth' }) }} />
        <Stack.Screen name="auth/sign-up" options={{ presentation: 'modal', title: t('signUpTitle', { ns: 'auth' }) }} />
        <Stack.Screen name="dashboard" options={{ headerShown: false }} />
      </Stack>
    </QueryClientProvider>
  );
}
