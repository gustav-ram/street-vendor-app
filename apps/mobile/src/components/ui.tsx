import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, StyleSheet, Text, TextInput, View, type ViewStyle } from 'react-native';
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
  style?: StyleProp<ViewStyle>;
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

export function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={fieldStyles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.inkSoft} {...input} style={[fieldStyles.input, input.multiline && { minHeight: 96, textAlignVertical: 'top' }, input.style]} />
      {hint ? <Text style={fieldStyles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** Two or more big options, one selected. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ gap: 8 }} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(o.value)}
            style={[fieldStyles.option, on && fieldStyles.optionOn]}
          >
            <Text style={[fieldStyles.optionLabel, on && { color: colors.white }]}>{on ? '● ' : '○ '}{o.label}</Text>
            {o.hint ? <Text style={[fieldStyles.hint, on && { color: 'rgba(255,255,255,0.85)' }]}>{o.hint}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** A 1–5 rating: filled stars in gold, empty ones as outlines (not color alone), read out as "4/5". */
export function Stars({ rating, size = type.body }: { rating: number; size?: number }) {
  return (
    <Text accessibilityLabel={`${rating}/5`} style={{ fontSize: size }}>
      <Text style={{ color: colors.star }}>{'★'.repeat(rating)}</Text>
      <Text style={{ color: colors.inkSoft }}>{'☆'.repeat(5 - rating)}</Text>
    </Text>
  );
}

export function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'warn' | 'error' }) {
  const bg = tone === 'error' ? 'rgba(180,35,24,0.12)' : tone === 'warn' ? 'rgba(245,165,36,0.25)' : colors.sand;
  return <Text style={[fieldStyles.notice, { backgroundColor: bg }]}>{text}</Text>;
}

const fieldStyles = StyleSheet.create({
  label: { fontSize: type.body, fontWeight: '800', color: colors.ink },
  hint: { fontSize: type.small, color: colors.inkSoft },
  input: {
    minHeight: touch.min,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: type.body,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  option: { borderWidth: 2, borderColor: colors.ink, borderRadius: 16, padding: 14, gap: 2, backgroundColor: colors.white },
  optionOn: { backgroundColor: colors.ink },
  optionLabel: { fontSize: type.body, fontWeight: '800', color: colors.ink },
  notice: { borderRadius: 12, overflow: 'hidden', padding: 12, fontSize: type.small + 1, color: colors.ink, lineHeight: 22 },
});
