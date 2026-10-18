import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Keyboard, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { CATEGORY_EMOJI, type LatLng, searchPlaces } from '@streeteats/shared';
import { api } from '@/api/client';
import { SelectedCard } from '@/components/SelectedCard';
import { Button } from '@/components/ui';
import { VendorRow } from '@/components/VendorRow';
import { activeFilterCount, exploreStore, useExplore } from '@/state/explore';
import { colors, space, touch, type } from '@/theme';

// Approximate-area circle drawn around fuzzed points (see PLAN.md §6.1).
const APPROX_RADIUS_M = 150;
const MOVE_THRESHOLD_M = 400;
const REGION_DELTA = 0.06;

type LocateState = 'idle' | 'locating' | 'denied' | 'unavailable';

function metersBetween(a: LatLng, b: LatLng) {
  const dLat = (b.lat - a.lat) * 111_320;
  const dLng = (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

export default function ExploreScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation('search');
  const { t: tc } = useTranslation();
  const { origin, filters } = useExplore();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [view, setView] = useState<'map' | 'list'>('map');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [locateState, setLocateState] = useState<LocateState>('idle');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [placeQuery, setPlaceQuery] = useState('');
  const [movedTo, setMovedTo] = useState<LatLng | null>(null);
  const mapRef = useRef<MapView>(null);
  const userTouched = useRef(false);

  const locate = useCallback(async () => {
    setLocateState('locating');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocateState('denied');
        return;
      }
      // Foreground, one-shot, balanced accuracy. Coarsened before it's stored.
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      exploreStore.setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude }, { kind: 'you' });
      setLocateState('idle');
    } catch {
      setLocateState('unavailable');
    }
  }, []);

  useEffect(() => {
    void locate();
  }, [locate]);

  useEffect(() => {
    setMovedTo(null);
    setSelectedId(null);
    mapRef.current?.animateToRegion(
      { latitude: origin.lat, longitude: origin.lng, latitudeDelta: REGION_DELTA, longitudeDelta: REGION_DELTA },
      400,
    );
  }, [origin]);

  const search = useQuery({
    queryKey: ['search', origin.lat, origin.lng, q, filters],
    queryFn: () =>
      api.search({
        location: { lat: origin.lat, lng: origin.lng },
        radiusM: filters.radiusM,
        q: q || undefined,
        filters: {
          categories: filters.categories,
          priceLevels: filters.priceLevels,
          paymentMethods: filters.paymentMethods,
          languages: filters.languages,
        },
        include: filters.openNow ? ['live'] : ['live', 'upcoming'],
      }),
    placeholderData: keepPreviousData,
  });

  const live = useMemo(() => search.data?.live ?? [], [search.data]);
  const upcoming = useMemo(() => search.data?.upcoming ?? [], [search.data]);
  const results = useMemo(() => [...live, ...(filters.openNow ? [] : upcoming)], [live, upcoming, filters.openNow]);
  const selected = results.find((v) => v.id === selectedId) ?? null;
  const filterCount = activeFilterCount(filters);

  const pins = useMemo(
    () => [
      ...live.map((v) => ({ id: v.id, name: v.displayName, emoji: CATEGORY_EMOJI[v.categories[0] ?? 'other'], loc: v.live.location, upcoming: false })),
      ...(filters.openNow
        ? []
        : upcoming.flatMap((v) =>
            v.spot.location
              ? [{ id: v.id, name: v.displayName, emoji: CATEGORY_EMOJI[v.categories[0] ?? 'other'], loc: v.spot.location, upcoming: true }]
              : [],
          )),
    ],
    [live, upcoming, filters.openNow],
  );

  const where =
    origin.label.kind === 'you'
      ? t('location.nearYou')
      : t('location.near', { place: origin.label.kind === 'place' ? origin.label.name : t('location.mapCenter') });

  const emptyState = (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{t('noResults')}</Text>
      <Text style={styles.muted}>{t('noResultsHint')}</Text>
      {filters.openNow && (
        <Button variant="outline" label={t('showUpcoming')} onPress={() => exploreStore.setFilters({ ...filters, openNow: false })} />
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.top}>
        <View style={styles.searchRow}>
          <TextInput
            value={input}
            onChangeText={(v) => {
              setInput(v);
              if (v === '') setQ('');
            }}
            onSubmitEditing={() => {
              setQ(input.trim());
              Keyboard.dismiss();
            }}
            placeholder={t('searchPlaceholder')}
            placeholderTextColor={colors.inkSoft}
            returnKeyType="search"
            clearButtonMode="while-editing"
            maxLength={80}
            accessibilityLabel={t('searchLabel')}
            style={styles.search}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/filters')}
            style={[styles.filterBtn, filterCount > 0 && styles.filterBtnOn]}
          >
            <Text style={[styles.filterText, filterCount > 0 && { color: colors.white }]}>
              {filterCount ? t('filtersActive', { count: filterCount }) : t('filters')}
            </Text>
          </Pressable>
        </View>
        <View style={styles.locRow}>
          <Text style={styles.where} numberOfLines={1}>
            📍 {where}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => setPickerOpen(true)} hitSlop={8}>
            <Text style={styles.link}>{t('location.choose')}</Text>
          </Pressable>
          <View style={styles.segment} accessibilityRole="tablist">
            {(['map', 'list'] as const).map((v) => (
              <Pressable
                key={v}
                accessibilityRole="tab"
                accessibilityState={{ selected: view === v }}
                onPress={() => {
                  Keyboard.dismiss();
                  setView(v);
                }}
                style={[styles.segmentItem, view === v && styles.segmentOn]}
              >
                <Text style={[styles.segmentText, view === v && { color: colors.white }]}>{t(`view.${v}`)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        {(locateState === 'denied' || locateState === 'unavailable') && (
          <Pressable onPress={() => setPickerOpen(true)}>
            <Text style={styles.alert}>{locateState === 'denied' ? t('location.denied') : t('location.unavailable')}</Text>
          </Pressable>
        )}
        {search.data?.matchedTags.length ? (
          <Text style={styles.muted} numberOfLines={2}>
            {t('understoodAs', { tags: search.data.matchedTags.map((tag) => (i18n.language === 'es' ? tag.nameEs : tag.nameEn)).join(' · ') })}
          </Text>
        ) : null}
      </View>

      {view === 'map' ? (
        <View style={{ flex: 1 }}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            initialRegion={{ latitude: origin.lat, longitude: origin.lng, latitudeDelta: REGION_DELTA, longitudeDelta: REGION_DELTA }}
            showsUserLocation={origin.label.kind === 'you'}
            showsPointsOfInterests={false}
            onTouchStart={() => {
              userTouched.current = true;
            }}
            onRegionChangeComplete={(region) => {
              if (!userTouched.current) return;
              userTouched.current = false;
              const center = { lat: region.latitude, lng: region.longitude };
              setMovedTo(metersBetween(center, origin) > MOVE_THRESHOLD_M ? center : null);
            }}
            onPress={() => {
              Keyboard.dismiss();
              setSelectedId(null);
            }}
          >
            {pins.map((p) =>
              p.loc.precision === 'approximate' ? (
                <Circle
                  key={`c-${p.upcoming ? 'u' : 'l'}-${p.id}`}
                  center={{ latitude: p.loc.lat, longitude: p.loc.lng }}
                  radius={APPROX_RADIUS_M}
                  strokeColor={p.upcoming ? 'rgba(91,80,72,0.6)' : 'rgba(180,35,24,0.6)'}
                  fillColor={p.upcoming ? 'rgba(91,80,72,0.08)' : 'rgba(180,35,24,0.08)'}
                />
              ) : null,
            )}
            {pins.map((p) => (
              <Marker
                key={`m-${p.upcoming ? 'u' : 'l'}-${p.id}-${p.id === selectedId}`}
                coordinate={{ latitude: p.loc.lat, longitude: p.loc.lng }}
                accessibilityLabel={p.name}
                tracksViewChanges={false}
                zIndex={p.id === selectedId ? 10 : p.upcoming ? 0 : 1}
                onPress={(e) => {
                  e.stopPropagation();
                  setSelectedId(p.id);
                }}
              >
                <View style={[styles.pin, p.upcoming && styles.pinUpcoming, p.id === selectedId && styles.pinSelected]}>
                  <Text style={styles.pinEmoji}>{p.emoji}</Text>
                </View>
              </Marker>
            ))}
          </MapView>
          <View style={styles.mapTop} pointerEvents="box-none">
            <Text style={styles.countPill}>
              {search.isPending ? tc('status.loading') : search.isError ? t('error') : t('results', { count: live.length })}
            </Text>
            {movedTo && (
              <Button variant="dark" label={`🔍 ${t('location.searchThisArea')}`} onPress={() => exploreStore.setOrigin(movedTo, { kind: 'area' })} />
            )}
          </View>
          {selected && <SelectedCard vendor={selected} onClose={() => setSelectedId(null)} />}
          {!search.isPending && results.length === 0 && !selected && <View style={styles.emptyOverlay}>{emptyState}</View>}
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(v) => ('live' in v ? `l-${v.id}` : `u-${v.id}`)}
          renderItem={({ item }) => <VendorRow vendor={item} />}
          ListHeaderComponent={<Text style={styles.listHeader}>{t('results', { count: live.length })}</Text>}
          ListEmptyComponent={search.isPending ? <Text style={[styles.muted, { padding: space.md }]}>{tc('status.loading')}</Text> : emptyState}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          refreshing={search.isFetching && !search.isPending}
          onRefresh={() => void search.refetch()}
        />
      )}

      <Modal visible={pickerOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPickerOpen(false)}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.pickerHead}>
            <Text style={styles.pickerTitle}>{t('location.choose')}</Text>
            <Pressable accessibilityRole="button" onPress={() => setPickerOpen(false)} hitSlop={12}>
              <Text style={styles.link}>{tc('actions.close')}</Text>
            </Pressable>
          </View>
          <View style={{ paddingHorizontal: space.md, gap: space.sm }}>
            <Button
              variant="dark"
              label={locateState === 'locating' ? t('location.locating') : `📍 ${t('location.useMine')}`}
              onPress={() => {
                setPickerOpen(false);
                void locate();
              }}
            />
            <TextInput
              value={placeQuery}
              onChangeText={setPlaceQuery}
              placeholder={t('location.placeholder')}
              placeholderTextColor={colors.inkSoft}
              accessibilityLabel={t('location.placeholder')}
              style={styles.search}
              autoCorrect={false}
            />
            <Text style={styles.muted}>{t('location.privacy')}</Text>
          </View>
          {/* Matching runs on the phone: what's typed here is never sent anywhere. */}
          <FlatList
            data={searchPlaces(placeQuery, 20)}
            keyExtractor={(p) => p.name}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  exploreStore.setOrigin(item, { kind: 'place', name: item.name });
                  setPickerOpen(false);
                  setPlaceQuery('');
                }}
                style={({ pressed }) => [styles.placeRow, pressed && { backgroundColor: colors.sand }]}
              >
                <Text style={styles.placeText}>{item.name}</Text>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  top: { paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm, borderBottomWidth: 2, borderBottomColor: colors.sand },
  searchRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  search: {
    flex: 0,
    flexGrow: 1,
    minHeight: touch.min,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 999,
    paddingHorizontal: 18,
    fontSize: type.body,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  filterBtn: { minHeight: touch.min, paddingHorizontal: 16, borderRadius: 999, borderWidth: 2, borderColor: colors.ink, justifyContent: 'center', backgroundColor: colors.white },
  filterBtnOn: { backgroundColor: colors.ink },
  filterText: { fontWeight: '800', fontSize: type.small + 1, color: colors.ink },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  where: { flexShrink: 1, fontWeight: '800', fontSize: type.small + 1, color: colors.ink },
  link: { color: colors.chile, fontWeight: '800', fontSize: type.small + 1 },
  segment: { marginLeft: 'auto', flexDirection: 'row', borderWidth: 2, borderColor: colors.ink, borderRadius: 999, padding: 2 },
  segmentItem: { minHeight: 40, minWidth: 64, paddingHorizontal: 12, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: colors.ink },
  segmentText: { fontWeight: '800', fontSize: type.small, color: colors.ink },
  alert: { color: colors.chile, fontWeight: '700', fontSize: type.small },
  muted: { color: colors.inkSoft, fontSize: type.small },
  mapTop: { position: 'absolute', top: space.sm, left: 0, right: 0, alignItems: 'center', gap: space.sm },
  countPill: {
    backgroundColor: colors.white,
    color: colors.ink,
    fontWeight: '800',
    fontSize: type.small,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(26,20,16,0.2)',
  },
  pin: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    borderWidth: 3,
    borderColor: colors.chile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinUpcoming: { borderColor: colors.inkSoft, borderStyle: 'dashed', opacity: 0.85 },
  pinSelected: { borderColor: colors.ink, transform: [{ scale: 1.2 }] },
  pinEmoji: { fontSize: 22 },
  listHeader: { fontSize: type.body, fontWeight: '900', color: colors.ink, padding: space.md, paddingBottom: space.xs },
  empty: { padding: space.md, gap: space.sm },
  emptyOverlay: { position: 'absolute', left: space.sm, right: space.sm, bottom: space.sm, backgroundColor: colors.white, borderRadius: 20, borderWidth: 2, borderColor: colors.ink },
  emptyTitle: { fontSize: type.body, fontWeight: '800', color: colors.ink },
  pickerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: space.md },
  pickerTitle: { fontSize: type.heading, fontWeight: '900', color: colors.ink },
  placeRow: { minHeight: touch.min, justifyContent: 'center', paddingHorizontal: space.md, borderBottomWidth: 1, borderBottomColor: colors.sand },
  placeText: { fontSize: type.body, color: colors.ink },
});
