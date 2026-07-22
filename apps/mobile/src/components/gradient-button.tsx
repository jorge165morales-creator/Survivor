import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandGradient, Spacing } from '@/constants/theme';

type GradientButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  children: string;
  isLoading?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** The app's one primary-action look: the brand violet→pink→orange sweep. */
export function GradientButton({ children, isLoading = false, disabled, style, ...pressableProps }: GradientButtonProps) {
  const isDisabled = disabled || isLoading;

  return (
    <Pressable disabled={isDisabled} style={[styles.wrap, isDisabled && styles.disabled, style]} {...pressableProps}>
      <LinearGradient colors={BrandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.gradient}>
        {isLoading ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.text}>{children}</ThemedText>}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  gradient: {
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: 'Outfit_700Bold',
    color: '#fff',
    fontSize: 16,
  },
  disabled: {
    opacity: 0.5,
  },
});
