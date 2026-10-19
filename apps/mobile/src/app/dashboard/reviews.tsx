import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LIMITS, type ReportTarget, type VendorReview } from '@streeteats/shared';
import { vendorApi } from '@/api/vendor';
import { ReportSheet, useErrorText } from '@/components/community';
import { Button, Field, Notice, Stars } from '@/components/ui';
import { useFormat } from '@/hooks/useFormat';
import { colors, space, type } from '@/theme';

function ReviewCard({ r, onChanged, onReport, onError }: { r: VendorReview; onChanged: () => void; onReport: () => void; onError: (e: unknown) => void }) {
  const { t } = useTranslation('dashboard');
  const { t: tv } = useTranslation('vendor');
  const { t: tm } = useTranslation('community');
  const { t: tc } = useTranslation();
  const f = useFormat();
  const [editing, setEditing] = useState(false);
  const [reply, setReply] = useState(r.vendorReply ?? '');
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      setEditing(false);
      onChanged();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Stars rating={r.rating} />
        <Text style={styles.strong}>{r.authorName ?? tv('anonymous')}</Text>
        <Text style={styles.muted}>{new Intl.DateTimeFormat(f.locale, { dateStyle: 'medium' }).format(new Date(r.createdAt))}</Text>
      </View>
      {r.authorBlocked && <Text style={styles.badge}>{t('reviews.blocked')}</Text>}
      {r.body ? <Text style={styles.body}>{r.body}</Text> : null}

      {editing ? (
        <>
          <Field label={t('reviews.reply')} placeholder={t('reviews.replyPlaceholder')} value={reply} onChangeText={setReply} maxLength={LIMITS.reviewReplyMax} multiline />
          <Button label={t('reviews.sendReply')} disabled={busy || !reply.trim()} onPress={() => void run(() => vendorApi.reviews.reply(r.id, reply.trim()))} />
          <Button variant="outline" label={tc('actions.cancel')} onPress={() => setEditing(false)} />
        </>
      ) : (
        <>
          {r.vendorReply ? (
            <View style={styles.reply}>
              <Text style={styles.strong}>{tv('vendorReply')}</Text>
              <Text style={styles.body}>{r.vendorReply}</Text>
            </View>
          ) : null}
          <View style={styles.actions}>
            <Button variant="outline" label={`💬 ${r.vendorReply ? t('reviews.editReply') : t('reviews.reply')}`} onPress={() => setEditing(true)} style={styles.small} />
            {r.vendorReply && (
              <Button variant="outline" label={t('reviews.deleteReply')} disabled={busy} onPress={() => void run(() => vendorApi.reviews.deleteReply(r.id))} style={styles.small} />
            )}
            <Button variant="outline" label={`⚑ ${tm('report.action')}`} onPress={onReport} style={styles.small} />
            {!r.authorBlocked && (
              <Button
                variant="outline"
                label={`🚫 ${t('reviews.block')}`}
                disabled={busy}
                style={styles.small}
                onPress={() =>
                  Alert.alert(t('reviews.block'), t('reviews.blockHint'), [
                    { text: tc('actions.cancel'), style: 'cancel' },
                    { text: tc('actions.continue'), style: 'destructive', onPress: () => void run(() => vendorApi.blocks.add({ reviewId: r.id })) },
                  ])
                }
              />
            )}
          </View>
        </>
      )}
    </View>
  );
}

export default function ReviewsScreen() {
  const { t } = useTranslation('dashboard');
  const { t: tc } = useTranslation();
  const errorText = useErrorText();
  const qc = useQueryClient();
  const reviews = useQuery({ queryKey: ['myReviews'], queryFn: vendorApi.reviews.list });
  const blocks = useQuery({ queryKey: ['myBlocks'], queryFn: vendorApi.blocks.list });
  const [reporting, setReporting] = useState<{ type: ReportTarget; id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['myReviews'] });
    void qc.invalidateQueries({ queryKey: ['myBlocks'] });
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      {error && <Notice tone="error" text={error} />}
      {reviews.isPending ? (
        <Text style={styles.muted}>{tc('status.loading')}</Text>
      ) : reviews.isError ? (
        <Notice tone="error" text={errorText(reviews.error)} />
      ) : reviews.data.reviews.length === 0 ? (
        <Text style={styles.body}>{t('reviews.empty')}</Text>
      ) : (
        reviews.data.reviews.map((r) => (
          <ReviewCard
            key={`${r.id}-${r.vendorReplyAt ?? ''}`}
            r={r}
            onChanged={refresh}
            onReport={() => setReporting({ type: 'review', id: r.id })}
            onError={(err) => setError(errorText(err))}
          />
        ))
      )}

      <Text style={styles.heading}>🚫 {t('reviews.blocks')}</Text>
      <Text style={styles.muted}>{t('reviews.blockHint')}</Text>
      {blocks.data?.blocks.map((b) => (
        <View key={b.id} style={styles.blockRow}>
          <Text style={[styles.strong, { flex: 1 }]}>{b.name ?? '—'}</Text>
          <Button
            variant="outline"
            label={t('reviews.unblock')}
            style={styles.small}
            onPress={async () => {
              await vendorApi.blocks.remove(b.id).catch((err) => setError(errorText(err)));
              refresh();
            }}
          />
        </View>
      ))}
      <ReportSheet target={reporting} onClose={() => setReporting(null)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.md, gap: space.md, paddingBottom: space.xl * 3 },
  card: { backgroundColor: colors.white, borderRadius: 20, padding: space.md, gap: space.sm, borderWidth: 1, borderColor: 'rgba(26,20,16,0.12)' },
  heading: { fontSize: type.heading - 2, fontWeight: '900', color: colors.ink, marginTop: space.md },
  strong: { fontSize: type.body - 1, fontWeight: '800', color: colors.ink },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.sm },
  body: { fontSize: type.body - 1, color: colors.ink, lineHeight: 24 },
  muted: { fontSize: type.small, color: colors.inkSoft },
  reply: { borderLeftWidth: 4, borderLeftColor: colors.chile, paddingLeft: space.sm, gap: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  small: { minHeight: 44, paddingHorizontal: 14 },
  badge: { alignSelf: 'flex-start', backgroundColor: colors.ink, color: colors.white, fontWeight: '800', fontSize: 13, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderRadius: 16, padding: space.sm },
});
