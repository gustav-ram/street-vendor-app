import { useQuery } from '@tanstack/react-query';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { badgeSteps } from '@streeteats/shared';
import { vendorApi } from '@/api/vendor';
import { useErrorText } from '@/components/community';
import { Button, Notice } from '@/components/ui';
import { colors, space, type } from '@/theme';

/** "Community Verified": progress in plain words. Counts only, never who or when. */
export default function BadgeScreen() {
  const { t, i18n } = useTranslation('dashboard');
  const { t: tc } = useTranslation();
  const errorText = useErrorText();
  const q = useQuery({ queryKey: ['verification'], queryFn: vendorApi.verification });
  const v = q.data;
  const date = (iso: string) => new Intl.DateTimeFormat(i18n.language === 'es' ? 'es-US' : 'en-US', { dateStyle: 'medium' }).format(new Date(iso));

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      {!v ? (
        q.isError ? (
          <>
            <Notice tone="error" text={errorText(q.error)} />
            <Button variant="dark" label={tc('actions.retry')} onPress={() => void q.refetch()} />
          </>
        ) : (
          <Text style={styles.muted}>{tc('status.loading')}</Text>
        )
      ) : (
        <>
          {v.status === 'verified' ? (
            <View style={styles.earned}>
              <Text style={styles.earnedText}>✓ {t('badge.earned')}</Text>
              {v.verifiedAt && <Text style={styles.earnedSince}>{t('badge.earnedSince', { date: date(v.verifiedAt) })}</Text>}
            </View>
          ) : v.status === 'revoked' ? (
            <Notice tone="warn" text={[t('badge.revoked'), v.revokedReason ? t('badge.revokedReason', { reason: v.revokedReason }) : ''].join(' ')} />
          ) : (
            <Text style={styles.heading}>{t('badge.notYet')}</Text>
          )}

          {badgeSteps(v).map((s) => (
            <View key={s.key} style={styles.step}>
              <View style={styles.stepHead}>
                <Text style={styles.need}>{t(s.need[0], s.need[1])}</Text>
                {s.met && <Text style={styles.done}>{t('badge.stepDone')}</Text>}
              </View>
              <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(s.fraction * 100) }}>
                <View style={[styles.bar, { width: `${Math.round(s.fraction * 100)}%`, backgroundColor: s.met ? colors.live : colors.marigold }]} />
              </View>
              <Text style={styles.muted}>{t(s.have[0], s.have[1])}</Text>
            </View>
          ))}

          <View style={styles.how}>
            <Text style={styles.heading}>{t('badge.howTitle')}</Text>
            <Text style={styles.body}>{t('badge.how')}</Text>
            <Text style={styles.body}>{t('badge.kept')}</Text>
            <Text style={styles.muted}>{t('badge.optional')}</Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.md, gap: space.md, paddingBottom: space.xl * 2 },
  earned: { backgroundColor: colors.live, borderRadius: 16, padding: space.md, gap: 4 },
  earnedText: { color: colors.white, fontSize: type.body + 2, fontWeight: '900' },
  earnedSince: { color: 'rgba(255,255,255,0.85)', fontSize: type.small, fontWeight: '700' },
  heading: { fontSize: type.body + 1, fontWeight: '900', color: colors.ink },
  step: { backgroundColor: colors.white, borderRadius: 16, padding: space.md, gap: 8 },
  stepHead: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  need: { flex: 1, fontSize: type.body - 1, fontWeight: '800', color: colors.ink },
  done: { fontSize: type.small, fontWeight: '900', color: colors.live },
  track: { height: 12, borderRadius: 6, backgroundColor: colors.sand, overflow: 'hidden' },
  bar: { height: 12, borderRadius: 6 },
  body: { fontSize: type.body, color: colors.ink },
  muted: { fontSize: type.small, color: colors.inkSoft },
  how: { backgroundColor: 'rgba(21,127,60,0.08)', borderRadius: 16, padding: space.md, gap: space.sm },
});
