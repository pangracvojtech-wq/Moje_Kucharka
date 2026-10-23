-- Row Level Security and client RPCs, executed as 'authenticated' / 'anon'.
-- Alice (A) owns a private and a public recipe, Bob (B) is another user.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ---------------------------------------------------------------------------
-- Fixtures (as migration owner)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.test');

insert into public.foods (id, source, source_id, name_cs, energy_kcal)
overriding system value
values (1001, 'custom', 't-1001', 'Mouka pšeničná hladká', 340);

insert into public.recipes (id, owner_id, title, servings, visibility)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Tajný guláš', 4, 'private'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Bramborové knedlíky', 2, 'public');

insert into public.recipe_ingredients (recipe_id, raw_text, name, quantity, unit_code, food_id)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '1 kg hovězí kližky', 'hovězí kližka', 1, 'kg', null),
  ('aaaaaaaa-0000-0000-0000-000000000002', '200 g hladké mouky', 'hladká mouka', 200, 'g', 1001);

-- ---------------------------------------------------------------------------
-- Bob
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select results_eq(
  'select id from public.recipes order by id',
  $$ values ('aaaaaaaa-0000-0000-0000-000000000002'::uuid) $$,
  'B sees only the public recipe of A'
);

select is_empty(
  $$ select 1 from public.recipe_ingredients where recipe_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'B cannot read ingredients of a private recipe'
);

select isnt_empty(
  $$ select 1 from public.recipe_ingredients where recipe_id = 'aaaaaaaa-0000-0000-0000-000000000002' $$,
  'B can read ingredients of a public recipe'
);

select isnt_empty(
  $$ select 1 from public.recipe_nutrition where recipe_id = 'aaaaaaaa-0000-0000-0000-000000000002' $$,
  'B can read nutrition of a public recipe'
);

select is_empty(
  $$ update public.recipes set title = 'Hacked' where id = 'aaaaaaaa-0000-0000-0000-000000000002' returning id $$,
  'B cannot update a public recipe of A'
);

select is_empty(
  $$ delete from public.recipes where id = 'aaaaaaaa-0000-0000-0000-000000000002' returning id $$,
  'B cannot delete a public recipe of A'
);

select throws_ok(
  $$ insert into public.recipes (owner_id, title) values ('11111111-1111-1111-1111-111111111111', 'Fake') $$,
  '42501', null,
  'B cannot create a recipe on behalf of A'
);

select throws_ok(
  $$ insert into public.recipe_ingredients (recipe_id, raw_text, name) values ('aaaaaaaa-0000-0000-0000-000000000002', 'x', 'x') $$,
  '42501', null,
  'B cannot add ingredients to a recipe of A'
);

select throws_ok(
  $$ insert into public.recipe_nutrition (recipe_id) values ('aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null,
  'clients cannot write nutrition directly'
);

select throws_ok(
  $$ insert into public.foods (source, name_cs) values ('custom', 'Fake') $$,
  '42501', null,
  'clients cannot write to the foods database'
);

select throws_ok(
  $$ select public.recalculate_recipe_nutrition('aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null,
  'clients cannot call recalculate_recipe_nutrition'
);

-- Saved recipes

select throws_ok(
  $$ insert into public.saved_recipes (recipe_id) values ('aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null,
  'B cannot save a private recipe'
);

select lives_ok(
  $$ insert into public.saved_recipes (recipe_id) values ('aaaaaaaa-0000-0000-0000-000000000002') $$,
  'B can save a public recipe'
);

-- Search

select results_eq(
  $$ select id from public.search_recipes(null, 'cookbook') $$,
  $$ values ('aaaaaaaa-0000-0000-0000-000000000002'::uuid) $$,
  'cookbook scope contains saved recipes'
);

select results_eq(
  $$ select id from public.search_recipes('knedlik', 'public') $$,
  $$ values ('aaaaaaaa-0000-0000-0000-000000000002'::uuid) $$,
  'prefix search without diacritics finds "Bramborové knedlíky"'
);

select results_eq(
  $$ select id from public.search_recipes('mouk', 'public') $$,
  $$ values ('aaaaaaaa-0000-0000-0000-000000000002'::uuid) $$,
  'search matches ingredient names'
);

select is_empty(
  $$ select id from public.search_recipes('gulas', 'public') $$,
  'search does not return private recipes of others'
);

-- Shopping list

select lives_ok(
  $$ insert into public.shopping_lists (id, name) values ('cccccccc-0000-0000-0000-000000000001', 'Týden') $$,
  'B can create a shopping list'
);

select is(
  public.add_recipe_to_shopping_list('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 4),
  1,
  'one ingredient added to the shopping list'
);

select is(
  (select quantity from public.shopping_list_items where list_id = 'cccccccc-0000-0000-0000-000000000001'),
  400::numeric,
  'quantity scaled from 2 to 4 servings'
);

select lives_ok(
  $$ select public.add_recipe_to_shopping_list('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 4) $$,
  'recipe can be added to the shopping list again'
);

select results_eq(
  $$ select quantity from public.shopping_list_items where list_id = 'cccccccc-0000-0000-0000-000000000001' $$,
  $$ values (800::numeric) $$,
  'same ingredient is merged into one item'
);

select throws_ok(
  $$ select public.add_recipe_to_shopping_list('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', null) $$,
  'P0002', null,
  'private recipe of another user cannot be added to a shopping list'
);

-- Own private recipe

select lives_ok(
  $$ insert into public.recipes (id, title) values ('aaaaaaaa-0000-0000-0000-000000000003', 'Bobova polévka') $$,
  'B can create own recipe (owner defaults to auth.uid())'
);

select is(
  (select owner_id from public.recipes where id = 'aaaaaaaa-0000-0000-0000-000000000003'),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'owner_id is set from auth.uid()'
);

-- ---------------------------------------------------------------------------
-- Alice
-- ---------------------------------------------------------------------------

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select results_eq(
  'select id from public.recipes order by id',
  $$ values ('aaaaaaaa-0000-0000-0000-000000000001'::uuid), ('aaaaaaaa-0000-0000-0000-000000000002'::uuid) $$,
  'A sees own recipes but not the private recipe of B'
);

select is_empty('select 1 from public.shopping_lists', 'A cannot see shopping lists of B');
select is_empty('select 1 from public.shopping_list_items', 'A cannot see shopping list items of B');
select is_empty('select 1 from public.saved_recipes', 'A cannot see saved recipes of B');

select isnt_empty(
  $$ update public.recipes set title = 'Guláš' where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning id $$,
  'A can update own recipe'
);

-- ---------------------------------------------------------------------------
-- Anonymous
-- ---------------------------------------------------------------------------

reset role;
set local role anon;
set local request.jwt.claim.sub = '';
set local request.jwt.claims = '{"role": "anon"}';

select is_empty('select 1 from public.recipes', 'anon cannot read recipes');
select is_empty('select 1 from public.profiles', 'anon cannot read profiles');
select is_empty('select 1 from public.foods', 'anon cannot read foods');

reset role;

select * from finish();
rollback;
