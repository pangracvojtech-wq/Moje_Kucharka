import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { useTheme } from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} color={color as string} size={size} />
  );
}

export default function TabLayout() {
  const theme = useTheme();

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: theme.primary }}>
      <Tabs.Screen name="index" options={{ title: 'Kuchařka', tabBarIcon: tabIcon('book-outline') }} />
      <Tabs.Screen name="explore" options={{ title: 'Objevit', tabBarIcon: tabIcon('compass-outline') }} />
      <Tabs.Screen name="shopping" options={{ title: 'Nákup', tabBarIcon: tabIcon('cart-outline') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: tabIcon('person-outline') }} />
    </Tabs>
  );
}
