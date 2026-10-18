import { randomUUID } from 'expo-crypto';
import { useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  type LatLng,
  LIMITS,
  type MyUpcomingPost,
  type MyVendor,
  pendingEntityIds,
  pickerFromWindow,
  type Precision,
  windowFromPicker,
  windowProblem,
} from '@streeteats/shared';
import { SpotPicker, TimeStepper } from '@/components/pickers';
import { PendingChip, SyncBar } from '@/components/sync';
import { Button, Chip, Field, Notice, Segmented } from '@/components/ui';
import { useDayName } from '@/hooks/useDayName';
import { useFormat } from '@/hooks/useFormat';
import { useMyVendor } from '@/hooks/useMyVendor';
import { enqueue, useOutboxItems } from '@/offline/outbox';
import { colors, space, type } from '@/theme';

/**
 * "Where I'll be": future spots regulars can plan around, without sharing a
 * live location. Saved through the offline outbox, so it works with no signal.
 */
export default function UpcomingScreen() {
  const { t } = useTranslation('dashboard');
  const { t: tc } = useTranslation();
  const f = useFormat();
  const vendor = useMyVendor();
  const items = useOutboxItems();
  const pending = useMemo(() => pendingEntityIds(items), [items]);
  const dayName = useDayName();
  const [editing, setEditing] = useState<MyUpcomingPost | 'new' | null>(null);
  const v = vendor.data;

  const remove = (id: string) =>
    Alert.alert(t('upcoming.confirmDelete'), undefined, [
      { text: tc('actions.cancel'), style: 'cancel' },
      {
        text: t('upcoming.delete'),
        style: 'destructive',
        onPress: () => void enqueue({ type: 'upcoming.delete', entityId: id, payload: { clientUpdatedAt: new Date().toISOString() } }),
      },
    ]);

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <SyncBar savedAt={vendor.savedAt} />
      <Text style={styles.intro}>{t('upcoming.intro')}</Text>
      {v && v.upcoming.length === 0 && <Text style={styles.body}>{t('upcoming.empty')}</Text>}
      {v?.upcoming.map((u) => (
        <View key={u.id} style={styles.card}>
          <Text style={styles.when}>{t('upcoming.when', { day: dayName(u.startsAt), start: f.time(u.startsAt), end: f.time(u.endsAt) })}</Text>
          {u.placeLabel ? <Text style={styles.strong}>📍 {u.placeLabel}</Text> : null}
          {u.note ? <Text style={styles.body}>{u.note}</Text> : null}
          {pending.has(u.id) ? (
            <PendingChip />
          ) : (
            <Text style={styles.muted}>{u.location.precision === 'approximate' ? t('upcoming.approxNote') : t('upcoming.exactNote')}</Text>
          )}
          <View style={styles.row}>
            <Button variant="outline" label={t('upcoming.edit')} onPress={() => setEditing(u)} style={{ flex: 1 }} />
            <Button variant="outline" label={`🗑 ${t('upcoming.delete')}`} onPress={() => remove(u.id)} style={{ flex: 1 }} />
          </View>
        </View>
      ))}
      {v && v.upcoming.length >= LIMITS.upcomingPostsMax ? (
        <Notice text={t('upcoming.limit', { count: LIMITS.upcomingPostsMax })} />
      ) : (
        <Button label={t('upcoming.add')} onPress={() => setEditing('new')} disabled={!v} />
      )}
      <Text style={styles.muted}>{t('upcoming.autoDelete')}</Text>
      {v && editing && <PostEditor vendor={v} post={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </ScrollView>
  );
}

function PostEditor({ vendor, post, onClose }: { vendor: MyVendor; post: MyUpcomingPost | null; onClose: () => void }) {
  const { t } = useTranslation('dashboard');
  const { t: tc } = useTranslation();
  const { t: te } = useTranslation('errors');
  const f = useFormat();
  const initial = post ? pickerFromWindow(post.startsAt, post.endsAt) : { dayOffset: 1, start: '17:00', end: '21:00' };
  const [day, setDay] = useState(initial.dayOffset);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [spot, setSpot] = useState<LatLng | null>(post?.location ?? vendor.live.location ?? null);
  const [precision, setPrecision] = useState<Precision>(post?.location.precision ?? vendor.defaultPrecision);
  const [placeLabel, setPlaceLabel] = useState(post?.placeLabel ?? '');
  const [note, setNote] = useState(post?.note ?? '');
  const win = windowFromPicker(day, start, end);
  const problem = windowProblem(win.startsAt, win.endsAt);

  const save = () => {
    if (!spot || problem) return;
    void enqueue({
      type: 'upcoming.put',
      entityId: post?.id ?? randomUUID(),
      payload: {
        location: spot,
        precision,
        placeLabel: placeLabel.trim() || null,
        note: note.trim() || null,
        startsAt: win.startsAt,
        endsAt: win.endsAt,
        clientUpdatedAt: new Date().toISOString(),
      },
    });
    onClose();
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.sheet}>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>{post ? t('upcoming.edit') : t('upcoming.new')}</Text>
          <Text style={styles.link} onPress={onClose}>
            {tc('actions.cancel')}
          </Text>
        </View>
        <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>{t('upcoming.day')}</Text>
          <View style={styles.chips}>
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <Chip key={d} on={day === d} onPress={() => setDay(d)}>
                {d === 0 ? t('upcoming.today') : d === 1 ? t('upcoming.tomorrow') : f.weekday((new Date().getDay() + d) % 7)}
              </Chip>
            ))}
          </View>
          <TimeStepper label={t('upcoming.from')} value={start} onChange={setStart} />
          <TimeStepper label={t('upcoming.until')} value={end} onChange={setEnd} />
          {win.overnight && !problem && <Text style={styles.muted}>🌙 {t('schedule.overnight')}</Text>}
          {problem === 'tooLong' && <Notice tone="warn" text={t('upcoming.tooLong', { hours: LIMITS.upcomingWindowMaxHours })} />}
          {problem === 'ended' && <Notice tone="warn" text={te('window_ended')} />}

          <Text style={styles.label}>{t('upcoming.where')}</Text>
          <SpotPicker initial={spot} onChange={setSpot} />
          <Segmented
            value={precision}
            onChange={setPrecision}
            options={[
              { value: 'approximate', label: t('live.approximate'), hint: t('upcoming.approxNote') },
              { value: 'exact', label: t('live.exact'), hint: t('upcoming.exactNote') },
            ]}
          />
          <Field
            label={t('upcoming.placeLabel')}
            placeholder={t('upcoming.placeLabelPlaceholder')}
            value={placeLabel}
            onChangeText={setPlaceLabel}
            maxLength={LIMITS.placeLabelMax}
          />
          <Field label={t('upcoming.note')} placeholder={t('upcoming.notePlaceholder')} value={note} onChangeText={setNote} maxLength={LIMITS.upcomingNoteMax} />
          <Button label={`📍 ${t('upcoming.save')}`} onPress={save} disabled={!spot || problem !== null} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.md, gap: space.md, paddingBottom: space.xl * 2 },
  intro: { fontSize: type.body, color: colors.inkSoft },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: space.md, gap: 6, borderWidth: 1, borderColor: 'rgba(26,20,16,0.12)' },
  when: { fontSize: type.body + 1, fontWeight: '900', color: colors.ink },
  strong: { fontSize: type.body, fontWeight: '800', color: colors.ink },
  body: { fontSize: type.body, color: colors.ink },
  muted: { fontSize: type.small, color: colors.inkSoft },
  label: { fontSize: type.body, fontWeight: '900', color: colors.ink },
  row: { flexDirection: 'row', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  link: { color: colors.chile, fontWeight: '800', fontSize: type.body - 1 },
  sheet: { flex: 1, backgroundColor: colors.paper },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: space.md },
  sheetTitle: { fontSize: type.heading, fontWeight: '900', color: colors.ink },
  sheetBody: { padding: space.md, gap: space.md, paddingBottom: space.xl * 2 },
});
