import { randomUUID } from 'expo-crypto';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LIMITS, pendingEntityIds } from '@streeteats/shared';
import { PendingChip, SyncBar } from '@/components/sync';
import { Button, Chip, Field } from '@/components/ui';
import { useFormat } from '@/hooks/useFormat';
import { useMyVendor } from '@/hooks/useMyVendor';
import { enqueue, useOutboxItems } from '@/offline/outbox';
import { colors, space, type } from '@/theme';

const SUGGESTIONS = ['fresh', 'soldOut', 'specials', 'here'] as const;

/** Short updates ("Sold out of onions"). Posted through the offline outbox, so they work without signal. */
export default function StatusScreen() {
  const { t } = useTranslation('dashboard');
  const f = useFormat();
  const vendor = useMyVendor();
  const items = useOutboxItems();
  const pending = useMemo(() => pendingEntityIds(items), [items]);
  const [body, setBody] = useState('');
  const [hours, setHours] = useState<number | null>(null);

  const posts = vendor.data?.statusPosts ?? [];
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SyncBar savedAt={vendor.savedAt} />
        <Field label={t('status.title')} placeholder={t('status.placeholder')} value={body} onChangeText={setBody} maxLength={LIMITS.statusPostMax} multiline />
        <Text style={styles.counter}>
          {body.length}/{LIMITS.statusPostMax}
        </Text>
        <View style={styles.chips}>
          {SUGGESTIONS.map((s) => (
            <Chip key={s} on={false} onPress={() => setBody(t(`status.suggestions.${s}`))}>
              {t(`status.suggestions.${s}`)}
            </Chip>
          ))}
        </View>
        <Text style={styles.label}>{t('status.duration')}</Text>
        <View style={styles.chips}>
          {[2, 4, 8, null].map((h) => (
            <Chip key={String(h)} on={hours === h} onPress={() => setHours(h)}>
              {h ? t('live.hours', { count: h }) : t('live.endOfDay')}
            </Chip>
          ))}
        </View>
        <Button
          label={`📣 ${t('status.post')}`}
          disabled={!body.trim()}
          onPress={() => {
            void enqueue({
              type: 'status.put',
              entityId: randomUUID(),
              payload: { body: body.trim(), expiresInHours: hours ?? undefined, clientUpdatedAt: new Date().toISOString() },
            });
            setBody('');
          }}
        />

        <Text style={styles.label}>{t('status.current')}</Text>
        {posts.length === 0 ? (
          <Text style={styles.muted}>{t('status.none')}</Text>
        ) : (
          posts.map((p) => (
            <View key={p.id} style={styles.post}>
              <Text style={styles.postBody}>📣 {p.body}</Text>
              {pending.has(p.id) ? <PendingChip /> : <Text style={styles.muted}>{t('status.until', { time: f.time(p.expiresAt) })}</Text>}
              <Button
                variant="outline"
                label={t('status.remove')}
                onPress={() => void enqueue({ type: 'status.delete', entityId: p.id, payload: { clientUpdatedAt: new Date().toISOString() } })}
              />
            </View>
          ))
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.md, gap: space.md, paddingBottom: space.xl * 2 },
  label: { fontSize: type.body, fontWeight: '900', color: colors.ink },
  counter: { alignSelf: 'flex-end', color: colors.inkSoft, fontSize: type.small },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  muted: { fontSize: type.small, color: colors.inkSoft },
  post: { backgroundColor: 'rgba(245,165,36,0.2)', borderRadius: 16, padding: space.md, gap: 6 },
  postBody: { fontSize: type.body, fontWeight: '800', color: colors.ink },
});
