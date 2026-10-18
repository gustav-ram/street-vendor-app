import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ApiRequestError } from '@/api/client';
import { signIn } from '@/auth/session';
import { Button, Field, Notice } from '@/components/ui';
import { colors, space, type } from '@/theme';

export default function SignInScreen() {
  const router = useRouter();
  const { t } = useTranslation('auth');
  const { t: te } = useTranslation('errors');
  const [usePhone, setUsePhone] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(usePhone ? { phone: identifier.trim() } : { email: identifier.trim() }, secret);
      router.back();
    } catch (err) {
      setError(te(err instanceof ApiRequestError ? err.code : 'internal'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('welcome')}</Text>
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
        <Field
          label={`${t('credentialPassword')} / ${t('credentialPin')}`}
          value={secret}
          onChangeText={setSecret}
          secureTextEntry
          textContentType="password"
          onSubmitEditing={() => void submit()}
        />
        {error && <Notice tone="error" text={error} />}
        <Button label={t('signIn')} onPress={() => void submit()} disabled={busy || !identifier || !secret} />
        <Pressable accessibilityRole="button" onPress={() => router.replace('/auth/sign-up')}>
          <Text style={styles.link}>{t('noAccount')}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.md, gap: space.md },
  title: { fontSize: type.title, fontWeight: '900', color: colors.ink },
  link: { color: colors.chile, fontWeight: '800', fontSize: type.body - 1 },
});
