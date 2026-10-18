import { randomUUID } from 'expo-crypto';
import { getCalendars } from 'expo-localization';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { type Category, CATEGORIES, CATEGORY_EMOJI, LIMITS, PAYMENT_METHODS, type PaymentMethod, parsePriceToCents } from '@streeteats/shared';
import { ApiRequestError } from '@/api/client';
import { vendorApi } from '@/api/vendor';
import { Button, Chip, Field, Notice } from '@/components/ui';
import { useSetMyVendor } from '@/hooks/useMyVendor';
import { colors, space, touch, type } from '@/theme';

interface Row {
  id: string;
  name: string;
  price: string;
}

const newRow = (): Row => ({ id: randomUUID(), name: '', price: '' });

/** Get a vendor on the map in under two minutes: name, what, a few items, how to pay. */
export default function QuickStartScreen() {
  const router = useRouter();
  const setMyVendor = useSetMyVendor();
  const { t } = useTranslation('dashboard');
  const { t: tc } = useTranslation('catalog');
  const { t: te } = useTranslation('errors');
  const [name, setName] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<Row[]>([newRow(), newRow()]);
  const [payments, setPayments] = useState<PaymentMethod[]>(['cash']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const menu = rows
    .map((r) => ({ id: r.id, name: r.name.trim(), priceCents: parsePriceToCents(r.price) }))
    .filter((r): r is { id: string; name: string; priceCents: number } => r.name.length > 0 && r.priceCents !== null);
  const ready = name.trim().length >= 2 && categories.length > 0 && menu.length > 0 && payments.length > 0;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const created = await vendorApi.quickStart({
        displayName: name.trim(),
        categories,
        menu,
        paymentMethods: payments,
        timezone: getCalendars()[0]?.timeZone ?? undefined,
      });
      setMyVendor(created);
      router.replace('/dashboard');
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.code : 'internal';
      if (code === 'already_onboarded') return router.replace('/dashboard');
      setError(te(code));
    } finally {
      setBusy(false);
    }
  }

  const toggle = <T,>(list: T[], item: T, max = 99) =>
    list.includes(item) ? list.filter((x) => x !== item) : list.length >= max ? list : [...list, item];

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>{t('quickStart.intro')}</Text>

        <Field
          label={`1. ${t('quickStart.nameLabel')}`}
          hint={t('quickStart.nameHint')}
          placeholder={t('quickStart.namePlaceholder')}
          value={name}
          onChangeText={setName}
          maxLength={LIMITS.displayNameMax}
          autoCorrect={false}
        />

        <Text style={styles.label}>2. {t('quickStart.categoryLabel')}</Text>
        <View style={styles.chips}>
          {CATEGORIES.map((c) => (
            <Chip key={c} on={categories.includes(c)} onPress={() => setCategories(toggle(categories, c, 3))}>
              {CATEGORY_EMOJI[c]} {tc(`categories.${c}`)}
            </Chip>
          ))}
        </View>

        <Text style={styles.label}>3. {t('quickStart.menuLabel')}</Text>
        {rows.map((r, i) => (
          <View key={r.id} style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder={i === 0 ? t('quickStart.itemNamePlaceholder') : t('quickStart.itemName')}
              placeholderTextColor={colors.inkSoft}
              value={r.name}
              maxLength={LIMITS.menuItemNameMax}
              autoCorrect={false}
              accessibilityLabel={t('quickStart.itemName')}
              onChangeText={(v) => setRows(rows.map((x) => (x.id === r.id ? { ...x, name: v } : x)))}
            />
            <TextInput
              style={[styles.input, { width: 96 }]}
              placeholder="$"
              placeholderTextColor={colors.inkSoft}
              keyboardType="decimal-pad"
              value={r.price}
              accessibilityLabel={t('quickStart.itemPrice')}
              onChangeText={(v) => setRows(rows.map((x) => (x.id === r.id ? { ...x, price: v } : x)))}
            />
            {rows.length > 1 && (
              <Pressable accessibilityRole="button" accessibilityLabel={t('quickStart.removeItem')} onPress={() => setRows(rows.filter((x) => x.id !== r.id))} hitSlop={8}>
                <Text style={styles.remove}>✕</Text>
              </Pressable>
            )}
          </View>
        ))}
        {rows.length < 10 && (
          <Pressable accessibilityRole="button" onPress={() => setRows([...rows, newRow()])}>
            <Text style={styles.link}>{t('quickStart.addItem')}</Text>
          </Pressable>
        )}

        <Text style={styles.label}>4. {t('quickStart.paymentLabel')}</Text>
        <View style={styles.chips}>
          {PAYMENT_METHODS.map((m) => (
            <Chip key={m} on={payments.includes(m)} onPress={() => setPayments(toggle(payments, m))}>
              {tc(`payments.${m}`)}
            </Chip>
          ))}
        </View>
        <Text style={styles.hint}>{t('quickStart.paymentHint')}</Text>

        {error && <Notice tone="error" text={error} />}
        <Button label={busy ? t('quickStart.saving') : t('quickStart.submit')} onPress={() => void submit()} disabled={!ready || busy} style={{ minHeight: 64 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.md, gap: space.md, paddingBottom: space.xl * 3 },
  intro: { fontSize: type.body, color: colors.inkSoft },
  label: { fontSize: type.body, fontWeight: '900', color: colors.ink },
  hint: { fontSize: type.small, color: colors.inkSoft },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  input: {
    minHeight: touch.min,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 14,
    paddingHorizontal: 12,
    fontSize: type.body,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  remove: { fontSize: 22, color: colors.inkSoft, paddingHorizontal: 4 },
  link: { color: colors.chile, fontWeight: '800', fontSize: type.body - 1 },
});
