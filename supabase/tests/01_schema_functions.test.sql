-- Schema, triggers and helper functions (run as the migration owner, RLS not involved).

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111', 'alice@example.test', '{"display_name": "Alice"}');

insert into public.foods (id, source, source_id, name_cs, density_g_per_ml, energy_kcal, protein_g)
overriding system value
values
  (1001, 'custom', 't-1001', 'Mouka pšeničná hladká', 0.55, 340, 10),
  (1002, 'custom', 't-1002', 'Vejce slepičí', null, 140, 12.5),
  (1003, 'custom', 't-1003', 'Mléko polotučné', 1.03, 50, 3.4);

insert into public.food_unit_conversions (food_id, unit_code, grams_per_unit)
values (1002, 'ks', 55);

-- ---------------------------------------------------------------------------
-- Profiles and reference data
-- ---------------------------------------------------------------------------

select is(
  (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Alice',
  'profile is created by the auth trigger'
);

select is(public.normalize_text('Knedlíky ŠPENÁT'), 'knedliky spenat', 'normalize_text strips diacritics and lowercases');

select is((select count(*) from public.units)::integer, 16, 'units are seeded');

-- ---------------------------------------------------------------------------
-- Ingredient grams resolution
-- ---------------------------------------------------------------------------

insert into public.recipes (id, owner_id, title, servings)
values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Palačinky', 4);

insert into public.recipe_ingredients (id, recipe_id, position, raw_text, name, quantity, unit_code, food_id, is_optional)
values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 0, '500 g hladké mouky', 'hladká mouka', 500, 'g', 1001, false),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 1, '2 vejce', 'vejce', 2, 'ks', 1002, false),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 2, '2 dl mléka', 'mléko', 2, 'dl', 1003, false),
  ('bbbbbbbb-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 3, 'špetka soli', 'sůl', 1, 'spetka', null, false),
  ('bbbbbbbb-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 4, 'cukr na posypání', 'cukr', null, null, null, true);

select is((select grams from public.recipe_ingredients where id = 'bbbbbbbb-0000-0000-0000-000000000001'), 500::numeric, 'mass unit: 500 g');
select is((select grams from public.recipe_ingredients where id = 'bbbbbbbb-0000-0000-0000-000000000002'), 110::numeric, 'food-specific unit: 2 ks vejce = 110 g');
select is((select grams from public.recipe_ingredients where id = 'bbbbbbbb-0000-0000-0000-000000000003'), 206::numeric, 'volume unit with density: 2 dl mléka = 206 g');
select is((select grams from public.recipe_ingredients where id = 'bbbbbbbb-0000-0000-0000-000000000004'), 0.5::numeric, 'špetka = 0.5 g');
select is((select grams from public.recipe_ingredients where id = 'bbbbbbbb-0000-0000-0000-000000000005'), null::numeric, 'no quantity -> no grams');

-- ---------------------------------------------------------------------------
-- Nutrition calculation
-- energy = 500*340/100 + 110*140/100 + 206*50/100 = 1700 + 154 + 103 = 1957
-- ---------------------------------------------------------------------------

select is((select energy_kcal from public.recipe_nutrition where recipe_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1957.0::numeric, 'nutrition totals are calculated');
select is((select total_grams from public.recipe_nutrition where recipe_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 816.5::numeric, 'total grams exclude optional ingredients');
select is((select matched_ingredients from public.recipe_nutrition where recipe_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 3, 'matched ingredients count');
select is((select total_ingredients from public.recipe_nutrition where recipe_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 4, 'total ingredients exclude optional ones');

-- Manual grams are kept and nutrition follows: 250*340/100 + 154 + 103 = 1107
update public.recipe_ingredients set grams = 250, grams_is_manual = true
where id = 'bbbbbbbb-0000-0000-0000-000000000001';

select is((select grams from public.recipe_ingredients where id = 'bbbbbbbb-0000-0000-0000-000000000001'), 250::numeric, 'manual grams are not overwritten');
select is((select energy_kcal from public.recipe_nutrition where recipe_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1107.0::numeric, 'nutrition recalculated after manual grams');

-- Quantity change recalculates grams: 3 ks vejce = 165 g -> 850 + 231 + 103 = 1184
update public.recipe_ingredients set quantity = 3 where id = 'bbbbbbbb-0000-0000-0000-000000000002';

select is((select grams from public.recipe_ingredients where id = 'bbbbbbbb-0000-0000-0000-000000000002'), 165::numeric, 'grams recalculated after quantity change');
select is((select energy_kcal from public.recipe_nutrition where recipe_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1184.0::numeric, 'nutrition recalculated after quantity change');

-- Delete: 1184 - 103 = 1081
delete from public.recipe_ingredients where id = 'bbbbbbbb-0000-0000-0000-000000000003';

select is((select energy_kcal from public.recipe_nutrition where recipe_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1081.0::numeric, 'nutrition recalculated after ingredient delete');

-- ---------------------------------------------------------------------------
-- Search helpers
-- ---------------------------------------------------------------------------

select is(
  public.to_prefix_tsquery('Knedlíky s vejcem')::text,
  to_tsquery('simple', 'knedliky:* & s:* & vejcem:*')::text,
  'to_prefix_tsquery builds a normalized prefix query'
);

select is(public.to_prefix_tsquery('  '), null::tsquery, 'empty query -> null tsquery');

select is((select id from public.search_foods('mouka', 5) limit 1), 1001::bigint, 'search_foods finds flour');
select is((select id from public.search_foods('mleko', 5) limit 1), 1003::bigint, 'search_foods ignores diacritics');

-- ---------------------------------------------------------------------------
-- Storage path helper
-- ---------------------------------------------------------------------------

select is(
  public.recipe_id_from_storage_path('11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/cover.jpg'),
  'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
  'recipe id is extracted from storage path'
);

select is(public.recipe_id_from_storage_path('11111111-1111-1111-1111-111111111111/not-a-uuid/x.jpg'), null::uuid, 'invalid path segment -> null');

-- ---------------------------------------------------------------------------
-- Cascading delete does not fail on nutrition recalculation
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ delete from public.recipes where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'recipe delete cascades to ingredients without error'
);

select is((select count(*) from public.recipe_nutrition)::integer, 0, 'nutrition row removed with recipe');

select lives_ok(
  $$ delete from auth.users where id = '11111111-1111-1111-1111-111111111111' $$,
  'user delete cascades to profile'
);

select is((select count(*) from public.profiles where id = '11111111-1111-1111-1111-111111111111')::integer, 0, 'profile removed with user');

select * from finish();
rollback;
