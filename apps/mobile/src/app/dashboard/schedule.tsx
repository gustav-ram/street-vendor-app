import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { type LatLng, LIMITS, type MyVendor, type Precision } from '@streeteats/shared';
import { ApiRequestError } from '@/api/client';
import { vendorApi } from '@/api/vendor';
import { useErrorText } from '@/components/community';
import { SpotPicker, TimeStepper } from '@/components/pickers';
import { Button, Chip, Field, Notice } from '@/components/ui';
import { useFormat } from '@/hooks/useFormat';
import { useMyVendor, useSetMyVendor } from '@/hooks/useMyVendor';
import { colors, space, type } from '@/theme';

interface Row {
  key: string;
  weekday: number;
  startTime: string;
  endTime: string;
  placeLabel: string;
  location: LatLng | null;
  precision: Precision;
}

const toRows = (v: MyVendor): Row[] =>
  v.schedule.entries.map((e) => ({
    key: e.id,
    weekday: e.weekday,
    startTime: e.startTime,
    endTime: e.endTime,
    placeLabel: e.placeLabel ?? '',
    // The published point; saving it again gives the same point.
    location: e.location ? { lat: e.location.lat, lng: e.location.lng } : null,
    precision: e.location?.precision ?? v.defaultPrecision,
  }));

/** "Fridays near the park". It rarely changes, so saving it needs a connection. */
export default function ScheduleScreen() {
  const vendor = useMyVendor();
  if (!vendor.data) return null;
  return <ScheduleEditor vendor={vendor.data} />;
}

function ScheduleEditor({ vendor }: { vendor: MyVendor }) {
  const { t } = useTranslation('dashboard');
  const f = useFormat();
  const errorText = useErrorText();
  const setMyVendor = useSetMyVendor();
  const [rows, setRows] = useState<Row[]>(() => toRows(vendor));
  const [published, setPublished] = useState(vendor.schedule.published);
  const [picking, setPicking] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const saved = await vendorApi.schedule({
        published,
        entries: rows.map((r) => ({
          weekday: r.weekday,
          startTime: r.startTime,
          endTime: r.endTime,
          placeLabel: r.placeLabel.trim() || null,
          location: r.location,
          precision: r.precision,
        })),
      });
      setMyVendor(saved);
      setRows(toRows(saved));
      setMessage({ tone: 'info', text: t('schedule.saved') });
    } catch (err) {
      const offline = err instanceof ApiRequestError && err.code === 'network';
      setMessage({ tone: 'error', text: offline ? t('schedule.needsSignal') : errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>{t('schedule.intro')}</Text>
      {rows.length === 0 && <Text style={styles.body}>{t('schedule.empty')}</Text>}
      {rows.map((r) => (
        <View key={r.key} style={styles.card}>
          <Text style={styles.label}>{t('schedule.day')}</Text>
          <View style={styles.chips}>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <Chip key={d} on={r.weekday === d} onPress={() => update(r.key, { weekday: d })}>
                {f.weekday(d).slice(0, 3)}
              </Chip>
            ))}
          </View>
          <TimeStepper label={t('schedule.from')} value={r.startTime} onChange={(v) => update(r.key, { startTime: v })} />
          <TimeStepper label={t('schedule.until')} value={r.endTime} onChange={(v) => update(r.key, { endTime: v })} />
          {r.endTime < r.startTime && <Text style={styles.muted}>🌙 {t('schedule.overnight')}</Text>}
          <Field
            label={t('upcoming.placeLabel')}
            placeholder={t('upcoming.placeLabelPlaceholder')}
            value={r.placeLabel}
            onChangeText={(v) => update(r.key, { placeLabel: v })}
            maxLength={LIMITS.placeLabelMax}
          />
          <Text style={styles.muted}>{r.location ? `📍 ${t('schedule.hasSpot')}` : t('schedule.noSpot')}</Text>
          <View style={styles.row}>
            <Button variant="outline" label={`📍 ${r.location ? t('schedule.changeSpot') : t('schedule.setSpot')}`} onPress={() => setPicking(r)} style={{ flex: 1 }} />
            {r.location && <Button variant="outline" label={t('schedule.clearSpot')} onPress={() => update(r.key, { location: null })} style={{ flex: 1 }} />}
          </View>
          <Button variant="outline" label={`🗑 ${t('schedule.remove')}`} onPress={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} />
        </View>
      ))}
      {rows.length < LIMITS.scheduleEntriesMax && (
        <Button
          variant="outline"
          label={t('schedule.add')}
          onPress={() =>
            setRows((rs) => [
              ...rs,
              { key: randomUUID(), weekday: 5, startTime: '17:00', endTime: '22:00', placeLabel: '', location: null, precision: vendor.defaultPrecision },
            ])
          }
        />
      )}
      <View style={styles.switchRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.label}>{t('schedule.publish')}</Text>
          <Text style={styles.muted}>{t('schedule.publishHint')}</Text>
        </View>
        <Switch value={published} onValueChange={setPublished} accessibilityLabel={t('schedule.publish')} />
      </View>
      {message && <Notice tone={message.tone} text={message.text} />}
      <Button label={busy ? '…' : t('schedule.save')} onPress={() => void save()} disabled={busy || rows.some((r) => r.startTime === r.endTime)} />

      {picking && (
        <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPicking(null)}>
          <SpotSheet
            initial={picking.location ?? vendor.live.location}
            onDone={(p) => {
              if (p) update(picking.key, { location: p });
              setPicking(null);
            }}
          />
        </Modal>
      )}
    </ScrollView>
  );
}

function SpotSheet({ initial, onDone }: { initial: LatLng | null; onDone: (p: LatLng | null) => void }) {
  const { t } = useTranslation('dashboard');
  const { t: tc } = useTranslation();
  const [spot, setSpot] = useState<LatLng | null>(initial);
  return (
    <SafeAreaView style={styles.sheet}>
      <View style={styles.sheetHead}>
        <Text style={styles.sheetTitle}>{t('schedule.spot')}</Text>
        <Text style={styles.link} onPress={() => onDone(null)}>
          {tc('actions.cancel')}
        </Text>
      </View>
      <View style={{ padding: space.md, gap: space.md }}>
        <SpotPicker initial={initial} onChange={setSpot} />
        <Button label={`✓ ${t('schedule.done')}`} onPress={() => onDone(spot)} disabled={!spot} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.md, gap: space.md, paddingBottom: space.xl * 2 },
  intro: { fontSize: type.body, color: colors.inkSoft },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: space.md, gap: space.sm, borderWidth: 1, borderColor: 'rgba(26,20,16,0.12)' },
  body: { fontSize: type.body, color: colors.ink },
  muted: { fontSize: type.small, color: colors.inkSoft },
  label: { fontSize: type.body, fontWeight: '900', color: colors.ink },
  row: { flexDirection: 'row', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderRadius: 16, padding: space.md },
  link: { color: colors.chile, fontWeight: '800', fontSize: type.body - 1 },
  sheet: { flex: 1, backgroundColor: colors.paper },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: space.md },
  sheetTitle: { fontSize: type.heading, fontWeight: '900', color: colors.ink },
});
