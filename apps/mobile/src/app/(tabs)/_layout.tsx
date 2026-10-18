import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '@/theme';

const icon = (emoji: string) => () => <Text style={{ fontSize: 24 }}>{emoji}</Text>;

export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.chile,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarLabelStyle: { fontSize: 13, fontWeight: '700' },
        tabBarStyle: { backgroundColor: colors.white },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('nav.map'), tabBarIcon: icon('🗺️') }} />
      <Tabs.Screen name="account" options={{ title: t('nav.account'), tabBarIcon: icon('👤') }} />
    </Tabs>
  );
}
