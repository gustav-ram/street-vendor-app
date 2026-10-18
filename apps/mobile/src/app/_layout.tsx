import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { initAuth } from '@/auth/session';
import { colors } from '@/theme';

export default function RootLayout() {
  const { t } = useTranslation();
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  );
  useEffect(() => {
    void initAuth();
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
