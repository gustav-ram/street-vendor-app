import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import type { Precision } from '@streeteats/shared';
import { ApiRequestError } from '@/api/client';
import { SyncBar } from '@/components/sync';
import { Button, Chip, Notice, Segmented } from '@/components/ui';
import { useFormat } from '@/hooks/useFormat';
import { useMyVendor } from '@/hooks/useMyVendor';
import { useNow } from '@/hooks/useNow';
import { dismissNotice, goLive, goOffline, syncLive, takeOver, useLive } from '@/live/controller';
import { colors, space, type } from '@/theme';

type AutoOff = 2 | 4 | 8 | null;

export default function GoLiveScreen() {
  const router = useRouter();
  const { t } = useTranslation('dashboard');
  const { t: te } = useTranslation('errors');
  const { t: tc } = useTranslation();
  const f = useFormat();
  const now = useNow(5_000);
  const vendor = useMyVendor();
  const live = useLive();
  const [precision, setPrecision] = useState<Precision>('approximate');
  const [autoOff, setAutoOff] = useState<AutoOff>(null);

  const needsOnboarding = vendor.error instanceof ApiRequestError && vendor.error.code === 'onboarding_required';
  useEffect(() => {
    if (needsOnboarding) router.replace('/dashboard/quick-start');
  }, [needsOnboarding, router]);

  useEffect(() => {
    if (!vendor.data) return;
    setPrecision(vendor.data.defaultPrecision);
    syncLive(vendor.data.live);
  }, [vendor.data]);

  if (needsOnboarding || (!vendor.data && !vendor.isError)) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <Text style={styles.muted}>…</Text>
      </ScrollView>
    );
  }
  // With no copy saved on the phone yet, there's nothing to show offline.
  if (!vendor.data) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <Notice tone="error" text={te(vendor.error instanceof ApiRequestError ? vendor.error.code : 'internal')} />
        <Button variant="dark" label={tc('actions.retry')} onPress={() => void vendor.refetch()} />
      </ScrollView>
    );
  }

  const v = vendor.data;
  const isOn = live.phase === 'live' || live.phase === 'reconnecting';
  const busy = live.phase === 'starting' || live.phase === 'stopping';
  const graceMin = Math.round((live.status?.graceSec ?? v.live.graceSec) / 60);
  const sinceOk = live.lastOkAt ? Math.max(0, Math.round((now - live.lastOkAt) / 1000)) : null;

  const banner =
    live.phase === 'live'
      ? { text: t('live.stateLive'), bg: colors.live, fg: colors.white }
      : live.phase === 'reconnecting'
        ? { text: t('live.stateReconnecting'), bg: colors.marigold, fg: colors.ink }
        : live.phase === 'elsewhere'
          ? { text: t('live.stateElsewhere'), bg: colors.live, fg: colors.white }
          : { text: t('live.stateOffline'), bg: colors.sand, fg: colors.ink };

  const notices: Record<NonNullable<typeof live.notice>, { text: string; tone: 'info' | 'warn' | 'error' }> = {
    autoOffline: { text: t('live.wentOfflineAuto'), tone: 'warn' },
    timerEnded: { text: t('live.timerEnded'), tone: 'info' },
    offlinePending: { text: t('live.offlinePending', { minutes: graceMin }), tone: 'warn' },
    locationDenied: { text: t('live.locationDenied'), tone: 'error' },
    locationUnavailable: { text: t('live.locationUnavailable'), tone: 'error' },
    vacation: { text: t('live.vacationOn'), tone: 'error' },
    error: { text: te('internal'), tone: 'error' },
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <Text style={styles.name}>{v.displayName}</Text>
      <SyncBar savedAt={vendor.savedAt} />
      <Text accessibilityRole="header" style={[styles.banner, { backgroundColor: banner.bg, color: banner.fg }]}>
        {banner.text}
      </Text>

      {live.notice && (
        <View style={{ gap: 6 }}>
          <Notice tone={notices[live.notice].tone} text={notices[live.notice].text} />
          <Text style={styles.link} onPress={dismissNotice}>
            ✕
          </Text>
        </View>
      )}

      {(isOn || live.phase === 'elsewhere') && live.status?.location ? (
        <View style={{ gap: space.sm }}>
          <Text style={styles.label}>{t('live.seeOnMap')}</Text>
          <MapView
            // Remount when the public point moves (another device, a new cell) so the zoom stays put.
            key={`${live.status.location.lat},${live.status.location.lng}`}
            style={styles.miniMap}
            pointerEvents="none"
            initialRegion={{ latitude: live.status.location.lat, longitude: live.status.location.lng, latitudeDelta: 0.008, longitudeDelta: 0.008 }}
          >
            {live.status.location.precision === 'approximate' && (
              <Circle
                center={{ latitude: live.status.location.lat, longitude: live.status.location.lng }}
                radius={150}
                strokeColor="rgba(180,35,24,0.7)"
                fillColor="rgba(180,35,24,0.12)"
              />
            )}
            <Marker coordinate={{ latitude: live.status.location.lat, longitude: live.status.location.lng }} />
          </MapView>
          <Text style={styles.body}>
            📍 {live.status.location.precision === 'approximate' ? t('live.approximate') : t('live.exact')}
          </Text>
          {live.status.endsAt && <Text style={styles.body}>⏰ {t('live.closesAt', { time: f.time(live.status.endsAt) })}</Text>}
          {isOn && sinceOk !== null && (
            <Text style={styles.muted}>
              {t('live.lastUpdate', { when: sinceOk < 5 ? t('live.justNow') : t('live.secondsAgo', { count: sinceOk }) })}
            </Text>
          )}
          {isOn ? (
            <Notice text={t('live.keepOpen', { minutes: graceMin })} />
          ) : (
            <>
              <Notice text={t('live.elsewhereBody')} />
              <Button
                variant="outline"
                label={`📍 ${t('live.takeOver')}`}
                onPress={() => void takeOver(live.status?.location?.precision ?? precision)}
                disabled={busy}
              />
            </>
          )}
          <Button label={busy ? t('live.stopping') : `■ ${t('live.goOffline')}`} onPress={() => void goOffline()} disabled={busy} style={styles.bigButton} />
        </View>
      ) : (
        <View style={{ gap: space.md }}>
          <Text style={styles.label}>{t('live.precisionLabel')}</Text>
          <Segmented
            value={precision}
            onChange={setPrecision}
            options={[
              { value: 'approximate', label: t('live.approximate'), hint: t('live.approximateHint') },
              { value: 'exact', label: t('live.exact'), hint: t('live.exactHint') },
            ]}
          />
          <Text style={styles.label}>{t('live.autoOffLabel')}</Text>
          <View style={styles.chips}>
            {([2, 4, 8, null] as AutoOff[]).map((h) => (
              <Chip key={String(h)} on={autoOff === h} onPress={() => setAutoOff(h)}>
                {h ? t('live.hours', { count: h }) : t('live.endOfDay')}
              </Chip>
            ))}
          </View>
          <Notice text={t('live.locationNeeded')} />
          <Button
            label={busy ? t('live.starting') : `● ${t('live.goLive')}`}
            onPress={() => void goLive(precision, autoOff)}
            disabled={busy || v.hidden}
            style={[styles.bigButton, { backgroundColor: colors.live }]}
          />
          {v.hidden && <Notice tone="warn" text={t('live.vacationOn')} />}
        </View>
      )}

      <View style={styles.actions}>
        <Button variant="outline" label={`📣 ${t('actions.postUpdate')}`} onPress={() => router.push('/dashboard/status')} />
        <Button variant="outline" label={`🍽️ ${t('actions.menu')}`} onPress={() => router.push('/dashboard/menu')} />
        <Button variant="outline" label={`📷 ${t('actions.photos')}`} onPress={() => router.push('/dashboard/photos')} />
        <Button variant="outline" label={`★ ${t('actions.reviews')}`} onPress={() => router.push('/dashboard/reviews')} />
        <Button variant="outline" label={`⚙️ ${t('actions.profile')}`} onPress={() => router.push('/dashboard/settings')} />
        <Button
          variant="outline"
          label={`👀 ${t('viewPublicProfile')}`}
          onPress={() => router.push({ pathname: '/vendor/[id]', params: { id: v.id } })}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.md, gap: space.md, paddingBottom: space.xl * 2 },
  name: { fontSize: type.title - 4, fontWeight: '900', color: colors.ink },
  banner: { fontSize: type.body, fontWeight: '900', padding: 14, borderRadius: 14, overflow: 'hidden', textAlign: 'center' },
  label: { fontSize: type.body, fontWeight: '900', color: colors.ink },
  body: { fontSize: type.body, color: colors.ink },
  muted: { fontSize: type.small, color: colors.inkSoft },
  link: { color: colors.chile, fontWeight: '800', alignSelf: 'flex-end' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  bigButton: { minHeight: 84, borderRadius: 24 },
  miniMap: { height: 170, borderRadius: 16, overflow: 'hidden' },
  actions: { gap: space.sm, borderTopWidth: 2, borderTopColor: colors.sand, paddingTop: space.md },
});
