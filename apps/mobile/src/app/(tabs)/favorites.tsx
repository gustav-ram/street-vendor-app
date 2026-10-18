import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { Favorite } from '@streeteats/shared';
import { communityApi } from '@/api/community';
import { useAuth } from '@/auth/session';
import { Button, Notice } from '@/components/ui';
import { CategoryIcon, LiveLine, Rating } from '@/components/vendor';
import { useFormat } from '@/hooks/useFormat';
import { colors, space, type } from '@/theme';

function Row({ fav }: { fav: Favorite }) {
  const router = useRouter();
  const { t } = useTranslation('community');
  const { t: tv } = useTranslation('vendor');
  const { t: tc } = useTranslation('catalog');
  const f = useFormat();
  const next = fav.upcoming[0];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/vendor/[id]', params: { id: fav.vendor.id } })}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
    >
      <CategoryIcon category={fav.vendor.categories[0]} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.name}>{fav.vendor.displayName}</Text>
        <Text style={styles.muted}>{fav.vendor.categories.map((c) => tc(`categories.${c}`)).join(' · ')}</Text>
        <Rating average={fav.vendor.rating.average} count={fav.vendor.rating.count} />
        {fav.live ? (
          <LiveLine live={fav.live} />
        ) : next ? (
          <Text style={styles.body}>📅 {t('favorites.next', { when: f.dayTime(next.startsAt) })}</Text>
        ) : (
          <Text style={styles.muted}>{tv('closed')}</Text>
        )}
        {fav.notifyOnOpen && <Text style={styles.muted}>🔔 {t('favorites.notifyOn')}</Text>}
      </View>
    </Pressable>
  );
}

export default function FavoritesScreen() {
  const router = useRouter();
  const { t } = useTranslation('community');
  const { t: tc } = useTranslation();
  const { t: ta } = useTranslation('auth');
  const { status } = useAuth();
  const query = useQuery({ queryKey: ['favorites'], queryFn: communityApi.favorites, enabled: status === 'signedIn' });
  const { refetch } = query;

  // Back on this tab: refresh who's live now.
  useFocusEffect(
    useCallback(() => {
      if (status === 'signedIn') void refetch();
    }, [status, refetch]),
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }} edges={['top', 'left', 'right']}>
      <Text style={styles.title} accessibilityRole="header">
        ♥ {t('favorites.title')}
      </Text>
      {status === 'signedOut' ? (
        <View style={styles.pad}>
          <Text style={styles.body}>{t('favorites.signIn')}</Text>
          <Button variant="dark" label={ta('signIn')} onPress={() => router.push('/auth/sign-in')} />
        </View>
      ) : query.isError ? (
        <View style={styles.pad}>
          <Notice tone="error" text={tc('status.serverDown')} />
        </View>
      ) : (
        <FlatList
          data={query.data?.favorites ?? []}
          keyExtractor={(f) => f.vendor.id}
          renderItem={({ item }) => <Row fav={item} />}
          contentContainerStyle={{ padding: space.md, gap: space.sm }}
          refreshing={query.isFetching && !query.isPending}
          onRefresh={() => void query.refetch()}
          ListEmptyComponent={<Text style={styles.body}>{query.isPending ? tc('status.loading') : t('favorites.empty')}</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: type.title, fontWeight: '900', color: colors.ink, paddingHorizontal: space.md, paddingTop: space.md },
  pad: { padding: space.md, gap: space.md },
  row: { flexDirection: 'row', gap: space.md, backgroundColor: colors.white, borderRadius: 20, padding: space.md, borderWidth: 1, borderColor: 'rgba(26,20,16,0.12)' },
  name: { fontSize: type.body + 2, fontWeight: '900', color: colors.ink },
  body: { fontSize: type.body - 1, color: colors.ink },
  muted: { fontSize: type.small, color: colors.inkSoft },
});
