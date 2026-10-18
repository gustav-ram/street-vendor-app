import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { colors } from '@/theme';

export default function RootLayout() {
  const { t } = useTranslation();
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  );
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
      </Stack>
    </QueryClientProvider>
  );
}
