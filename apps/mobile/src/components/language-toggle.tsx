import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useLocale, type Locale } from '@/i18n/locale';
import { useTheme } from '@/hooks/use-theme';

const OPTIONS: { value: Locale; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'es', label: 'ES' },
];

export function LanguageToggle() {
  const theme = useTheme();
  const { locale, setLocale } = useLocale();

  return (
    <View style={[styles.wrap, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
      {OPTIONS.map((option) => {
        const isSelected = option.value === locale;
        return (
          <Pressable key={option.value} onPress={() => setLocale(option.value)} hitSlop={4}>
            <View style={[styles.option, isSelected && { backgroundColor: theme.primary }]}>
              <ThemedText
                type="small"
                themeColor="textSecondary"
                style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                {option.label}
              </ThemedText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    borderRadius: 999,
    borderWidth: 1.5,
    padding: 2,
    gap: 2,
  },
  option: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  optionText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
  },
  optionTextSelected: {
    color: '#fff',
  },
});
