import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { LiveResult, UpcomingResult } from '@streeteats/shared';
import { Button } from '@/components/ui';
import { useFormat } from '@/hooks/useFormat';
import { colors, space, type } from '@/theme';
import { isLive } from './VendorRow';
import { CategoryIcon, DirectionsButton, LiveLine, PaymentBadges, StatusBanner, UpcomingLine, VerifiedBadge } from './vendor';

/** Card at the bottom of the map for the tapped pin. */
export function SelectedCard({ vendor, onClose }: { vendor: LiveResult | UpcomingResult; onClose: () => void }) {
  const router = useRouter();
  const { t } = useTranslation('vendor');
  const { t: tc } = useTranslation();
  const f = useFormat();
  const location = isLive(vendor) ? vendor.live.location : vendor.spot.location;
  return (
    <View style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityLabel={tc('actions.close')} onPress={onClose} style={styles.close} hitSlop={12}>
        <Text style={{ fontSize: 26 }}>×</Text>
      </Pressable>
      <View style={styles.head}>
        <CategoryIcon category={vendor.categories[0]} />
        <View style={{ flex: 1, gap: 4, paddingRight: 28 }}>
          <Text style={styles.name}>{vendor.displayName}</Text>
          {vendor.verified && <VerifiedBadge />}
          {isLive(vendor) ? <LiveLine live={vendor.live} /> : <UpcomingLine spot={vendor.spot} />}
          {vendor.distanceM !== null && (
            <Text style={styles.distance}>{t('away', { ns: 'search', distance: f.distance(vendor.distanceM) })}</Text>
          )}
        </View>
      </View>
      {vendor.status && <StatusBanner text={vendor.status} />}
      <PaymentBadges methods={vendor.paymentMethods} />
      <Button label={`${t('viewProfile')} →`} onPress={() => router.push({ pathname: '/vendor/[id]', params: { id: vendor.id } })} />
      {location && <DirectionsButton vendorId={vendor.id} location={location} />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: space.sm,
    right: space.sm,
    bottom: space.sm,
    backgroundColor: colors.white,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.ink,
    padding: space.md,
    gap: space.sm + 2,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  close: { position: 'absolute', top: 6, right: 12, zIndex: 1, padding: 4 },
  head: { flexDirection: 'row', gap: space.md },
  name: { fontSize: type.heading - 2, fontWeight: '900', color: colors.ink },
  distance: { fontSize: type.small, fontWeight: '700', color: colors.ink },
});
