import { useRouter } from 'expo-router';

import { RecipeSearchList } from '@/components/recipe-search-list';
import { Button } from '@/components/ui';

export default function CookbookScreen() {
  const router = useRouter();

  return (
    <RecipeSearchList
      scope="cookbook"
      emptyTitle="Kuchařka je zatím prázdná"
      emptyDescription="Přidejte první recept, nebo si uložte recept z Objevit."
      header={<Button title="Nový recept" onPress={() => router.push('/recipe/new')} />}
    />
  );
}
