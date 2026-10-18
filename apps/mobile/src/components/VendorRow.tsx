import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { LiveResult, UpcomingResult } from '@streeteats/shared';
import { useFormat } from '@/hooks/useFormat';
import { colors, space, type } from '@/theme';
import { CategoryIcon, LiveLine, PaymentBadges, Rating, StatusBanner, UpcomingLine, VerifiedBadge } from './vendor';

export function isLive(v: LiveResult | UpcomingResult): v is LiveResult {
  return 'live' in v;
}

export function VendorRow({ vendor }: { vendor: LiveResult | UpcomingResult }) {
  const router = useRouter();
  const { t } = useTranslation('search');
  const f = useFormat();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/vendor/[id]', params: { id: vendor.id } })}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.sand }]}
    >
      <CategoryIcon category={vendor.categories[0]} />
      <View style={styles.body}>
        <Text style={styles.name}>{vendor.displayName}</Text>
        {vendor.verified && <VerifiedBadge />}
        {vendor.status && <StatusBanner text={vendor.status} />}
        {isLive(vendor) ? <LiveLine live={vendor.live} /> : <UpcomingLine spot={vendor.spot} />}
        <View style={styles.meta}>
          {vendor.distanceM !== null && <Text style={styles.metaStrong}>{t('away', { distance: f.distance(vendor.distanceM) })}</Text>}
          <Rating average={vendor.rating.average} count={vendor.rating.count} />
          {vendor.priceLevel && <Text style={styles.metaStrong}>{'$'.repeat(vendor.priceLevel)}</Text>}
        </View>
        <PaymentBadges methods={vendor.paymentMethods} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.sand,
    backgroundColor: colors.paper,
  },
  body: { flex: 1, gap: 6 },
  name: { fontSize: type.body + 2, fontWeight: '900', color: colors.ink },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  metaStrong: { fontSize: type.small, fontWeight: '700', color: colors.ink },
});
