import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { UI_LOCALES } from '@streeteats/shared';
import { setLocale } from '@/i18n';
import { colors, touch, type } from '@/theme';

/** Big two-button EN / ES toggle, always visible at the top of key screens. */
export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('language.label')} style={styles.group}>
      {UI_LOCALES.map((locale) => {
        const active = i18n.language === locale;
        return (
          <Pressable
            key={locale}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLanguage={locale}
            onPress={() => void setLocale(locale)}
            style={[styles.option, active && styles.optionActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{t(`language.${locale}`)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 999,
    padding: 3,
  },
  option: {
    minHeight: touch.min - 12,
    minWidth: 88,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionActive: { backgroundColor: colors.ink },
  label: { fontSize: type.small + 1, fontWeight: '700', color: colors.ink },
  labelActive: { color: colors.white },
});
