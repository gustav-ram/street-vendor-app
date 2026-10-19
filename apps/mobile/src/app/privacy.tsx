import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/session';
import { Button } from '@/components/ui';
import { colors, space, type } from '@/theme';

const SECTIONS = [
  { key: 'customers', icon: '🔎', items: ['location', 'stillHere', 'reviews', 'photos', 'tracking'] },
  { key: 'vendors', icon: '🛒', items: ['live', 'approximate', 'upcoming', 'phone', 'contact', 'badge', 'stats'] },
  { key: 'controls', icon: '🎛️', items: ['offline', 'vacation', 'export', 'delete'] },
] as const;

/** "Your privacy": plain words about what's shared and when. Same text as the website. */
export default function PrivacyScreen() {
  const router = useRouter();
  const { t } = useTranslation('privacy');
  const { status } = useAuth();
  // Keys come from SECTIONS; the i18n tests check both languages have them all.
  const p = (key: string): string => t(key as never);

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <Text style={styles.intro}>{p('intro')}</Text>
      <View style={[styles.card, styles.never]}>
        <Text style={styles.heading}>{p('never.title')}</Text>
        <Text style={styles.body}>{p('never.body')}</Text>
      </View>
      {SECTIONS.map((s) => (
        <View key={s.key} style={styles.card}>
          <Text style={styles.heading} accessibilityRole="header">
            {s.icon} {p(`${s.key}.title`)}
          </Text>
          {s.items.map((item) => (
            <View key={item} style={styles.item}>
              <Text style={styles.check}>✓</Text>
              <Text style={[styles.body, { flex: 1 }]}>{p(`${s.key}.${item}`)}</Text>
            </View>
          ))}
          {s.key === 'controls' && status === 'signedIn' && (
            <Button variant="outline" label={p('accountLink')} onPress={() => router.push('/my-data')} />
          )}
        </View>
      ))}
      <View style={[styles.card, styles.others]}>
        <Text style={styles.heading}>{p('others.title')}</Text>
        <Text style={styles.body}>{p('others.body')}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.md, gap: space.md, paddingBottom: space.xl * 2 },
  intro: { fontSize: type.body + 1, color: colors.ink },
  card: { backgroundColor: colors.white, borderRadius: 20, padding: space.md, gap: space.sm },
  never: { borderWidth: 2, borderColor: colors.live, backgroundColor: 'rgba(21,127,60,0.06)' },
  others: { backgroundColor: 'rgba(232,220,200,0.6)' },
  heading: { fontSize: type.heading - 2, fontWeight: '900', color: colors.ink },
  item: { flexDirection: 'row', gap: space.sm },
  check: { fontSize: type.body, fontWeight: '900', color: colors.live },
  body: { fontSize: type.body, color: colors.ink, lineHeight: type.body * 1.35 },
});
