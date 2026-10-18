import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { CATEGORIES, CATEGORY_EMOJI, LANGUAGES, PAYMENT_METHODS, RADIUS_OPTIONS_M } from '@streeteats/shared';
import { Button, Chip } from '@/components/ui';
import { useFormat } from '@/hooks/useFormat';
import { DEFAULT_FILTERS, exploreStore, useExplore } from '@/state/explore';
import { colors, space, type } from '@/theme';

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

export default function FiltersScreen() {
  const router = useRouter();
  const { t } = useTranslation('search');
  const { t: tc } = useTranslation('catalog');
  const f = useFormat();
  const { filters } = useExplore();
  const [draft, setDraft] = useState(filters);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <Section title={t('radius')}>
          {RADIUS_OPTIONS_M.map((m) => (
            <Chip key={m} on={draft.radiusM === m} onPress={() => setDraft({ ...draft, radiusM: m })}>
              {f.radius(m)}
            </Chip>
          ))}
        </Section>
        <Section title={t('category')}>
          {CATEGORIES.map((c) => (
            <Chip key={c} on={draft.categories.includes(c)} onPress={() => setDraft({ ...draft, categories: toggle(draft.categories, c) })}>
              {CATEGORY_EMOJI[c]} {tc(`categories.${c}`)}
            </Chip>
          ))}
        </Section>
        <Section title={t('price')}>
          {[1, 2, 3].map((p) => (
            <Chip key={p} on={draft.priceLevels.includes(p)} onPress={() => setDraft({ ...draft, priceLevels: toggle(draft.priceLevels, p) })}>
              {'$'.repeat(p)}
            </Chip>
          ))}
        </Section>
        <Section title={t('payment')}>
          {PAYMENT_METHODS.map((m) => (
            <Chip key={m} on={draft.paymentMethods.includes(m)} onPress={() => setDraft({ ...draft, paymentMethods: toggle(draft.paymentMethods, m) })}>
              {tc(`payments.${m}`)}
            </Chip>
          ))}
        </Section>
        <Section title={t('languages')}>
          {LANGUAGES.map((l) => (
            <Chip key={l} on={draft.languages.includes(l)} onPress={() => setDraft({ ...draft, languages: toggle(draft.languages, l) })}>
              {tc(`languages.${l}`)}
            </Chip>
          ))}
        </Section>
      </ScrollView>
      <View style={styles.footer}>
        <Button variant="outline" label={t('reset')} onPress={() => setDraft(DEFAULT_FILTERS)} />
        <Button
          label={t('apply')}
          style={{ flex: 1 }}
          onPress={() => {
            exploreStore.setFilters(draft);
            router.back();
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { padding: space.md, gap: space.lg },
  sectionTitle: { fontSize: type.body, fontWeight: '900', color: colors.ink },
  muted: { color: colors.inkSoft, fontSize: type.small },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, borderTopWidth: 2, borderTopColor: colors.sand },
});
