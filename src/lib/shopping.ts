import { supabase } from '@/lib/supabase';
import type { ShoppingList } from '@/lib/types';

// Returns the user's newest non-archived shopping list, creating one if none exists.
export async function getOrCreateCurrentList(): Promise<ShoppingList> {
  const { data: existing, error } = await supabase
    .from('shopping_lists')
    .select('*')
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (existing) {
    return existing as ShoppingList;
  }

  const { data: created, error: createError } = await supabase
    .from('shopping_lists')
    .insert({ name: 'Nákupní seznam' })
    .select('*')
    .single();

  if (createError) {
    throw createError;
  }
  return created as ShoppingList;
}
