import { Tabs, TabList, TabTrigger, TabSlot, TabTriggerSlotProps, TabListProps } from 'expo-router/ui';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { BrandGradient, MaxContentWidth, Spacing } from '@/constants/theme';
import { useLocale } from '@/i18n/locale';

export default function AppTabs() {
  const { t } = useLocale();

  return (
    <Tabs style={styles.root}>
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton icon={require('@/assets/images/tabIcons/home.png')}>{t.tabs.home}</TabButton>
          </TabTrigger>
          <TabTrigger name="rules" href="/rules" asChild>
            <TabButton icon={require('@/assets/images/tabIcons/explore.png')}>{t.tabs.rules}</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
      <TabSlot style={{ flex: 1 }} />
    </Tabs>
  );
}

export function TabButton({
  children,
  isFocused,
  icon,
  ...props
}: TabTriggerSlotProps & { icon: number }) {
  if (isFocused) {
    return (
      <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
        <LinearGradient colors={BrandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.tabButtonView}>
          <Image source={icon} style={styles.icon} tintColor="#fff" contentFit="contain" />
          <ThemedText type="small" style={styles.tabTextFocused}>
            {children}
          </ThemedText>
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable {...props} style={({ pressed }) => [styles.tabButtonView, pressed && styles.pressed]}>
      <Image source={icon} style={styles.icon} contentFit="contain" />
      <ThemedText type="small" themeColor="textSecondary">
        {children}
      </ThemedText>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const insets = useSafeAreaInsets();
  return (
    <View {...props} style={[styles.tabListContainer, { paddingTop: insets.top + Spacing.three }]}>
      <ThemedView type="backgroundElement" style={styles.innerContainer}>
        <ThemedText type="smallBold" style={styles.brandText}>
          Survivor
        </ThemedText>

        {props.children}
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'column',
  },
  tabListContainer: {
    width: '100%',
    padding: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.five,
    borderRadius: Spacing.five,
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  brandText: {
    marginRight: 'auto',
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 18,
    letterSpacing: -0.3,
  },
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  tabTextFocused: {
    color: '#fff',
    fontFamily: 'Outfit_700Bold',
  },
  icon: {
    width: 16,
    height: 16,
  },
});
