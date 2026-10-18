import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from '@/components/LanguageToggle';
import { ServerStatus } from '@/components/ServerStatus';
import { colors, space, type } from '@/theme';

export default function AccountScreen() {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>{t('appName')}</Text>
        <View style={styles.card}>
          <Text style={styles.heading}>{t('language.label')}</Text>
          <LanguageToggle />
        </View>
        <View style={[styles.card, styles.vendorCard]}>
          <Text style={[styles.heading, { color: colors.white }]}>{t('home.vendorTitle')}</Text>
          <Text style={styles.onChile}>{t('home.vendorBody')}</Text>
          <Text style={styles.pill}>{t('home.comingSoon')}</Text>
        </View>
        <ServerStatus />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { padding: space.md, gap: space.md },
  brand: { fontSize: type.title, fontWeight: '900', color: colors.chile },
  card: { backgroundColor: colors.white, borderRadius: 20, borderWidth: 2, borderColor: colors.ink, padding: space.md, gap: space.sm, alignItems: 'flex-start' },
  vendorCard: { backgroundColor: colors.chile, borderColor: colors.chile },
  heading: { fontSize: type.heading - 2, fontWeight: '900', color: colors.ink },
  onChile: { color: colors.white, fontSize: type.body },
  pill: { color: colors.white, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', fontWeight: '700' },
});
