import { useFocusEffect } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { RecipeCard } from '@/components/recipe-card';
import { EmptyState, ErrorText, TextField } from '@/components/ui';
import { Spacing, useTheme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import type { Recipe } from '@/lib/types';

type Props = {
  scope: 'cookbook' | 'public';
  emptyTitle: string;
  emptyDescription: string;
  header?: ReactNode;
};

const SEARCH_DEBOUNCE_MS = 300;

export function RecipeSearchList({ scope, emptyTitle, emptyDescription, header }: Props) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc('search_recipes', {
      p_query: debouncedQuery.trim() || null,
      p_scope: scope,
    });
    setLoading(false);
    if (rpcError) {
      setError('Recepty se nepodařilo načíst.');
      return;
    }
    setError(null);
    setRecipes((data ?? []) as Recipe[]);
  }, [debouncedQuery, scope]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      data={recipes}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <RecipeCard recipe={item} />}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      ListHeaderComponent={
        <View style={styles.header}>
          {header}
          <TextField
            placeholder="Hledat recept nebo surovinu"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          <ErrorText message={error} />
        </View>
      }
      ListEmptyComponent={
        loading ? null : (
          <EmptyState
            title={debouncedQuery ? 'Nic nenalezeno' : emptyTitle}
            description={debouncedQuery ? 'Zkuste jiný výraz.' : emptyDescription}
          />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.three,
  },
});
