import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { MyVendor, OutboxItem } from '@streeteats/shared';
import { useErrorText } from '@/components/community';
import { PendingChip, SyncBar } from '@/components/sync';
import { Button } from '@/components/ui';
import { useDayName } from '@/hooks/useDayName';
import { useFormat } from '@/hooks/useFormat';
import { useMyVendor } from '@/hooks/useMyVendor';
import { dismissIssue, retryIssue, useOutboxItems } from '@/offline/outbox';
import { colors, space, type } from '@/theme';

/** What a queued change was, in the vendor's words. */
function useDescribe(vendor: MyVendor | undefined) {
  const { t } = useTranslation('dashboard');
  const f = useFormat();
  const dayName = useDayName();
  return (item: OutboxItem): string => {
    const a = item.action;
    const itemName = (id: string) => vendor?.menu.find((m) => m.id === id)?.name ?? '…';
    switch (a.type) {
      case 'menu.put':
        return t('sync.what.menuPut', { name: a.payload.name });
      case 'menu.soldOut':
        return a.payload.soldOut ? t('sync.what.menuSoldOut', { name: itemName(a.entityId) }) : t('sync.what.menuAvailable', { name: itemName(a.entityId) });
      case 'menu.delete':
        return t('sync.what.menuDelete');
      case 'status.put':
        return t('sync.what.statusPut', { body: a.payload.body });
      case 'status.delete':
        return t('sync.what.statusDelete');
      case 'upcoming.put':
        return t('sync.what.upcomingPut', { when: `${dayName(a.payload.startsAt)} ${f.time(a.payload.startsAt)}` });
      case 'upcoming.delete':
        return t('sync.what.upcomingDelete');
      case 'photo.add':
        return t('sync.what.photoAdd');
    }
  };
}

const madeAt = (item: OutboxItem) => ('clientUpdatedAt' in item.action.payload ? item.action.payload.clientUpdatedAt : item.queuedAt);

/**
 * Sync issues: changes that couldn't be saved, explained in plain words,
 * and what's still waiting for signal.
 */
export default function SyncScreen() {
  const { t } = useTranslation('dashboard');
  const f = useFormat();
  const errorText = useErrorText();
  const vendor = useMyVendor();
  const items = useOutboxItems();
  const describe = useDescribe(vendor.data);
  const issues = items.filter((i) => i.state !== 'pending');
  const pending = items.filter((i) => i.state === 'pending');

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <SyncBar savedAt={vendor.savedAt} linkToIssues={false} />
      {issues.length === 0 && <Text style={styles.body}>{t('sync.empty')}</Text>}
      {issues.map((item) => (
        <View key={item.id} style={[styles.card, styles.issue]}>
          <Text style={styles.what}>{describe(item)}</Text>
          <Text style={styles.muted}>{t('sync.madeAt', { time: f.dayTime(madeAt(item)) })}</Text>
          <Text style={styles.body}>
            {item.state === 'superseded' ? t('sync.superseded') : t('sync.failed', { reason: errorText({ code: item.error }) })}
          </Text>
          <View style={styles.row}>
            <Button
              variant="outline"
              label={item.state === 'superseded' ? t('sync.useMine') : t('sync.tryAgain')}
              onPress={() => void retryIssue(item.id)}
              style={{ flex: 1 }}
            />
            <Button variant="dark" label={t('sync.dismiss')} onPress={() => void dismissIssue(item)} style={{ flex: 1 }} />
          </View>
        </View>
      ))}
      {pending.length > 0 && <Text style={styles.heading}>⏳ {t('sync.pending', { count: pending.length })}</Text>}
      {pending.map((item) => (
        <View key={item.id} style={styles.card}>
          {item.action.type === 'photo.add' && <Image source={{ uri: item.action.payload.fileUri }} style={styles.thumb} />}
          <Text style={styles.what}>{describe(item)}</Text>
          <Text style={styles.muted}>{t('sync.madeAt', { time: f.dayTime(madeAt(item)) })}</Text>
          <PendingChip />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.md, gap: space.md, paddingBottom: space.xl * 2 },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: space.md, gap: 6, borderWidth: 1, borderColor: 'rgba(26,20,16,0.12)' },
  issue: { borderColor: 'rgba(180,35,24,0.4)', borderWidth: 2 },
  what: { fontSize: type.body, fontWeight: '900', color: colors.ink },
  heading: { fontSize: type.body + 1, fontWeight: '900', color: colors.ink, marginTop: space.sm },
  body: { fontSize: type.body, color: colors.ink },
  muted: { fontSize: type.small, color: colors.inkSoft },
  row: { flexDirection: 'row', gap: space.sm, marginTop: 4 },
  thumb: { width: 96, height: 96, borderRadius: 12, backgroundColor: colors.sand },
});
