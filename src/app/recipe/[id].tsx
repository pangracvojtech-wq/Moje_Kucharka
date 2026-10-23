import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, EmptyState, ErrorText, Loading, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { confirm, notify } from '@/lib/confirm';
import { formatQuantity } from '@/lib/ingredients';
import { getOrCreateCurrentList } from '@/lib/shopping';
import { supabase } from '@/lib/supabase';
import type { RecipeDetail, RecipeIngredient, RecipeNutrition } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';

const NUTRITION_ROWS: { key: keyof RecipeNutrition; label: string; unit: string }[] = [
  { key: 'energy_kcal', label: 'Energie', unit: 'kcal' },
  { key: 'protein_g', label: 'Bílkoviny', unit: 'g' },
  { key: 'carbs_g', label: 'Sacharidy', unit: 'g' },
  { key: 'sugars_g', label: 'z toho cukry', unit: 'g' },
  { key: 'fat_g', label: 'Tuky', unit: 'g' },
  { key: 'saturated_fat_g', label: 'z toho nasycené', unit: 'g' },
  { key: 'fiber_g', label: 'Vláknina', unit: 'g' },
  { key: 'salt_g', label: 'Sůl', unit: 'g' },
];

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [recipeResult, savedResult] = await Promise.all([
      supabase
        .from('recipes')
        .select('*, recipe_ingredients(*), recipe_nutrition(*), profiles(display_name)')
        .eq('id', id)
        .order('position', { referencedTable: 'recipe_ingredients' })
        .maybeSingle(),
      supabase.from('saved_recipes').select('recipe_id').eq('recipe_id', id).maybeSingle(),
    ]);
    setLoading(false);
    if (recipeResult.error) {
      setError('Recept se nepodařilo načíst.');
      return;
    }
    setError(null);
    setRecipe(recipeResult.data as RecipeDetail | null);
    setIsSaved(!!savedResult.data);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) {
    return <Loading />;
  }
  if (!recipe) {
    return (
      <Screen>
        <ErrorText message={error} />
        <EmptyState title="Recept nebyl nalezen" description="Mohl být smazán nebo nastaven jako soukromý." />
      </Screen>
    );
  }

  const isOwner = recipe.owner_id === session?.user.id;
  const nutrition = Array.isArray(recipe.recipe_nutrition)
    ? recipe.recipe_nutrition[0] ?? null
    : recipe.recipe_nutrition;
  const groups = groupIngredients(recipe.recipe_ingredients);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch {
      notify('Akce se nezdařila', 'Zkuste to prosím znovu.');
    } finally {
      setBusy(false);
    }
  }

  const addToShoppingList = () =>
    run(async () => {
      const list = await getOrCreateCurrentList();
      const { data, error: rpcError } = await supabase.rpc('add_recipe_to_shopping_list', {
        p_list_id: list.id,
        p_recipe_id: recipe.id,
        p_servings: recipe.servings,
      });
      if (rpcError) throw rpcError;
      notify('Přidáno do nákupního seznamu', `Počet surovin: ${data ?? 0}`);
    });

  const toggleVisibility = () =>
    run(async () => {
      const visibility = recipe.visibility === 'public' ? 'private' : 'public';
      const { error: updateError } = await supabase.from('recipes').update({ visibility }).eq('id', recipe.id);
      if (updateError) throw updateError;
      await load();
    });

  const toggleSaved = () =>
    run(async () => {
      const { error: saveError } = isSaved
        ? await supabase.from('saved_recipes').delete().eq('recipe_id', recipe.id)
        : await supabase.from('saved_recipes').insert({ recipe_id: recipe.id });
      if (saveError) throw saveError;
      setIsSaved(!isSaved);
    });

  const deleteRecipe = async () => {
    const confirmed = await confirm('Smazat recept?', `Recept „${recipe.title}“ bude trvale smazán.`, 'Smazat');
    if (!confirmed) return;
    await run(async () => {
      const { error: deleteError } = await supabase.from('recipes').delete().eq('id', recipe.id);
      if (deleteError) throw deleteError;
      router.back();
    });
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: recipe.title }} />

      <View style={styles.section}>
        <AppText variant="title">{recipe.title}</AppText>
        <AppText variant="secondary">
          {[
            recipe.servings ? `${recipe.servings} porce` : null,
            recipe.visibility === 'public' ? 'veřejný' : 'soukromý',
            !isOwner && recipe.profiles?.display_name ? `autor: ${recipe.profiles.display_name}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </AppText>
        {recipe.description ? <AppText>{recipe.description}</AppText> : null}
      </View>

      <Card>
        <AppText variant="subtitle">Suroviny</AppText>
        {recipe.recipe_ingredients.length === 0 ? (
          <AppText variant="secondary">Recept zatím nemá suroviny.</AppText>
        ) : (
          groups.map(([label, items]) => (
            <View key={label ?? '_'} style={styles.group}>
              {label ? <AppText variant="secondary">{label}</AppText> : null}
              {items.map((item) => (
                <AppText key={item.id}>
                  • {[formatQuantity(item.quantity, item.unit_code), item.name].filter(Boolean).join(' ')}
                  {item.is_optional ? ' (volitelné)' : ''}
                </AppText>
              ))}
            </View>
          ))
        )}
      </Card>

      {recipe.steps.length > 0 ? (
        <Card>
          <AppText variant="subtitle">Postup</AppText>
          {recipe.steps.map((step, index) => (
            <AppText key={index}>
              {index + 1}. {step}
            </AppText>
          ))}
        </Card>
      ) : null}

      <Card>
        <AppText variant="subtitle">
          Nutriční hodnoty{recipe.servings ? ' na porci' : ' celkem'}
        </AppText>
        {nutrition && nutrition.matched_ingredients > 0 ? (
          <>
            {NUTRITION_ROWS.map(({ key, label, unit }) => {
              const value = nutrition[key] as number | null;
              if (value === null) return null;
              const perServing = recipe.servings ? value / recipe.servings : value;
              return (
                <View key={key} style={styles.nutritionRow}>
                  <AppText>{label}</AppText>
                  <AppText>
                    {perServing.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} {unit}
                  </AppText>
                </View>
              );
            })}
            <AppText variant="secondary">
              Spočítáno z {nutrition.matched_ingredients} z {nutrition.total_ingredients} surovin.
            </AppText>
          </>
        ) : (
          <AppText variant="secondary">
            Nutriční hodnoty zatím nejsou k dispozici. Suroviny ještě nejsou spárované s databází potravin.
          </AppText>
        )}
      </Card>

      <ErrorText message={error} />

      <View style={styles.actions}>
        <Button title="Přidat do nákupního seznamu" onPress={addToShoppingList} disabled={busy} />
        {isOwner ? (
          <>
            <Button
              title={recipe.visibility === 'public' ? 'Nastavit jako soukromý' : 'Zveřejnit recept'}
              variant="secondary"
              onPress={toggleVisibility}
              disabled={busy}
            />
            <Button title="Smazat recept" variant="danger" onPress={deleteRecipe} disabled={busy} />
          </>
        ) : (
          <Button
            title={isSaved ? 'Odebrat z mé kuchařky' : 'Uložit do mé kuchařky'}
            variant="secondary"
            onPress={toggleSaved}
            disabled={busy}
          />
        )}
      </View>
    </Screen>
  );
}

function groupIngredients(items: RecipeIngredient[]): [string | null, RecipeIngredient[]][] {
  const groups = new Map<string | null, RecipeIngredient[]>();
  for (const item of items) {
    const list = groups.get(item.group_label) ?? [];
    list.push(item);
    groups.set(item.group_label, list);
  }
  return [...groups.entries()];
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  group: {
    gap: Spacing.one,
  },
  nutritionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actions: {
    gap: Spacing.two,
  },
});
