-- Business logic: ingredient weight resolution, nutrition calculation, search, shopping list helpers.

-- ---------------------------------------------------------------------------
-- Ingredient weight resolution
-- Priority: food-specific conversion -> mass unit -> volume unit * food density (default 1 g/ml).
-- ---------------------------------------------------------------------------

create or replace function public.resolve_ingredient_grams(
  p_quantity numeric,
  p_unit_code text,
  p_food_id bigint
)
returns numeric
language plpgsql
stable
set search_path = ''
as $$
declare
  v_food_grams numeric;
  v_unit_grams numeric;
  v_unit_ml numeric;
  v_density numeric;
begin
  if p_quantity is null or p_unit_code is null then
    return null;
  end if;

  if p_food_id is not null then
    select c.grams_per_unit into v_food_grams
    from public.food_unit_conversions c
    where c.food_id = p_food_id and c.unit_code = p_unit_code;

    if v_food_grams is not null then
      return round(p_quantity * v_food_grams, 2);
    end if;
  end if;

  select u.grams_per_unit, u.ml_per_unit into v_unit_grams, v_unit_ml
  from public.units u
  where u.code = p_unit_code;

  if v_unit_grams is not null then
    return round(p_quantity * v_unit_grams, 2);
  end if;

  if v_unit_ml is not null then
    select f.density_g_per_ml into v_density from public.foods f where f.id = p_food_id;
    return round(p_quantity * v_unit_ml * coalesce(v_density, 1), 2);
  end if;

  return null;
end;
$$;

create or replace function public.recipe_ingredients_resolve_grams()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.grams_is_manual then
    new.grams := public.resolve_ingredient_grams(new.quantity, new.unit_code, new.food_id);
  end if;
  return new;
end;
$$;

create trigger recipe_ingredients_resolve_grams
  before insert or update of quantity, unit_code, food_id, grams, grams_is_manual
  on public.recipe_ingredients
  for each row execute function public.recipe_ingredients_resolve_grams();

-- ---------------------------------------------------------------------------
-- Nutrition calculation (totals for the whole recipe, optional ingredients excluded)
-- ---------------------------------------------------------------------------

create or replace function public.recalculate_recipe_nutrition(p_recipe_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Recipe may be gone when called from a cascading delete.
  if not exists (select 1 from public.recipes r where r.id = p_recipe_id) then
    return;
  end if;

  insert into public.recipe_nutrition as n (
    recipe_id, energy_kcal, protein_g, fat_g, saturated_fat_g, carbs_g, sugars_g, fiber_g, salt_g,
    total_grams, matched_ingredients, total_ingredients, calculated_at
  )
  select
    p_recipe_id,
    round(sum(i.grams * f.energy_kcal / 100), 1),
    round(sum(i.grams * f.protein_g / 100), 1),
    round(sum(i.grams * f.fat_g / 100), 1),
    round(sum(i.grams * f.saturated_fat_g / 100), 1),
    round(sum(i.grams * f.carbs_g / 100), 1),
    round(sum(i.grams * f.sugars_g / 100), 1),
    round(sum(i.grams * f.fiber_g / 100), 1),
    round(sum(i.grams * f.salt_g / 100), 1),
    round(sum(i.grams), 1),
    count(*) filter (where i.food_id is not null and i.grams is not null),
    count(*),
    now()
  from public.recipe_ingredients i
  left join public.foods f on f.id = i.food_id
  where i.recipe_id = p_recipe_id
    and not i.is_optional
  on conflict (recipe_id) do update set
    energy_kcal = excluded.energy_kcal,
    protein_g = excluded.protein_g,
    fat_g = excluded.fat_g,
    saturated_fat_g = excluded.saturated_fat_g,
    carbs_g = excluded.carbs_g,
    sugars_g = excluded.sugars_g,
    fiber_g = excluded.fiber_g,
    salt_g = excluded.salt_g,
    total_grams = excluded.total_grams,
    matched_ingredients = excluded.matched_ingredients,
    total_ingredients = excluded.total_ingredients,
    calculated_at = excluded.calculated_at;
end;
$$;

create or replace function public.recipe_ingredients_recalculate_nutrition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.recalculate_recipe_nutrition(new.recipe_id);
  end if;

  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.recipe_id is distinct from old.recipe_id) then
    perform public.recalculate_recipe_nutrition(old.recipe_id);
  end if;

  return null;
end;
$$;

create trigger recipe_ingredients_recalculate_nutrition
  after insert or update or delete on public.recipe_ingredients
  for each row execute function public.recipe_ingredients_recalculate_nutrition();

-- Internal only; reachable through the trigger above.
revoke execute on function public.recalculate_recipe_nutrition(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Search
-- Czech has no built-in text search configuration, so 'simple' + unaccent + prefix matching
-- ("knedlik" finds "knedliky").
-- ---------------------------------------------------------------------------

create or replace function public.to_prefix_tsquery(p_query text)
returns tsquery
language sql
immutable
set search_path = ''
as $$
  select to_tsquery('simple', string_agg(w || ':*', ' & '))
  from regexp_split_to_table(public.normalize_text(coalesce(p_query, '')), '[^a-z0-9]+') as w
  where w <> '';
$$;

-- Scopes: 'cookbook' = own + saved recipes, 'mine', 'saved', 'public'.
-- Runs with caller privileges, RLS applies.
create or replace function public.search_recipes(
  p_query text default null,
  p_scope text default 'cookbook',
  p_limit integer default 50,
  p_offset integer default 0
)
returns setof public.recipes
language sql
stable
set search_path = ''
as $$
  with q as (
    select public.to_prefix_tsquery(p_query) as tsq, public.normalize_text(btrim(coalesce(p_query, ''))) as norm
  )
  select r.*
  from public.recipes r, q
  where
    case p_scope
      when 'mine' then r.owner_id = (select auth.uid())
      when 'saved' then exists (
        select 1 from public.saved_recipes s where s.recipe_id = r.id and s.user_id = (select auth.uid())
      )
      when 'public' then r.visibility = 'public'
      else r.owner_id = (select auth.uid()) or exists (
        select 1 from public.saved_recipes s where s.recipe_id = r.id and s.user_id = (select auth.uid())
      )
    end
    and (
      q.tsq is null
      or r.search_vector @@ q.tsq
      or exists (
        select 1 from public.recipe_ingredients i
        where i.recipe_id = r.id and public.normalize_text(i.name) like '%' || q.norm || '%'
      )
    )
  order by r.updated_at desc
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
$$;

-- Candidate foods for an ingredient name (used by manual matching UI and the import function).
create or replace function public.search_foods(p_query text, p_limit integer default 10)
returns table (
  id bigint,
  name_cs text,
  category text,
  energy_kcal numeric,
  score real
)
language sql
stable
set search_path = ''
as $$
  select
    f.id,
    f.name_cs,
    f.category,
    f.energy_kcal,
    extensions.word_similarity(public.normalize_text(p_query), public.normalize_text(f.name_cs)) as score
  from public.foods f
  where public.normalize_text(p_query) operator(extensions.<%) public.normalize_text(f.name_cs)
  order by score desc, char_length(f.name_cs)
  limit least(greatest(p_limit, 1), 50);
$$;

-- ---------------------------------------------------------------------------
-- Shopping list: add all ingredients of a recipe, optionally scaled to servings.
-- Unchecked items with the same food (or name) and unit are merged.
-- Runs with caller privileges, RLS applies. Returns number of processed ingredients.
-- ---------------------------------------------------------------------------

create or replace function public.add_recipe_to_shopping_list(
  p_list_id uuid,
  p_recipe_id uuid,
  p_servings integer default null
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_recipe_servings integer;
  v_factor numeric := 1;
  v_count integer := 0;
  v_next_position integer;
  v_item_id uuid;
  v_ing record;
begin
  if not exists (
    select 1 from public.shopping_lists l
    where l.id = p_list_id and l.owner_id = (select auth.uid())
  ) then
    raise exception 'Shopping list not found' using errcode = 'P0002';
  end if;

  select r.servings into v_recipe_servings from public.recipes r where r.id = p_recipe_id;
  if not found then
    raise exception 'Recipe not found' using errcode = 'P0002';
  end if;

  if p_servings is not null and p_servings > 0 and v_recipe_servings is not null then
    v_factor := p_servings::numeric / v_recipe_servings;
  end if;

  select coalesce(max(it.position) + 1, 0) into v_next_position
  from public.shopping_list_items it
  where it.list_id = p_list_id;

  for v_ing in
    select i.name, i.quantity, i.unit_code, i.food_id
    from public.recipe_ingredients i
    where i.recipe_id = p_recipe_id
    order by i.position
  loop
    v_item_id := null;

    if v_ing.quantity is not null then
      select it.id into v_item_id
      from public.shopping_list_items it
      where it.list_id = p_list_id
        and not it.is_checked
        and it.quantity is not null
        and it.unit_code is not distinct from v_ing.unit_code
        and (
          (v_ing.food_id is not null and it.food_id = v_ing.food_id)
          or public.normalize_text(it.name) = public.normalize_text(v_ing.name)
        )
      limit 1;
    end if;

    if v_item_id is not null then
      update public.shopping_list_items
      set quantity = quantity + round(v_ing.quantity * v_factor, 3)
      where id = v_item_id;
    else
      insert into public.shopping_list_items (list_id, position, name, quantity, unit_code, food_id, recipe_id)
      values (
        p_list_id, v_next_position, v_ing.name, round(v_ing.quantity * v_factor, 3),
        v_ing.unit_code, v_ing.food_id, p_recipe_id
      );
      v_next_position := v_next_position + 1;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
