-- Storage buckets and policies.
--   recipe-images:  {owner_id}/{recipe_id}/{file}  – readable when the recipe is visible to the caller
--   recipe-imports: {owner_id}/{file}              – photos for text recognition, owner only

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('recipe-images', 'recipe-images', false, 5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('recipe-imports', 'recipe-imports', false, 10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

-- Extracts {recipe_id} from '{owner_id}/{recipe_id}/{file}'; null when the segment is not a UUID.
create or replace function public.recipe_id_from_storage_path(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(p_name, '/', 2)::uuid
  end;
$$;

-- recipe-images

create policy "recipe_images_storage_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'recipe-images'
    and public.is_recipe_visible(public.recipe_id_from_storage_path(name))
  );

create policy "recipe_images_storage_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recipe-images'
    and split_part(name, '/', 1) = (select auth.uid())::text
    and public.is_recipe_owner(public.recipe_id_from_storage_path(name))
  );

create policy "recipe_images_storage_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'recipe-images'
    and split_part(name, '/', 1) = (select auth.uid())::text
  )
  with check (
    bucket_id = 'recipe-images'
    and split_part(name, '/', 1) = (select auth.uid())::text
    and public.is_recipe_owner(public.recipe_id_from_storage_path(name))
  );

create policy "recipe_images_storage_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'recipe-images'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

-- recipe-imports

create policy "recipe_imports_storage_all_own" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'recipe-imports'
    and split_part(name, '/', 1) = (select auth.uid())::text
  )
  with check (
    bucket_id = 'recipe-imports'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );
