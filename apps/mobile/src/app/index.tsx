import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from '@/components/LanguageToggle';
import { ServerStatus } from '@/components/ServerStatus';
import { colors, space, type } from '@/theme';

export default function Home() {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.brand}>{t('appName')}</Text>
        <LanguageToggle />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('tagline')}</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('home.customerTitle')}</Text>
          <Text style={styles.cardBody}>{t('home.customerBody')}</Text>
          <Text style={styles.pill}>{t('home.comingSoon')}</Text>
        </View>

        <View style={[styles.card, styles.vendorCard]}>
          <Text style={[styles.cardTitle, styles.onChile]}>{t('home.vendorTitle')}</Text>
          <Text style={[styles.cardBody, styles.onChile]}>{t('home.vendorBody')}</Text>
          <Text style={[styles.pill, styles.pillOnChile]}>{t('home.comingSoon')}</Text>
        </View>

        <ServerStatus />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 2,
    borderBottomColor: colors.sand,
  },
  brand: { fontSize: type.heading, fontWeight: '900', color: colors.chile },
  content: { padding: space.md, gap: space.md, paddingBottom: space.xl },
  title: { fontSize: type.title, fontWeight: '900', color: colors.ink, lineHeight: 38 },
  card: {
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.white,
    padding: space.lg,
    gap: space.sm,
  },
  vendorCard: { backgroundColor: colors.chile, borderColor: colors.chile },
  cardTitle: { fontSize: type.heading, fontWeight: '800', color: colors.ink },
  cardBody: { fontSize: type.body, lineHeight: 26, color: colors.inkSoft },
  onChile: { color: colors.white },
  pill: {
    alignSelf: 'flex-start',
    marginTop: space.xs,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.sand,
    color: colors.ink,
    fontSize: type.small,
    fontWeight: '700',
  },
  pillOnChile: { backgroundColor: 'rgba(255,255,255,0.2)', color: colors.white },
});
