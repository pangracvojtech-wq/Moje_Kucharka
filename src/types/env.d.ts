/// <reference types="expo/types" />

// Committed counterpart of the generated expo-env.d.ts, so `tsc` works in CI without `expo start`.
declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_KEY?: string;
  }
}
