import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { API_URL } from '@/config';
import { colors, type } from '@/theme';

export function ServerStatus() {
  const { t } = useTranslation();
  const [state, setState] = useState<'checking' | 'ok' | 'down'>('checking');

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/health`, { signal: controller.signal })
      .then((r) => setState(r.ok ? 'ok' : 'down'))
      .catch(() => {
        if (!controller.signal.aborted) setState('down');
      });
    return () => controller.abort();
  }, []);

  const label = state === 'checking' ? t('status.loading') : state === 'ok' ? t('status.serverOk') : t('status.serverDown');
  return (
    <View accessibilityRole="text" style={styles.row}>
      <View style={[styles.dot, { backgroundColor: state === 'ok' ? colors.live : state === 'down' ? colors.chile : colors.inkSoft }]} />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  text: { fontSize: type.small, color: colors.inkSoft },
});
