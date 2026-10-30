import { NativeTabs } from 'expo-router/native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function TabsLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <NativeTabs
      backgroundColor={colors.backgroundElement}
      indicatorColor={colors.backgroundSelected}
      tintColor={colors.accent}
      labelStyle={{ default: { color: colors.textSecondary }, selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon
          src={require('../../../assets/tab-icons/log.png')}
          renderingMode="template"
        />
        <NativeTabs.Trigger.Label>Log</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="drift">
        <NativeTabs.Trigger.Icon
          src={require('../../../assets/tab-icons/drift.png')}
          renderingMode="template"
        />
        <NativeTabs.Trigger.Label>Drift</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
