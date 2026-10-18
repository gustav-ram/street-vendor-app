import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ReportTarget, VendorProfile } from '@streeteats/shared';
import { communityApi } from '@/api/community';
import { useAuth } from '@/auth/session';
import { colors, space, touch, type } from '@/theme';
import { AddPhotoSheet, ReviewSheet, useErrorText } from './community';
import { Button, Notice } from './ui';

/** Rounds to ~10 m: enough to check "near the cart", and nothing finer leaves the phone. */
const round = (n: number) => Math.round(n * 10_000) / 10_000;

async function nearbyPosition() {
  const perm = await Location.getForegroundPermissionsAsync();
  if (perm.status !== 'granted' && (await Location.requestForegroundPermissionsAsync()).status !== 'granted') {
    throw new Error('location_denied');
  }
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) };
}

function Pill({ label, onPress, on = false, disabled = false }: { label: string; onPress: () => void; on?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.pill, on && styles.pillOn, (pressed || disabled) && { opacity: 0.7 }]}
    >
      <Text style={[styles.pillText, on && { color: colors.white }]}>{label}</Text>
    </Pressable>
  );
}

export function VendorActions({ v, onReport }: { v: VendorProfile; onReport: (t: { type: ReportTarget; id: string }) => void }) {
  const router = useRouter();
  const { t } = useTranslation('community');
  const errorText = useErrorText();
  const qc = useQueryClient();
  const { status, me } = useAuth();
  const signedIn = status === 'signedIn' && me !== null;
  const viewer = useQuery({ queryKey: ['viewer', v.id], queryFn: () => communityApi.viewer(v.id), enabled: signedIn });
  const [reviewOpen, setReviewOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['viewer', v.id] });
    void qc.invalidateQueries({ queryKey: ['vendor', v.id] });
    void qc.invalidateQueries({ queryKey: ['favorites'] });
  };

  if (status === 'loading') return null;
  if (!signedIn) {
    return (
      <View style={styles.row}>
        <Pill label={`♡ ${t('favorite.signIn')}`} onPress={() => router.push('/auth/sign-in')} />
      </View>
    );
  }

  const state = viewer.data;
  const isCustomer = me.role === 'customer';
  const owner = state?.isOwner ?? false;

  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.row}>
        <Pill
          label={state?.favorite ? `♥ ${t('favorite.saved')}` : `♡ ${t('favorite.add')}`}
          on={state?.favorite}
          disabled={!state}
          onPress={async () => {
            setMessage(null);
            try {
              if (state?.favorite) await communityApi.unfavorite(v.id);
              else await communityApi.favorite(v.id, false);
              refresh();
            } catch (err) {
              setMessage({ text: errorText(err), tone: 'error' });
            }
          }}
        />
        {isCustomer && !owner && (
          <>
            <Pill label={`★ ${state?.review ? t('reviews.edit') : t('reviews.write')}`} disabled={!state} onPress={() => setReviewOpen(true)} />
            <Pill label={`📷 ${t('photos.add')}`} onPress={() => setPhotoOpen(true)} />
          </>
        )}
        {!owner && <Pill label={`⚑ ${t('report.action')}`} onPress={() => onReport({ type: 'vendor', id: v.id })} />}
      </View>

      {state?.favorite && (
        <View style={styles.notify}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.strong}>🔔 {t('favorite.notify')}</Text>
            <Text style={styles.muted}>{t('favorite.notifyHint')}</Text>
          </View>
          <Switch
            value={state.notifyOnOpen}
            accessibilityLabel={t('favorite.notify')}
            onValueChange={async (on) => {
              await communityApi.favorite(v.id, on).catch(() => {});
              refresh();
            }}
          />
        </View>
      )}

      {v.live && isCustomer && !owner && (
        <View style={styles.stillHere}>
          <Text style={styles.heading}>{t('stillHere.question')}</Text>
          {state?.confirmedRecently ? (
            <Text style={[styles.strong, { color: colors.live }]}>✓ {t('stillHere.already')}</Text>
          ) : (
            <Button
              label={checking ? t('stillHere.checking') : `✓ ${t('stillHere.yes')}`}
              disabled={checking || !state}
              style={{ backgroundColor: colors.live, minHeight: 64 }}
              onPress={async () => {
                setChecking(true);
                setMessage(null);
                try {
                  const result = await communityApi.stillHere(v.id, await nearbyPosition());
                  setMessage({ text: result.status === 'confirmed' ? t('stillHere.thanks') : t('stillHere.already'), tone: 'info' });
                  refresh();
                } catch (err) {
                  const denied = err instanceof Error && err.message === 'location_denied';
                  setMessage({ text: denied ? t('stillHere.needLocation') : errorText(err), tone: 'error' });
                } finally {
                  setChecking(false);
                }
              }}
            />
          )}
          <Text style={styles.muted}>{t('stillHere.locationNote')}</Text>
        </View>
      )}

      {state?.review?.moderation === 'pending' && <Notice text={t('reviews.pending')} />}
      {message && <Notice tone={message.tone} text={message.text} />}

      {state && (
        <ReviewSheet
          key={state.review?.updatedAt ?? 'new'}
          vendorId={v.id}
          existing={state.review}
          visible={reviewOpen}
          onClose={() => setReviewOpen(false)}
          onSaved={(text) => {
            setReviewOpen(false);
            setMessage({ text, tone: 'info' });
            refresh();
          }}
        />
      )}
      <AddPhotoSheet
        visible={photoOpen}
        onClose={() => setPhotoOpen(false)}
        title={t('photos.add')}
        hint={t('photos.addHint')}
        successText={t('photos.pending')}
        upload={async (uploadId, caption) => {
          await communityApi.addPhoto(v.id, uploadId, caption || undefined);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pill: {
    minHeight: touch.min - 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.white,
    justifyContent: 'center',
  },
  pillOn: { backgroundColor: colors.chile, borderColor: colors.chile },
  pillText: { fontSize: type.small + 1, fontWeight: '800', color: colors.ink },
  notify: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderRadius: 16, padding: space.md },
  stillHere: { gap: space.sm, backgroundColor: colors.white, borderRadius: 16, padding: space.md, borderWidth: 2, borderColor: 'rgba(21,127,60,0.4)' },
  heading: { fontSize: type.body + 1, fontWeight: '900', color: colors.ink },
  strong: { fontSize: type.body - 1, fontWeight: '800', color: colors.ink },
  muted: { fontSize: type.small, color: colors.inkSoft },
});
