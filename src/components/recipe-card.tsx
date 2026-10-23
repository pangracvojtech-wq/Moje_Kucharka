import { Link } from 'expo-router';
import { Pressable } from 'react-native';

import { AppText, Card } from '@/components/ui';
import type { Recipe } from '@/lib/types';

export function RecipeCard({ recipe }: { recipe: Recipe }) {
  const meta = [
    recipe.servings ? `${recipe.servings} porce` : null,
    recipe.visibility === 'public' ? 'veřejný' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Link href={{ pathname: '/recipe/[id]', params: { id: recipe.id } }} asChild>
      <Pressable accessibilityRole="link">
        <Card>
          <AppText variant="subtitle">{recipe.title}</AppText>
          {recipe.description ? (
            <AppText variant="secondary" numberOfLines={2}>
              {recipe.description}
            </AppText>
          ) : null}
          {meta ? <AppText variant="secondary">{meta}</AppText> : null}
        </Card>
      </Pressable>
    </Link>
  );
}
