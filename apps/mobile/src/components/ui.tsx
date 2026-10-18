import type { ReactNode } from 'react';
import { Pressable, type PressableProps, StyleSheet, Text, type ViewStyle } from 'react-native';
import { colors, touch, type } from '@/theme';

type Variant = 'primary' | 'dark' | 'outline';

export function Button({
  label,
  onPress,
  variant = 'primary',
  style,
  disabled,
  accessibilityHint,
}: {
  label: string;
  onPress: PressableProps['onPress'];
  variant?: Variant;
  style?: ViewStyle;
  disabled?: boolean;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, styles[variant], pressed && { opacity: 0.8 }, disabled && { opacity: 0.5 }, style]}
    >
      <Text style={[styles.label, variant === 'outline' && { color: colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ on, onPress, children }: { on: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
    >
      <Text style={[styles.chipText, on && { color: colors.white }]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: touch.min,
    borderRadius: 999,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.chile },
  dark: { backgroundColor: colors.ink },
  outline: { backgroundColor: colors.white, borderWidth: 2, borderColor: colors.ink },
  label: { color: colors.white, fontSize: type.body, fontWeight: '800' },
  chip: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(26,20,16,0.25)',
    backgroundColor: colors.white,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: type.small + 1, fontWeight: '700', color: colors.ink },
});
