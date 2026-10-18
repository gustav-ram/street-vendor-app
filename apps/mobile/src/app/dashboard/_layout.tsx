import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors } from '@/theme';

export default function DashboardLayout() {
  const { t } = useTranslation('dashboard');
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.paper },
        headerTintColor: colors.chile,
        headerTitleStyle: { color: colors.ink, fontWeight: '800' },
      }}
    >
      <Stack.Screen name="index" options={{ title: t('title') }} />
      <Stack.Screen name="quick-start" options={{ title: t('quickStart.title'), headerBackVisible: false }} />
      <Stack.Screen name="menu" options={{ title: t('menu.title') }} />
      <Stack.Screen name="status" options={{ title: t('status.title') }} />
      <Stack.Screen name="settings" options={{ title: t('settings.title') }} />
      <Stack.Screen name="photos" options={{ title: t('photos.title') }} />
      <Stack.Screen name="reviews" options={{ title: t('reviews.title') }} />
      <Stack.Screen name="upcoming" options={{ title: t('upcoming.title') }} />
      <Stack.Screen name="schedule" options={{ title: t('schedule.title') }} />
      <Stack.Screen name="badge" options={{ title: t('badge.title') }} />
      <Stack.Screen name="sync" options={{ title: t('sync.title') }} />
    </Stack>
  );
}
