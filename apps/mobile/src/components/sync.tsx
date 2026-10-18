import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { syncNow, useOnline, useSyncSummary } from '@/offline/outbox';
import { colors, space, touch, type } from '@/theme';
import { useFormat } from '@/hooks/useFormat';

/**
 * Where the vendor's changes stand: all saved, waiting for signal, or
 * something that couldn't be saved (tap to see why). Also says when the
 * screen is showing the copy saved on the phone.
 */
export function SyncBar({ savedAt, linkToIssues = true }: { savedAt?: number; linkToIssues?: boolean }) {
  const router = useRouter();
  const { t } = useTranslation('dashboard');
  const f = useFormat();
  const online = useOnline();
  const { pending, issues } = useSyncSummary();

  const state =
    issues > 0
      ? {
          bg: 'rgba(180,35,24,0.12)',
          text: `⚠️ ${t('sync.issues', { count: issues })}`,
          action: linkToIssues ? t('sync.see') : null,
          onPress: linkToIssues ? () => router.push('/dashboard/sync') : undefined,
        }
      : pending > 0
        ? { bg: 'rgba(245,165,36,0.25)', text: `⏳ ${t('sync.pending', { count: pending })}`, action: online ? t('sync.syncNow') : null, onPress: syncNow }
        : { bg: 'rgba(21,127,60,0.12)', text: `✓ ${t('sync.allSaved')}`, action: null, onPress: undefined };

  return (
    <View style={{ gap: space.sm }}>
      {!online && (
        <Text style={[styles.bar, { backgroundColor: colors.sand }]}>
          📵 {t('sync.offlineCopy')}
          {savedAt ? ` (${f.time(new Date(savedAt).toISOString())})` : ''}
        </Text>
      )}
      <Pressable
        accessibilityRole={state.onPress ? 'button' : undefined}
        onPress={state.onPress}
        disabled={!state.onPress}
        style={[styles.row, { backgroundColor: state.bg }]}
      >
        <Text style={styles.text}>{state.text}</Text>
        {state.action && <Text style={styles.action}>{state.action} ›</Text>}
      </Pressable>
    </View>
  );
}

/** Shown next to anything with a change that hasn't reached the server yet. */
export function PendingChip() {
  const { t } = useTranslation('dashboard');
  return <Text style={styles.chip}>⏳ {t('sync.chip')}</Text>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, borderRadius: 14, padding: 12, minHeight: touch.min },
  bar: { borderRadius: 14, padding: 12, fontSize: type.small + 1, color: colors.ink, overflow: 'hidden' },
  text: { flex: 1, fontSize: type.body - 1, fontWeight: '800', color: colors.ink },
  action: { fontSize: type.body - 1, fontWeight: '900', color: colors.chile },
  chip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(245,165,36,0.3)',
    color: colors.ink,
    fontWeight: '800',
    fontSize: 13,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
});
