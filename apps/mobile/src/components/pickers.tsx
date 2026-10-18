import * as Location from 'expo-location';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import type { LatLng } from '@streeteats/shared';
import { useFormat } from '@/hooks/useFormat';
import { colors, space, touch, type } from '@/theme';
import { Button } from './ui';

/** Downtown LA, when there's no spot to start from. */
const FALLBACK: LatLng = { lat: 34.0483, lng: -118.2526 };
const STEP_MIN = 30;

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHHMM = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** A clock time with big − and + buttons (30-minute steps): easy outdoors, no tiny wheels. */
export function TimeStepper({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const f = useFormat();
  const step = (d: number) => onChange(toHHMM(Math.round((toMinutes(value) + d) / STEP_MIN) * STEP_MIN));
  return (
    <View style={styles.stepper}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.stepRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label} −`} onPress={() => step(-STEP_MIN)} style={styles.stepBtn}>
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <Text style={styles.time} numberOfLines={1} accessibilityLabel={`${label}: ${f.clock(value)}`}>
          {f.clock(value)}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label} +`} onPress={() => step(STEP_MIN)} style={styles.stepBtn}>
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Pick a spot by moving the map under a fixed pin. The spot goes only to our
 * API, which publishes an approximate area unless the vendor chose "exact".
 */
export function SpotPicker({ initial, onChange }: { initial: LatLng | null; onChange: (p: LatLng) => void }) {
  const { t } = useTranslation('dashboard');
  const map = useRef<MapView>(null);
  const [start] = useState(initial ?? FALLBACK);
  const [locating, setLocating] = useState(false);

  const locateMe = async () => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return;
      // One reading, only to place the pin.
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      map.current?.animateToRegion({ latitude: p.lat, longitude: p.lng, latitudeDelta: 0.006, longitudeDelta: 0.006 }, 300);
      onChange(p);
    } catch {
      // Stays where it was.
    } finally {
      setLocating(false);
    }
  };

  return (
    <View style={{ gap: space.sm }}>
      <Text style={styles.hint}>{t('upcoming.whereHint')}</Text>
      <View>
        <MapView
          ref={map}
          style={styles.map}
          initialRegion={{ latitude: start.lat, longitude: start.lng, latitudeDelta: 0.008, longitudeDelta: 0.008 }}
          onRegionChangeComplete={(r) => onChange({ lat: r.latitude, lng: r.longitude })}
          accessibilityLabel={t('upcoming.where')}
        />
        <View pointerEvents="none" style={styles.pinWrap}>
          <Text style={styles.pin}>📍</Text>
        </View>
      </View>
      <Button variant="outline" label={`📍 ${locating ? '…' : t('upcoming.useMyLocation')}`} onPress={() => void locateMe()} disabled={locating} />
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: { gap: 6 },
  label: { fontSize: type.body, fontWeight: '900', color: colors.ink },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: {
    width: touch.min,
    height: touch.min,
    borderRadius: touch.min / 2,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: 26, fontWeight: '900', color: colors.ink, marginTop: -2 },
  time: { flex: 1, textAlign: 'center', fontSize: type.body + 4, fontWeight: '900', color: colors.ink },
  hint: { fontSize: type.small, color: colors.inkSoft },
  map: { height: 220, borderRadius: 16, overflow: 'hidden' },
  pinWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  pin: { fontSize: 36, marginTop: -36 },
});
