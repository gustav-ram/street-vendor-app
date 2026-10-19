import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AnalyticsDay, AnalyticsRange } from '@streeteats/shared';
import { vendorStats } from '@/api/account';
import { useErrorText } from '@/components/community';
import { Button, Chip, Notice } from '@/components/ui';
import { colors, space, touch, type } from '@/theme';

const METRICS = ['profileViews', 'mapImpressions', 'directionsTaps', 'favoritesAdded', 'confirmations'] as const;
type Metric = (typeof METRICS)[number];

/** Daily totals: a row of numbers, then one metric per day. Nothing about who. */
export default function StatsScreen() {
  const { t, i18n } = useTranslation('dashboard');
  const { t: tc } = useTranslation();
  const errorText = useErrorText();
  const [range, setRange] = useState<AnalyticsRange>('7d');
  const [metric, setMetric] = useState<Metric>('profileViews');
  const [showTable, setShowTable] = useState(false);
  const q = useQuery({ queryKey: ['analytics', range], queryFn: () => vendorStats(range), placeholderData: keepPreviousData });
  const locale = i18n.language === 'es' ? 'es-US' : 'en-US';
  // Calendar dates in the vendor's time zone (noon UTC avoids an off-by-one).
  const dayLabel = (day: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <View style={styles.row}>
        {(['7d', '30d'] as const).map((r) => (
          <Chip key={r} on={range === r} onPress={() => setRange(r)}>
            {r === '7d' ? t('stats.range7') : t('stats.range30')}
          </Chip>
        ))}
      </View>

      {q.isError && !q.data ? (
        <>
          <Notice tone="error" text={errorText(q.error)} />
          <Button variant="dark" label={tc('actions.retry')} onPress={() => void q.refetch()} />
        </>
      ) : !q.data ? (
        <Text style={styles.muted}>{tc('status.loading')}</Text>
      ) : (
        <>
          <Text style={styles.hero}>♥ {t('stats.favoritesNow', { count: q.data.favoritesNow })}</Text>
          <View style={styles.tiles}>
            {METRICS.map((m) => (
              <Pressable
                key={m}
                accessibilityRole="button"
                accessibilityState={{ selected: metric === m }}
                onPress={() => setMetric(m)}
                style={[styles.tile, metric === m && styles.tileOn]}
              >
                <Text style={styles.tileLabel}>{t(`stats.${m}`)}</Text>
                <Text style={styles.tileValue}>{q.data!.totals[m]}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.heading}>{t('stats.perDay', { what: t(`stats.${metric}`) })}</Text>
            <Columns days={q.data.days} metric={metric} dayLabel={dayLabel} todayLabel={t('stats.today')} />
            {q.data.days.every((d) => d[metric] === 0) && <Text style={styles.muted}>{t('stats.empty')}</Text>}
            <Pressable accessibilityRole="button" onPress={() => setShowTable((s) => !s)} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={styles.link}>
                {showTable ? '▾' : '▸'} {t('stats.table')}
              </Text>
            </Pressable>
            {showTable &&
              [...q.data.days].reverse().map((d) => (
                <View key={d.day} style={styles.tableRow}>
                  <Text style={styles.body}>{dayLabel(d.day, { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                  <Text style={[styles.body, { fontWeight: '800' }]}>{d[metric]}</Text>
                </View>
              ))}
          </View>
          <Text style={styles.muted}>🔒 {t('stats.privacy')}</Text>
        </>
      )}
    </ScrollView>
  );
}

/** One column per day from a single baseline. Tap a column to see its day and value. */
function Columns({
  days,
  metric,
  dayLabel,
  todayLabel,
}: {
  days: AnalyticsDay[];
  metric: Metric;
  dayLabel: (day: string, opts: Intl.DateTimeFormatOptions) => string;
  todayLabel: string;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d[metric]));
  const last = days.length - 1;
  const shown = picked ?? last;
  const d = days[shown];

  return (
    <View style={{ gap: 6 }}>
      {d && (
        <Text style={styles.readout}>
          {shown === last ? todayLabel : dayLabel(d.day, { weekday: 'short', month: 'short', day: 'numeric' })}: <Text style={{ fontWeight: '900' }}>{d[metric]}</Text>
        </Text>
      )}
      <View style={styles.plot}>
        {days.map((day, i) => {
          const v = day[metric];
          return (
            <Pressable
              key={day.day}
              onPress={() => setPicked(i)}
              accessibilityRole="button"
              accessibilityLabel={`${dayLabel(day.day, { weekday: 'long', month: 'long', day: 'numeric' })}: ${v}`}
              style={styles.slot}
            >
              <View
                style={[
                  styles.column,
                  { height: v === 0 ? 0 : `${Math.max(3, (v / max) * 100)}%`, backgroundColor: i === shown ? colors.ink : colors.chile },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.axis}>
        <Text style={styles.axisText}>{dayLabel(days[0]!.day, { month: 'short', day: 'numeric' })}</Text>
        <Text style={styles.axisText}>{todayLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.md, gap: space.md, paddingBottom: space.xl * 2 },
  row: { flexDirection: 'row', gap: space.sm },
  hero: { fontSize: type.body + 4, fontWeight: '900', color: colors.ink },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: {
    width: '48%',
    minHeight: touch.min + 36,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 12,
    borderWidth: 2,
    borderColor: 'rgba(26,20,16,0.1)',
    justifyContent: 'space-between',
  },
  tileOn: { borderColor: colors.ink },
  tileLabel: { fontSize: type.small, fontWeight: '800', color: colors.inkSoft },
  tileValue: { fontSize: 30, fontWeight: '900', color: colors.ink },
  card: { backgroundColor: colors.white, borderRadius: 20, padding: space.md, gap: space.sm },
  heading: { fontSize: type.body + 1, fontWeight: '900', color: colors.ink },
  readout: { fontSize: type.body, color: colors.ink },
  plot: { height: 160, flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: 'rgba(26,20,16,0.25)' },
  slot: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 1 },
  column: { width: '100%', maxWidth: 24, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  axisText: { fontSize: 12, color: colors.inkSoft },
  link: { color: colors.chile, fontWeight: '800', fontSize: type.body - 1 },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.sand, paddingVertical: 4 },
  body: { fontSize: type.body, color: colors.ink },
  muted: { fontSize: type.small, color: colors.inkSoft },
});
