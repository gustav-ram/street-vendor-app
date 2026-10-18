import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { VendorProfile } from '@streeteats/shared';
import { api, ApiRequestError } from '@/api/client';
import { Button } from '@/components/ui';
import { CategoryIcon, DirectionsButton, LiveLine, PaymentBadges, Rating, StatusBanner, VerifiedBadge } from '@/components/vendor';
import { useFormat } from '@/hooks/useFormat';
import { colors, space, type } from '@/theme';

// One aggregate "profile view" per vendor per app session. Nothing about who.
const viewedThisSession = new Set<string>();

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function daysSince(iso: string) {
  const start = new Date(iso);
  const today = new Date();
  const a = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((b - a) / 86_400_000);
}

function Profile({ v }: { v: VendorProfile }) {
  const { t, i18n } = useTranslation('vendor');
  const { t: tc } = useTranslation('catalog');
  const { t: ts } = useTranslation('search');
  const f = useFormat();

  const lastActive = (() => {
    if (!v.lastActiveAt) return t('lastActive.long');
    const d = daysSince(v.lastActiveAt);
    if (d <= 0) return t('lastActive.today');
    if (d === 1) return t('lastActive.yesterday');
    if (d > 30) return t('lastActive.long');
    return t('lastActive.days', { count: d });
  })();

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <CategoryIcon category={v.categories[0]} size={64} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.name}>{v.displayName}</Text>
          <Text style={styles.muted}>
            {v.categories.map((c) => tc(`categories.${c}`)).join(' · ')}
            {v.priceLevel ? ` · ${'$'.repeat(v.priceLevel)}` : ''}
          </Text>
          {v.verified && <VerifiedBadge />}
          <Rating average={v.rating.average} count={v.rating.count} />
        </View>
      </View>

      {v.live ? (
        <View style={[styles.box, styles.liveBox]}>
          <LiveLine live={v.live} />
          <Text style={styles.muted}>📍 {v.live.location.precision === 'approximate' ? ts('live.approximate') : ts('live.exact')}</Text>
          <DirectionsButton vendorId={v.id} location={v.live.location} />
        </View>
      ) : (
        <View style={styles.box}>
          <Text style={styles.strong}>{t('closed')}</Text>
          <Text style={styles.muted}>{lastActive}</Text>
        </View>
      )}

      {v.status && <StatusBanner text={v.status} />}

      <Section title={t('menu')}>
        {v.menu.length === 0 ? (
          <Text style={styles.muted}>{t('emptyMenu')}</Text>
        ) : (
          <View style={styles.menu}>
            {v.menu.map((m) => (
              <View key={m.id} style={[styles.menuRow, m.soldOut && { opacity: 0.55 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuName, m.soldOut && { textDecorationLine: 'line-through' }]}>{m.name}</Text>
                  {m.description ? <Text style={styles.muted}>{m.description}</Text> : null}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={styles.price}>{f.price(m.priceCents)}</Text>
                  {m.soldOut && <Text style={styles.soldOut}>{t('soldOut')}</Text>}
                </View>
              </View>
            ))}
          </View>
        )}
      </Section>

      <Section title={t('payments')}>
        <PaymentBadges methods={v.paymentMethods} />
      </Section>

      {v.languages.length > 0 && (
        <Section title={t('speaks')}>
          <Text style={styles.body}>{v.languages.map((l) => tc(`languages.${l}`)).join(' · ')}</Text>
        </Section>
      )}

      {v.upcoming.length > 0 && (
        <Section title={t('upcoming')}>
          {v.upcoming.map((u) => (
            <View key={`${u.kind}-${u.id}-${u.startsAt}`} style={styles.box}>
              <Text style={styles.strong}>
                {ts(`upcoming.${u.kind}`)} · {ts('upcoming.when', { start: f.dayTime(u.startsAt), end: f.time(u.endsAt) })}
              </Text>
              {u.placeLabel ? <Text style={styles.body}>📍 {u.placeLabel}</Text> : null}
              {u.note ? <Text style={styles.muted}>{u.note}</Text> : null}
            </View>
          ))}
        </Section>
      )}

      {v.schedule.length > 0 && (
        <Section title={t('schedule')}>
          {v.schedule.map((s, i) => (
            <Text key={i} style={styles.body}>
              <Text style={styles.strong}>{f.weekday(s.weekday)}</Text> {f.clock(s.startTime)} – {f.clock(s.endTime)}
              {s.placeLabel ? ` · ${s.placeLabel}` : ''}
            </Text>
          ))}
        </Section>
      )}

      {(v.description || v.tags.length > 0) && (
        <Section title={t('about')}>
          {v.description ? <Text style={styles.body}>{v.description}</Text> : null}
          <View style={styles.tags}>
            {v.tags.map((tag) => (
              <Text key={tag.slug} style={styles.tag}>
                {i18n.language === 'es' ? tag.nameEs : tag.nameEn}
              </Text>
            ))}
          </View>
        </Section>
      )}

      {v.contact && (
        <Section title={t('contact')}>
          <Text style={styles.body}>{v.contact}</Text>
        </Section>
      )}

      <Section title={t('reviews')}>
        {v.reviews.length === 0 ? (
          <Text style={styles.muted}>{t('noReviews')}</Text>
        ) : (
          v.reviews.map((r) => (
            <View key={r.id} style={styles.box}>
              <Text>
                <Text style={{ color: colors.marigold }}>{'★'.repeat(r.rating)}</Text>
                <Text style={{ color: 'rgba(26,20,16,0.2)' }}>{'★'.repeat(5 - r.rating)}</Text>
                <Text style={styles.strong}>  {r.authorName ?? t('anonymous')}</Text>
              </Text>
              {r.body ? <Text style={styles.body}>{r.body}</Text> : null}
              {r.vendorReply ? (
                <View style={styles.reply}>
                  <Text style={styles.strong}>{t('vendorReply')}</Text>
                  <Text style={styles.body}>{r.vendorReply}</Text>
                </View>
              ) : null}
            </View>
          ))
        )}
      </Section>
    </ScrollView>
  );
}

export default function VendorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation('vendor');
  const { t: tc } = useTranslation();
  const { t: te } = useTranslation('errors');
  const query = useQuery({ queryKey: ['vendor', id], queryFn: () => api.vendor(id) });

  useEffect(() => {
    if (!id || viewedThisSession.has(id)) return;
    viewedThisSession.add(id);
    void api.event(id, 'profile_view').catch(() => {});
  }, [id]);

  return (
    <>
      <Stack.Screen options={{ title: query.data?.displayName ?? '' }} />
      {query.isPending ? (
        <Text style={[styles.muted, { padding: space.md }]}>{tc('status.loading')}</Text>
      ) : query.isError ? (
        <View style={{ padding: space.md, gap: space.md }}>
          <Text style={styles.body}>
            {query.error instanceof ApiRequestError && query.error.code === 'not_found'
              ? t('notFound')
              : te(query.error instanceof ApiRequestError ? query.error.code : 'internal')}
          </Text>
          <Button variant="dark" label={tc('actions.retry')} onPress={() => void query.refetch()} />
        </View>
      ) : (
        <Profile v={query.data} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.md, gap: space.lg, paddingBottom: space.xl * 2 },
  header: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  name: { fontSize: type.title - 4, fontWeight: '900', color: colors.ink, lineHeight: 32 },
  muted: { color: colors.inkSoft, fontSize: type.small },
  strong: { color: colors.ink, fontWeight: '800', fontSize: type.body - 1 },
  body: { color: colors.ink, fontSize: type.body - 1, lineHeight: 24 },
  box: { backgroundColor: colors.white, borderRadius: 16, padding: space.md, gap: 6, borderWidth: 1, borderColor: 'rgba(26,20,16,0.12)' },
  liveBox: { borderColor: colors.live, borderWidth: 2, backgroundColor: 'rgba(21,127,60,0.05)', gap: space.sm },
  section: { gap: space.sm, borderTopWidth: 2, borderTopColor: colors.sand, paddingTop: space.md },
  sectionTitle: { fontSize: type.heading - 2, fontWeight: '900', color: colors.ink },
  menu: { backgroundColor: colors.white, borderRadius: 16, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', gap: space.md, padding: space.md, borderBottomWidth: 1, borderBottomColor: colors.sand },
  menuName: { fontSize: type.body, fontWeight: '800', color: colors.ink },
  price: { fontSize: type.body, fontWeight: '900', color: colors.ink },
  soldOut: { backgroundColor: colors.chile, color: colors.white, fontWeight: '800', fontSize: 13, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { backgroundColor: colors.sand, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', fontSize: type.small, fontWeight: '600', color: colors.ink },
  reply: { borderLeftWidth: 4, borderLeftColor: colors.chile, paddingLeft: space.sm, marginTop: 4, gap: 2 },
});
