import { ActionSheetIOS, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  CATEGORY_EMOJI,
  type Category,
  type LiveInfo,
  minutesAgo,
  type PaymentMethod,
  type PublicPoint,
  type UpcomingSpot,
} from '@streeteats/shared';
import { api } from '@/api/client';
import { Button } from '@/components/ui';
import { useFormat } from '@/hooks/useFormat';
import { useNow } from '@/hooks/useNow';
import { colors, type } from '@/theme';

const PAYMENT_ICON: Partial<Record<PaymentMethod, string>> = { cash: '💵', card: '💳' };

export function CategoryIcon({ category, size = 48 }: { category: Category | undefined; size?: number }) {
  return (
    <View style={[styles.icon, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ fontSize: size * 0.5 }}>{CATEGORY_EMOJI[category ?? 'other']}</Text>
    </View>
  );
}

/** Payment *types* only. Never handles, numbers or account details. */
export function PaymentBadges({ methods }: { methods: PaymentMethod[] }) {
  const { t } = useTranslation('catalog');
  return (
    <View style={styles.badges} accessibilityLabel={t('payments', { ns: 'vendor' })}>
      {methods.map((m) => (
        <Text key={m} style={styles.badge}>
          {PAYMENT_ICON[m] ? `${PAYMENT_ICON[m]} ` : ''}
          {t(`payments.${m}`)}
        </Text>
      ))}
    </View>
  );
}

export function Rating({ average, count }: { average: number | null; count: number }) {
  const { t } = useTranslation('vendor');
  if (!count || average === null) return <Text style={styles.muted}>{t('noRatings')}</Text>;
  return (
    <Text style={styles.strong}>
      <Text style={{ color: colors.marigold }}>★ </Text>
      {t('rating', { average: average.toFixed(1), count })}
    </Text>
  );
}

export function VerifiedBadge() {
  const { t } = useTranslation('vendor');
  return (
    <Text style={styles.verified} accessibilityHint={t('verifiedHint')}>
      ✔ {t('verified')}
    </Text>
  );
}

export function LiveLine({ live }: { live: LiveInfo }) {
  const { t } = useTranslation('search');
  const f = useFormat();
  const mins = minutesAgo(live.lastConfirmedAt, useNow());
  return (
    <Text style={styles.small}>
      <Text style={styles.liveText}>● {t('live.openNow')}</Text>
      <Text style={styles.muted}>
        {'  '}
        {mins < 1 ? t('live.confirmedJustNow') : t('live.confirmedMinutes', { count: mins })} · {t('live.until', { time: f.time(live.endsAt) })}
      </Text>
    </Text>
  );
}

export function UpcomingLine({ spot }: { spot: UpcomingSpot }) {
  const { t } = useTranslation('search');
  const f = useFormat();
  return (
    <Text style={styles.small}>
      <Text style={styles.strong}>{t(`upcoming.${spot.kind}`)} </Text>
      <Text style={styles.muted}>
        {t('upcoming.when', { start: f.dayTime(spot.startsAt), end: f.time(spot.endsAt) })}
        {spot.placeLabel ? ` · ${spot.placeLabel}` : ''}
      </Text>
    </Text>
  );
}

export function StatusBanner({ text }: { text: string }) {
  return <Text style={styles.status}>📣 {text}</Text>;
}

/** Opens Apple Maps or Google Maps at the vendor's public point. */
export function DirectionsButton({ vendorId, location }: { vendorId: string; location: PublicPoint }) {
  const { t } = useTranslation('vendor');
  const { t: tc } = useTranslation();
  const dest = `${location.lat},${location.lng}`;
  const open = (url: string) => {
    void api.event(vendorId, 'directions').catch(() => {});
    void Linking.openURL(url);
  };
  const apple = `http://maps.apple.com/?daddr=${dest}`;
  const google = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
  return (
    <View style={{ gap: 6 }}>
      <Button
        variant="dark"
        label={`🧭 ${t('directions')}`}
        onPress={() => {
          if (Platform.OS !== 'ios') return open(google);
          ActionSheetIOS.showActionSheetWithOptions(
            { options: [t('directionsApple'), t('directionsGoogle'), tc('actions.cancel')], cancelButtonIndex: 2 },
            (i) => {
              if (i === 0) open(apple);
              if (i === 1) open(google);
            },
          );
        }}
      />
      {location.precision === 'approximate' && <Text style={styles.muted}>{t('directionsApprox')}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: {
    fontSize: type.small,
    fontWeight: '600',
    color: colors.ink,
    borderWidth: 1,
    borderColor: 'rgba(26,20,16,0.2)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    overflow: 'hidden',
    backgroundColor: colors.white,
  },
  muted: { color: colors.inkSoft, fontSize: type.small },
  strong: { color: colors.ink, fontWeight: '700', fontSize: type.small },
  small: { fontSize: type.small },
  liveText: { color: colors.live, fontWeight: '800' },
  verified: {
    alignSelf: 'flex-start',
    color: colors.live,
    backgroundColor: 'rgba(21,127,60,0.1)',
    fontWeight: '800',
    fontSize: type.small - 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  status: {
    backgroundColor: 'rgba(245,165,36,0.25)',
    borderRadius: 10,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontWeight: '700',
    fontSize: type.small + 1,
    color: colors.ink,
  },
});
