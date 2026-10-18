import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LIMITS, type UiLocale } from '@streeteats/shared';
import { ApiRequestError } from '@/api/client';
import { signUp } from '@/auth/session';
import { Button, Field, Notice, Segmented } from '@/components/ui';
import { colors, space, type } from '@/theme';

export default function SignUpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ role?: string; code?: string }>();
  const { t, i18n } = useTranslation('auth');
  const { t: te } = useTranslation('errors');
  const [role, setRole] = useState<'customer' | 'vendor'>(params.role === 'vendor' ? 'vendor' : 'customer');
  const [usePhone, setUsePhone] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [kind, setKind] = useState<'password' | 'pin'>('password');
  const [secret, setSecret] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState(params.code ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signUp({
        role,
        ...(usePhone ? { phone: identifier.trim() } : { email: identifier.trim() }),
        credential: { kind: role === 'vendor' ? kind : 'password', secret },
        displayName: role === 'customer' && displayName.trim() ? displayName.trim() : undefined,
        locale: i18n.language as UiLocale,
        inviteCode: inviteCode.trim() || undefined,
      });
      if (role === 'vendor') router.replace('/dashboard/quick-start');
      else router.back();
    } catch (err) {
      setError(te(err instanceof ApiRequestError ? err.code : 'internal'));
    } finally {
      setBusy(false);
    }
  }

  const pin = role === 'vendor' && kind === 'pin';
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('signUpTitle')}</Text>
        <Text style={styles.label}>{t('iAmA')}</Text>
        <Segmented
          value={role}
          onChange={setRole}
          options={[
            { value: 'customer', label: t('roleCustomer') },
            { value: 'vendor', label: t('roleVendor') },
          ]}
        />
        {role === 'vendor' && <Notice text={t('assistedHint')} />}
        <Field
          label={usePhone ? t('phone') : t('email')}
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={usePhone ? 'phone-pad' : 'email-address'}
          textContentType={usePhone ? 'telephoneNumber' : 'username'}
        />
        <Pressable accessibilityRole="button" onPress={() => setUsePhone((p) => !p)}>
          <Text style={styles.link}>{usePhone ? t('useEmail') : t('usePhone')}</Text>
        </Pressable>
        {role === 'vendor' && (
          <Segmented
            value={kind}
            onChange={(k) => {
              setKind(k);
              setSecret('');
            }}
            options={[
              { value: 'password', label: t('credentialPassword') },
              { value: 'pin', label: t('credentialPin'), hint: t('pinHint') },
            ]}
          />
        )}
        <Field
          label={pin ? t('pin') : t('password')}
          hint={pin ? undefined : t('passwordHint', { count: LIMITS.passwordMin })}
          value={secret}
          onChangeText={(v) => setSecret(pin ? v.replace(/\D/g, '').slice(0, LIMITS.pinLength) : v)}
          secureTextEntry
          keyboardType={pin ? 'number-pad' : 'default'}
          textContentType="newPassword"
        />
        {role === 'customer' && <Field label={t('displayName')} value={displayName} onChangeText={setDisplayName} maxLength={LIMITS.displayNameMax} />}
        <Field label={t('inviteCode')} value={inviteCode} onChangeText={setInviteCode} autoCapitalize="characters" autoCorrect={false} />
        <Notice text={t('privacyNote')} />
        {error && <Notice tone="error" text={error} />}
        <Button label={t('signUp')} onPress={() => void submit()} disabled={busy || !identifier || !secret} />
        <Pressable accessibilityRole="button" onPress={() => router.replace('/auth/sign-in')}>
          <Text style={styles.link}>{t('haveAccount')}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.md, gap: space.md, paddingBottom: space.xl * 2 },
  title: { fontSize: type.title, fontWeight: '900', color: colors.ink },
  label: { fontSize: type.body, fontWeight: '800', color: colors.ink },
  link: { color: colors.chile, fontWeight: '800', fontSize: type.body - 1 },
});
