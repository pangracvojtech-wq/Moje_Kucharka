import { Link } from 'expo-router';
import { useState } from 'react';

import { AppText, Button, ErrorText, Screen, TextField } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (signInError) {
      setError('Přihlášení se nezdařilo. Zkontrolujte e-mail a heslo.');
    }
  }

  return (
    <Screen>
      <AppText variant="title">Moje Kuchařka</AppText>
      <AppText variant="secondary">Přihlaste se ke své kuchařce.</AppText>
      <TextField
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <TextField
        label="Heslo"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
      />
      <ErrorText message={error} />
      <Button title="Přihlásit se" onPress={signIn} loading={loading} disabled={!email || !password} />
      <Link href="/sign-up" asChild>
        <AppText variant="secondary" accessibilityRole="link">
          Nemáte účet? Zaregistrujte se.
        </AppText>
      </Link>
    </Screen>
  );
}
