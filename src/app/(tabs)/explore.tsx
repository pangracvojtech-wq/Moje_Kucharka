import { RecipeSearchList } from '@/components/recipe-search-list';

export default function ExploreScreen() {
  return (
    <RecipeSearchList
      scope="public"
      emptyTitle="Zatím žádné veřejné recepty"
      emptyDescription="Až někdo zveřejní recept, najdete ho tady."
    />
  );
}
