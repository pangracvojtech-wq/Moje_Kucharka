-- Row Level Security. All policies target the 'authenticated' role; anonymous access is denied.
-- auth.uid() is wrapped in a subselect so it is evaluated once per statement.

-- ---------------------------------------------------------------------------
-- Helpers (security definer to avoid recursive RLS evaluation on public.recipes)
-- ---------------------------------------------------------------------------

create or replace function public.is_recipe_owner(p_recipe_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.recipes r
    where r.id = p_recipe_id and r.owner_id = (select auth.uid())
  );
$$;

create or replace function public.is_recipe_visible(p_recipe_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.recipes r
    where r.id = p_recipe_id
      and (r.owner_id = (select auth.uid()) or r.visibility = 'public')
  );
$$;

create or replace function public.is_shopping_list_owner(p_list_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.shopping_lists l
    where l.id = p_list_id and l.owner_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_recipe_owner(uuid) from public, anon;
revoke execute on function public.is_recipe_visible(uuid) from public, anon;
revoke execute on function public.is_shopping_list_owner(uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.units enable row level security;
alter table public.foods enable row level security;
alter table public.food_unit_conversions enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_images enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_nutrition enable row level security;
alter table public.saved_recipes enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;

-- ---------------------------------------------------------------------------
-- Profiles: readable by all signed-in users (author name on public recipes), editable by owner.
-- Insert is done by the auth trigger, delete cascades from auth.users.
-- ---------------------------------------------------------------------------

create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated
  using (true);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Reference data: read-only for users, maintained via service role / migrations.
-- ---------------------------------------------------------------------------

create policy "units_select_authenticated" on public.units
  for select to authenticated
  using (true);

create policy "foods_select_authenticated" on public.foods
  for select to authenticated
  using (true);

create policy "food_unit_conversions_select_authenticated" on public.food_unit_conversions
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Recipes
-- ---------------------------------------------------------------------------

create policy "recipes_select_own_or_public" on public.recipes
  for select to authenticated
  using (owner_id = (select auth.uid()) or visibility = 'public');

create policy "recipes_insert_own" on public.recipes
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "recipes_update_own" on public.recipes
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "recipes_delete_own" on public.recipes
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Child tables follow the parent recipe.

create policy "recipe_ingredients_select_visible" on public.recipe_ingredients
  for select to authenticated
  using (public.is_recipe_visible(recipe_id));

create policy "recipe_ingredients_insert_own" on public.recipe_ingredients
  for insert to authenticated
  with check (public.is_recipe_owner(recipe_id));

create policy "recipe_ingredients_update_own" on public.recipe_ingredients
  for update to authenticated
  using (public.is_recipe_owner(recipe_id))
  with check (public.is_recipe_owner(recipe_id));

create policy "recipe_ingredients_delete_own" on public.recipe_ingredients
  for delete to authenticated
  using (public.is_recipe_owner(recipe_id));

create policy "recipe_images_select_visible" on public.recipe_images
  for select to authenticated
  using (public.is_recipe_visible(recipe_id));

create policy "recipe_images_insert_own" on public.recipe_images
  for insert to authenticated
  with check (public.is_recipe_owner(recipe_id));

create policy "recipe_images_update_own" on public.recipe_images
  for update to authenticated
  using (public.is_recipe_owner(recipe_id))
  with check (public.is_recipe_owner(recipe_id));

create policy "recipe_images_delete_own" on public.recipe_images
  for delete to authenticated
  using (public.is_recipe_owner(recipe_id));

-- Nutrition is written only by public.recalculate_recipe_nutrition().
create policy "recipe_nutrition_select_visible" on public.recipe_nutrition
  for select to authenticated
  using (public.is_recipe_visible(recipe_id));

-- ---------------------------------------------------------------------------
-- Saved recipes: only public recipes of other users can be saved.
-- If the author later makes the recipe private, the saved row stays but the recipe is hidden.
-- ---------------------------------------------------------------------------

create policy "saved_recipes_select_own" on public.saved_recipes
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "saved_recipes_insert_own_public" on public.saved_recipes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.recipes r
      where r.id = recipe_id
        and r.visibility = 'public'
        and r.owner_id <> (select auth.uid())
    )
  );

create policy "saved_recipes_delete_own" on public.saved_recipes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Shopping lists: private to the owner.
-- ---------------------------------------------------------------------------

create policy "shopping_lists_all_own" on public.shopping_lists
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "shopping_list_items_all_own" on public.shopping_list_items
  for all to authenticated
  using (public.is_shopping_list_owner(list_id))
  with check (public.is_shopping_list_owner(list_id));
