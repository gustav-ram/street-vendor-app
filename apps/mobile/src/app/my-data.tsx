import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { deleteMyAccount, shareMyData } from '@/api/account';
import { signOut, useAuth } from '@/auth/session';
import { useErrorText } from '@/components/community';
import { Button, Field, Notice } from '@/components/ui';
import { goOffline, isLiveHere } from '@/live/controller';
import { colors, space, type } from '@/theme';

/** Download my data, and delete my account. */
export default function AccountControlsScreen() {
  const router = useRouter();
  const { t } = useTranslation('account');
  const { t: tc } = useTranslation();
  const errorText = useErrorText();
  const { status, me } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [secret, setSecret] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (deleted) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <Notice text={t('delete.done')} />
        <Button variant="dark" label={tc('nav.map')} onPress={() => router.replace('/')} />
      </ScrollView>
    );
  }
  if (status !== 'signedIn' || !me) return null;

  async function exportData() {
    setExporting(true);
    setError(null);
    try {
      await shareMyData();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setExporting(false);
    }
  }

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      // Close the stand properly first, so this phone stops sending its location.
      if (isLiveHere()) await goOffline();
      await deleteMyAccount(secret);
      // Clears the session, the saved business and anything still queued on this phone.
      await signOut();
      setDeleted(true);
    } catch (err) {
      setError(errorText(err));
      setDeleting(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error && <Notice tone="error" text={error} />}
        <View style={styles.card}>
          <Text style={styles.heading}>📦 {t('export.title')}</Text>
          <Text style={styles.body}>{t('export.body')}</Text>
          <Button variant="dark" label={exporting ? t('export.working') : `⬇ ${t('export.button')}`} onPress={() => void exportData()} disabled={exporting} />
        </View>

        <View style={[styles.card, styles.danger]}>
          <Text style={styles.heading}>🗑 {t('delete.title')}</Text>
          <Text style={styles.body}>{t('delete.body')}</Text>
          {me.role === 'vendor' && <Text style={[styles.body, { fontWeight: '800' }]}>{t('delete.vendorNote')}</Text>}
          {confirming ? (
            <>
              <Field label={t('delete.secret')} value={secret} onChangeText={setSecret} secureTextEntry autoFocus autoComplete="current-password" textContentType="password" />
              <Button
                label={deleting ? t('delete.working') : t('delete.button')}
                onPress={() => void remove()}
                disabled={!secret || deleting}
                style={{ backgroundColor: colors.chile }}
              />
              <Button variant="outline" label={tc('actions.cancel')} onPress={() => setConfirming(false)} />
            </>
          ) : (
            <Button variant="outline" label={`${t('delete.title')}…`} onPress={() => setConfirming(true)} />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.md, gap: space.md, paddingBottom: space.xl * 2 },
  card: { backgroundColor: colors.white, borderRadius: 20, padding: space.md, gap: space.sm },
  danger: { borderWidth: 2, borderColor: 'rgba(180,35,24,0.35)' },
  heading: { fontSize: type.heading - 2, fontWeight: '900', color: colors.ink },
  body: { fontSize: type.body, color: colors.ink },
});
