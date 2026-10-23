import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AuthProvider, useAuth } from '@/providers/auth-provider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <RootNavigator />
        <StatusBar style="auto" />
      </AuthProvider>
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { session, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  if (isLoading) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerBackTitle: 'Zpět' }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="recipe/new" options={{ title: 'Nový recept', presentation: 'modal' }} />
        <Stack.Screen name="recipe/[id]" options={{ title: 'Recept' }} />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" options={{ title: 'Přihlášení' }} />
        <Stack.Screen name="sign-up" options={{ title: 'Registrace' }} />
      </Stack.Protected>
    </Stack>
  );
}
