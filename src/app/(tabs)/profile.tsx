import Constants from 'expo-constants';
import { useEffect, useState } from 'react';

import { AppText, Button, Card, ErrorText, Screen, TextField } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';

export default function ProfileScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        setDisplayName((data as Profile | null)?.display_name ?? '');
      });
  }, [userId]);

  async function save() {
    if (!userId) return;
    setSaving(true);
    setError(null);
    setInfo(null);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() || null })
      .eq('id', userId);
    setSaving(false);
    if (updateError) {
      setError('Profil se nepodařilo uložit.');
      return;
    }
    setInfo('Uloženo.');
  }

  return (
    <Screen>
      <Card>
        <AppText variant="secondary">Přihlášen jako</AppText>
        <AppText>{session?.user.email}</AppText>
      </Card>
      <TextField
        label="Zobrazované jméno"
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Zobrazí se u Vašich veřejných receptů"
      />
      <ErrorText message={error} />
      {info ? <AppText variant="secondary">{info}</AppText> : null}
      <Button title="Uložit" onPress={save} loading={saving} />
      <Button title="Odhlásit se" variant="secondary" onPress={() => supabase.auth.signOut()} />
      <AppText variant="secondary">Verze {Constants.expoConfig?.version ?? '–'}</AppText>
    </Screen>
  );
}
