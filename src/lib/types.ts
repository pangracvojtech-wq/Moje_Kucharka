// Row types mirroring supabase/migrations. Replace with `supabase gen types` output later.

export type Visibility = 'private' | 'public';

export type Recipe = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  steps: string[];
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  visibility: Visibility;
  source: 'manual' | 'photo' | 'import';
  source_note: string | null;
  created_at: string;
  updated_at: string;
};

export type RecipeIngredient = {
  id: string;
  recipe_id: string;
  position: number;
  group_label: string | null;
  raw_text: string;
  name: string;
  quantity: number | null;
  unit_code: string | null;
  grams: number | null;
  grams_is_manual: boolean;
  food_id: number | null;
  match_status: 'unmatched' | 'auto' | 'confirmed';
  is_optional: boolean;
  note: string | null;
};

export type RecipeNutrition = {
  recipe_id: string;
  energy_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  saturated_fat_g: number | null;
  carbs_g: number | null;
  sugars_g: number | null;
  fiber_g: number | null;
  salt_g: number | null;
  total_grams: number | null;
  matched_ingredients: number;
  total_ingredients: number;
};

export type RecipeDetail = Recipe & {
  recipe_ingredients: RecipeIngredient[];
  recipe_nutrition: RecipeNutrition | RecipeNutrition[] | null;
  profiles: { display_name: string | null } | null;
};

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_path: string | null;
};

export type ShoppingList = {
  id: string;
  owner_id: string;
  name: string;
  is_archived: boolean;
};

export type ShoppingListItem = {
  id: string;
  list_id: string;
  position: number;
  name: string;
  quantity: number | null;
  unit_code: string | null;
  food_id: number | null;
  recipe_id: string | null;
  is_checked: boolean;
};
