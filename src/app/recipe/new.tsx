import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { AppText, Button, ErrorText, Screen, TextField } from '@/components/ui';
import { Spacing, useTheme } from '@/constants/theme';
import { formatQuantity, parseIngredients } from '@/lib/ingredients';
import { supabase } from '@/lib/supabase';

export default function NewRecipeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [servings, setServings] = useState('4');
  const [ingredientsText, setIngredientsText] = useState('');
  const [stepsText, setStepsText] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const ingredients = parseIngredients(ingredientsText);

  async function save() {
    const servingsNumber = Number.parseInt(servings, 10);
    if (!title.trim()) {
      setError('Vyplňte název receptu.');
      return;
    }

    setSaving(true);
    setError(null);

    const { data: recipe, error: recipeError } = await supabase
      .from('recipes')
      .insert({
        title: title.trim(),
        description: description.trim() || null,
        servings: Number.isFinite(servingsNumber) && servingsNumber > 0 ? servingsNumber : null,
        steps: stepsText
          .split(/\r?\n/)
          .map((step) => step.trim())
          .filter(Boolean),
        visibility: isPublic ? 'public' : 'private',
        source: 'manual',
      })
      .select('id')
      .single();

    if (recipeError || !recipe) {
      setSaving(false);
      setError('Recept se nepodařilo uložit.');
      return;
    }

    if (ingredients.length > 0) {
      const { error: ingredientsError } = await supabase
        .from('recipe_ingredients')
        .insert(ingredients.map((ingredient) => ({ ...ingredient, recipe_id: recipe.id })));

      if (ingredientsError) {
        // Keep data consistent: remove the recipe without ingredients.
        await supabase.from('recipes').delete().eq('id', recipe.id);
        setSaving(false);
        setError('Suroviny se nepodařilo uložit.');
        return;
      }
    }

    setSaving(false);
    router.replace({ pathname: '/recipe/[id]', params: { id: recipe.id } });
  }

  return (
    <Screen>
      <TextField label="Název" value={title} onChangeText={setTitle} placeholder="Palačinky" />
      <TextField
        label="Popis"
        value={description}
        onChangeText={setDescription}
        multiline
        placeholder="Krátký popis receptu"
      />
      <TextField label="Počet porcí" value={servings} onChangeText={setServings} keyboardType="number-pad" />
      <TextField
        label="Suroviny (každá na nový řádek)"
        value={ingredientsText}
        onChangeText={setIngredientsText}
        multiline
        autoCapitalize="none"
        placeholder={'500 g hladké mouky\n2 vejce\n3 dl mléka\nšpetka soli'}
      />
      {ingredients.length > 0 ? (
        <View style={[styles.preview, { borderColor: theme.border }]}>
          <AppText variant="secondary">Rozpoznáno:</AppText>
          {ingredients.map((ingredient) => (
            <AppText key={ingredient.position} variant="secondary">
              • {[formatQuantity(ingredient.quantity, ingredient.unit_code), ingredient.name]
                .filter(Boolean)
                .join(' ')}
            </AppText>
          ))}
        </View>
      ) : null}
      <TextField
        label="Postup (každý krok na nový řádek)"
        value={stepsText}
        onChangeText={setStepsText}
        multiline
      />
      <View style={styles.row}>
        <View style={styles.rowText}>
          <AppText>Veřejný recept</AppText>
          <AppText variant="secondary">Uvidí ho ostatní uživatelé a mohou si ho uložit.</AppText>
        </View>
        <Switch value={isPublic} onValueChange={setIsPublic} />
      </View>
      <ErrorText message={error} />
      <Button title="Uložit recept" onPress={save} loading={saving} disabled={!title.trim()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  rowText: {
    flex: 1,
  },
});
