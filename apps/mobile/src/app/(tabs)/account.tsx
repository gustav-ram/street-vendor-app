import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { signOut, useAuth } from '@/auth/session';
import { LanguageToggle } from '@/components/LanguageToggle';
import { ServerStatus } from '@/components/ServerStatus';
import { Button, Notice } from '@/components/ui';
import { goOffline, isLiveHere } from '@/live/controller';
import { useSyncSummary } from '@/offline/outbox';
import { colors, space, type } from '@/theme';

export default function AccountScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { t: ta } = useTranslation('auth');
  const { t: td } = useTranslation('dashboard');
  const { status, me } = useAuth();
  const sync = useSyncSummary();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>{t('appName')}</Text>

        {status === 'signedIn' && me ? (
          <View style={styles.card}>
            <Text style={styles.heading}>{ta('signedInAs')}</Text>
            {me.displayName ? <Text style={styles.body}>{me.displayName}</Text> : null}
            {me.role === 'vendor' ? (
              <Button label={`🛒 ${td('openDashboard')}`} onPress={() => router.push('/dashboard')} style={{ alignSelf: 'stretch' }} />
            ) : (
              <Button variant="dark" label={`♥ ${t('nav.favorites')}`} onPress={() => router.push('/favorites')} style={{ alignSelf: 'stretch' }} />
            )}
            {sync.pending > 0 && <Notice tone="warn" text={td('sync.signOutWarning', { count: sync.pending })} />}
            <Button
              variant="outline"
              label={ta('signOut')}
              onPress={async () => {
                // Signing out closes the stand first, so the location isn't left up for the grace period.
                if (isLiveHere()) await goOffline();
                await signOut();
              }}
              style={{ alignSelf: 'stretch' }}
            />
          </View>
        ) : (
          <>
            <Button variant="dark" label={ta('signIn')} onPress={() => router.push('/auth/sign-in')} />
            <View style={[styles.card, styles.vendorCard]}>
              <Text style={[styles.heading, { color: colors.white }]}>{t('home.vendorTitle')}</Text>
              <Text style={styles.onChile}>{t('home.vendorBody')}</Text>
              <Button
                variant="outline"
                label={ta('vendorPitch')}
                onPress={() => router.push({ pathname: '/auth/sign-up', params: { role: 'vendor' } })}
                style={{ alignSelf: 'stretch' }}
              />
            </View>
          </>
        )}

        <View style={styles.card}>
          <Text style={styles.heading}>{t('language.label')}</Text>
          <LanguageToggle />
        </View>
        <ServerStatus />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { padding: space.md, gap: space.md },
  brand: { fontSize: type.title, fontWeight: '900', color: colors.chile },
  card: { backgroundColor: colors.white, borderRadius: 20, borderWidth: 2, borderColor: colors.ink, padding: space.md, gap: space.sm, alignItems: 'flex-start' },
  vendorCard: { backgroundColor: colors.chile, borderColor: colors.chile },
  heading: { fontSize: type.heading - 2, fontWeight: '900', color: colors.ink },
  body: { fontSize: type.body, color: colors.ink },
  muted: { fontSize: type.small, color: colors.inkSoft },
  onChile: { color: colors.white, fontSize: type.body },
});
