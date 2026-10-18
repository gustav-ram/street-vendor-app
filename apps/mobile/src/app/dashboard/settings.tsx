import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  CATEGORIES,
  CATEGORY_EMOJI,
  type Category,
  LANGUAGES,
  type LanguageCode,
  LIMITS,
  PAYMENT_METHODS,
  type PaymentMethod,
  type Precision,
} from '@streeteats/shared';
import { ApiRequestError } from '@/api/client';
import { vendorApi } from '@/api/vendor';
import { Button, Chip, Field, Notice, Segmented } from '@/components/ui';
import { useMyVendor, useSetMyVendor } from '@/hooks/useMyVendor';
import { setSimulateOffline, useSimulateOffline } from '@/offline/outbox';
import { colors, space, type } from '@/theme';

function toggle<T>(list: T[], item: T, max = 99) {
  return list.includes(item) ? list.filter((x) => x !== item) : list.length >= max ? list : [...list, item];
}

export default function SettingsScreen() {
  const { t } = useTranslation('dashboard');
  const { t: tc } = useTranslation('catalog');
  const { t: te } = useTranslation('errors');
  const vendor = useMyVendor();
  const setMyVendor = useSetMyVendor();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [payments, setPayments] = useState<PaymentMethod[]>([]);
  const [languages, setLanguages] = useState<LanguageCode[]>([]);
  const [precision, setPrecision] = useState<Precision>('approximate');
  const [contactText, setContactText] = useState('');
  const [contactVisible, setContactVisible] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);

  useEffect(() => {
    const v = vendor.data;
    if (!v) return;
    setName(v.displayName);
    setDescription(v.description);
    setCategories(v.categories);
    setPayments(v.paymentMethods);
    setLanguages(v.languages);
    setPrecision(v.defaultPrecision);
    setContactText(v.contactText ?? '');
    setContactVisible(v.contactVisible);
    setHidden(v.hidden);
  }, [vendor.data]);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const updated = await vendorApi.update({
        displayName: name.trim(),
        description: description.trim(),
        categories,
        paymentMethods: payments,
        languages,
        defaultPrecision: precision,
        contactText: contactText.trim() || null,
        contactVisible: contactVisible && contactText.trim().length > 0,
        hidden,
      });
      setMyVendor(updated);
      setMessage({ text: t('settings.saved'), tone: 'info' });
    } catch (err) {
      setMessage({ text: te(err instanceof ApiRequestError ? err.code : 'internal'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  if (!vendor.data) return null;
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label={t('quickStart.nameLabel')} hint={t('quickStart.nameHint')} value={name} onChangeText={setName} maxLength={LIMITS.displayNameMax} autoCorrect={false} />
        <Field
          label={t('settings.description')}
          placeholder={t('settings.descriptionPlaceholder')}
          value={description}
          onChangeText={setDescription}
          maxLength={LIMITS.descriptionMax}
          multiline
        />

        <Text style={styles.label}>{t('settings.categories')}</Text>
        <View style={styles.chips}>
          {CATEGORIES.map((c) => (
            <Chip key={c} on={categories.includes(c)} onPress={() => setCategories(toggle(categories, c, 3))}>
              {CATEGORY_EMOJI[c]} {tc(`categories.${c}`)}
            </Chip>
          ))}
        </View>

        <Text style={styles.label}>{t('settings.payments')}</Text>
        <View style={styles.chips}>
          {PAYMENT_METHODS.map((m) => (
            <Chip key={m} on={payments.includes(m)} onPress={() => setPayments(toggle(payments, m))}>
              {tc(`payments.${m}`)}
            </Chip>
          ))}
        </View>
        <Text style={styles.hint}>{t('quickStart.paymentHint')}</Text>

        <Text style={styles.label}>{t('settings.languages')}</Text>
        <View style={styles.chips}>
          {LANGUAGES.map((l) => (
            <Chip key={l} on={languages.includes(l)} onPress={() => setLanguages(toggle(languages, l))}>
              {tc(`languages.${l}`)}
            </Chip>
          ))}
        </View>

        <Text style={styles.label}>{t('settings.precision')}</Text>
        <Segmented
          value={precision}
          onChange={setPrecision}
          options={[
            { value: 'approximate', label: t('live.approximate'), hint: t('live.approximateHint') },
            { value: 'exact', label: t('live.exact'), hint: t('live.exactHint') },
          ]}
        />

        <Field label={t('settings.contact')} hint={t('settings.contactHint')} value={contactText} onChangeText={setContactText} maxLength={120} />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{t('settings.contactShow')}</Text>
          <Switch value={contactVisible} onValueChange={setContactVisible} disabled={!contactText.trim()} />
        </View>

        <View style={[styles.switchRow, styles.vacation]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>🏖️ {t('settings.vacation')}</Text>
            <Text style={styles.hint}>{t('settings.vacationHint')}</Text>
          </View>
          <Switch value={hidden} onValueChange={setHidden} />
        </View>

        {message && <Notice tone={message.tone} text={message.text} />}
        <Button
          label={t('settings.save')}
          onPress={() => void save()}
          disabled={busy || name.trim().length < 2 || categories.length === 0 || payments.length === 0}
        />

        {__DEV__ && <SimulateOffline />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Developer tool: test offline mode without turning off the Mac's Wi-Fi. Not in release builds. */
function SimulateOffline() {
  const { t } = useTranslation('dashboard');
  const on = useSimulateOffline();
  return (
    <View style={[styles.switchRow, styles.dev]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.switchLabel}>🧪 {t('sync.simulateOffline')}</Text>
        <Text style={styles.hint}>{t('sync.simulateOfflineHint')}</Text>
      </View>
      <Switch value={on} onValueChange={setSimulateOffline} accessibilityLabel={t('sync.simulateOffline')} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.md, gap: space.md, paddingBottom: space.xl * 3 },
  dev: { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.inkSoft, marginTop: space.lg },
  label: { fontSize: type.body, fontWeight: '900', color: colors.ink },
  hint: { fontSize: type.small, color: colors.inkSoft },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderRadius: 16, padding: space.md },
  switchLabel: { flex: 1, fontSize: type.body, fontWeight: '800', color: colors.ink },
  vacation: { borderWidth: 2, borderColor: colors.marigold },
});
