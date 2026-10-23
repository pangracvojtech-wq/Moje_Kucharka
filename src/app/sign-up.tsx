import { Link } from 'expo-router';
import { useState } from 'react';

import { AppText, Button, ErrorText, Screen, TextField } from '@/components/ui';
import { supabase } from '@/lib/supabase';

const MIN_PASSWORD_LENGTH = 8;

export default function SignUpScreen() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signUp() {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Heslo musí mít alespoň ${MIN_PASSWORD_LENGTH} znaků.`);
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: displayName.trim() || null } },
    });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    if (!data.session) {
      setInfo('Na Váš e-mail jsme poslali odkaz pro potvrzení registrace.');
    }
  }

  return (
    <Screen>
      <AppText variant="title">Registrace</AppText>
      <TextField label="Jméno (zobrazí se u veřejných receptů)" value={displayName} onChangeText={setDisplayName} />
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
        label={`Heslo (alespoň ${MIN_PASSWORD_LENGTH} znaků)`}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <ErrorText message={error} />
      {info ? <AppText>{info}</AppText> : null}
      <Button title="Zaregistrovat se" onPress={signUp} loading={loading} disabled={!email || !password} />
      <Link href="/sign-in" asChild>
        <AppText variant="secondary" accessibilityRole="link">
          Už máte účet? Přihlaste se.
        </AppText>
      </Link>
    </Screen>
  );
}
