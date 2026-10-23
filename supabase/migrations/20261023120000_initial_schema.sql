-- Initial schema: profiles, reference data (units, foods), recipes, saved recipes, shopping lists.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Lowercase + strip diacritics. Immutable so it can be used in indexes and generated columns.
create or replace function public.normalize_text(value text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, value));
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 60),
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Reference data: units and foods (nutrition database)
-- ---------------------------------------------------------------------------

create table public.units (
  code text primary key,
  name_cs text not null,
  kind text not null check (kind in ('mass', 'volume', 'count', 'other')),
  grams_per_unit numeric(10, 4) check (grams_per_unit is null or grams_per_unit > 0),
  ml_per_unit numeric(10, 4) check (ml_per_unit is null or ml_per_unit > 0),
  sort_order integer not null default 0
);

create table public.foods (
  id bigint generated always as identity primary key,
  source text not null check (source in ('nutridatabaze', 'ciqual', 'openfoodfacts', 'custom')),
  source_id text,
  name_cs text not null,
  name_en text,
  category text,
  density_g_per_ml numeric(6, 3) check (density_g_per_ml is null or density_g_per_ml > 0),
  -- Nutrition values per 100 g
  energy_kcal numeric(8, 2),
  protein_g numeric(8, 2),
  fat_g numeric(8, 2),
  saturated_fat_g numeric(8, 2),
  carbs_g numeric(8, 2),
  sugars_g numeric(8, 2),
  fiber_g numeric(8, 2),
  salt_g numeric(8, 2),
  created_at timestamptz not null default now(),
  unique (source, source_id)
);

create index foods_name_trgm_idx on public.foods
  using gin (public.normalize_text(name_cs) extensions.gin_trgm_ops);

-- Food-specific unit weights, e.g. 1 ks vejce = 55 g, 1 hrnek mouky = 140 g.
create table public.food_unit_conversions (
  food_id bigint not null references public.foods (id) on delete cascade,
  unit_code text not null references public.units (code),
  grams_per_unit numeric(10, 4) not null check (grams_per_unit > 0),
  primary key (food_id, unit_code)
);

-- ---------------------------------------------------------------------------
-- Recipes
-- ---------------------------------------------------------------------------

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text check (description is null or char_length(description) <= 2000),
  steps text[] not null default '{}',
  servings integer check (servings is null or servings between 1 and 100),
  prep_minutes integer check (prep_minutes is null or prep_minutes between 0 and 10000),
  cook_minutes integer check (cook_minutes is null or cook_minutes between 0 and 10000),
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  source text not null default 'manual' check (source in ('manual', 'photo', 'import')),
  source_note text check (source_note is null or char_length(source_note) <= 500),
  search_vector tsvector generated always as (
    to_tsvector('simple', public.normalize_text(title || ' ' || coalesce(description, '')))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recipes_owner_id_idx on public.recipes (owner_id);
create index recipes_public_idx on public.recipes (updated_at desc) where visibility = 'public';
create index recipes_search_idx on public.recipes using gin (search_vector);

create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

-- Storage path convention: recipe-images/{owner_id}/{recipe_id}/{file}
create table public.recipe_images (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  storage_path text not null unique,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index recipe_images_recipe_id_idx on public.recipe_images (recipe_id, position);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  position integer not null default 0,
  group_label text check (group_label is null or char_length(group_label) <= 100),
  raw_text text not null check (char_length(raw_text) between 1 and 300),
  name text not null check (char_length(name) between 1 and 200),
  quantity numeric(10, 3) check (quantity is null or quantity >= 0),
  unit_code text references public.units (code),
  -- Resolved weight; computed by trigger unless grams_is_manual
  grams numeric(10, 2) check (grams is null or grams >= 0),
  grams_is_manual boolean not null default false,
  food_id bigint references public.foods (id) on delete set null,
  match_status text not null default 'unmatched' check (match_status in ('unmatched', 'auto', 'confirmed')),
  is_optional boolean not null default false,
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recipe_ingredients_recipe_id_idx on public.recipe_ingredients (recipe_id, position);
create index recipe_ingredients_food_id_idx on public.recipe_ingredients (food_id);

create trigger recipe_ingredients_set_updated_at
  before update on public.recipe_ingredients
  for each row execute function public.set_updated_at();

-- Totals for the whole recipe; per-serving values = total / recipes.servings.
-- Written only by public.recalculate_recipe_nutrition().
create table public.recipe_nutrition (
  recipe_id uuid primary key references public.recipes (id) on delete cascade,
  energy_kcal numeric(10, 1),
  protein_g numeric(10, 1),
  fat_g numeric(10, 1),
  saturated_fat_g numeric(10, 1),
  carbs_g numeric(10, 1),
  sugars_g numeric(10, 1),
  fiber_g numeric(10, 1),
  salt_g numeric(10, 1),
  total_grams numeric(10, 1),
  matched_ingredients integer not null default 0,
  total_ingredients integer not null default 0,
  calculated_at timestamptz not null default now()
);

-- Public recipes of other users added to "my cookbook" (reference, not a copy).
create table public.saved_recipes (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

create index saved_recipes_recipe_id_idx on public.saved_recipes (recipe_id);

-- ---------------------------------------------------------------------------
-- Shopping lists
-- ---------------------------------------------------------------------------

create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null default 'Nákupní seznam' check (char_length(name) between 1 and 100),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shopping_lists_owner_id_idx on public.shopping_lists (owner_id);

create trigger shopping_lists_set_updated_at
  before update on public.shopping_lists
  for each row execute function public.set_updated_at();

create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists (id) on delete cascade,
  position integer not null default 0,
  name text not null check (char_length(name) between 1 and 200),
  quantity numeric(10, 3) check (quantity is null or quantity >= 0),
  unit_code text references public.units (code),
  food_id bigint references public.foods (id) on delete set null,
  recipe_id uuid references public.recipes (id) on delete set null,
  is_checked boolean not null default false,
  created_at timestamptz not null default now()
);

create index shopping_list_items_list_id_idx on public.shopping_list_items (list_id, position);

-- ---------------------------------------------------------------------------
-- Reference data: units (needed in every environment, therefore in a migration)
-- ---------------------------------------------------------------------------

insert into public.units (code, name_cs, kind, grams_per_unit, ml_per_unit, sort_order) values
  ('g',       'g',          'mass',   1,       null, 10),
  ('dkg',     'dkg',        'mass',   10,      null, 20),
  ('kg',      'kg',         'mass',   1000,    null, 30),
  ('ml',      'ml',         'volume', null,    1,    40),
  ('dl',      'dl',         'volume', null,    100,  50),
  ('l',       'l',          'volume', null,    1000, 60),
  ('lzicka',  'lžička',     'volume', null,    5,    70),
  ('lzice',   'lžíce',      'volume', null,    15,   80),
  ('hrnek',   'hrnek',      'volume', null,    250,  90),
  ('spetka',  'špetka',     'mass',   0.5,     null, 100),
  ('ks',      'ks',         'count',  null,    null, 110),
  ('strouzek','stroužek',   'count',  null,    null, 120),
  ('platek',  'plátek',     'count',  null,    null, 130),
  ('hrst',    'hrst',       'count',  null,    null, 140),
  ('baleni',  'balení',     'count',  null,    null, 150),
  ('svazek',  'svazek',     'count',  null,    null, 160);
