import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { AppText, Button, EmptyState, ErrorText, TextField } from '@/components/ui';
import { Spacing, useTheme } from '@/constants/theme';
import { formatQuantity } from '@/lib/ingredients';
import { getOrCreateCurrentList } from '@/lib/shopping';
import { supabase } from '@/lib/supabase';
import type { ShoppingList, ShoppingListItem } from '@/lib/types';

export default function ShoppingScreen() {
  const theme = useTheme();
  const [list, setList] = useState<ShoppingList | null>(null);
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [newItem, setNewItem] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const current = await getOrCreateCurrentList();
      const { data, error: itemsError } = await supabase
        .from('shopping_list_items')
        .select('*')
        .eq('list_id', current.id)
        .order('is_checked')
        .order('position');
      if (itemsError) throw itemsError;
      setList(current);
      setItems((data ?? []) as ShoppingListItem[]);
      setError(null);
    } catch {
      setError('Nákupní seznam se nepodařilo načíst.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function toggle(item: ShoppingListItem) {
    setItems((current) =>
      current.map((it) => (it.id === item.id ? { ...it, is_checked: !it.is_checked } : it)),
    );
    const { error: updateError } = await supabase
      .from('shopping_list_items')
      .update({ is_checked: !item.is_checked })
      .eq('id', item.id);
    if (updateError) {
      setError('Položku se nepodařilo uložit.');
      load();
    }
  }

  async function addItem() {
    const name = newItem.trim();
    if (!name || !list) return;
    const position = items.reduce((max, it) => Math.max(max, it.position + 1), 0);
    const { error: insertError } = await supabase
      .from('shopping_list_items')
      .insert({ list_id: list.id, name, position });
    if (insertError) {
      setError('Položku se nepodařilo přidat.');
      return;
    }
    setNewItem('');
    load();
  }

  async function clearChecked() {
    if (!list) return;
    const { error: deleteError } = await supabase
      .from('shopping_list_items')
      .delete()
      .eq('list_id', list.id)
      .eq('is_checked', true);
    if (deleteError) {
      setError('Koupené položky se nepodařilo smazat.');
      return;
    }
    load();
  }

  const hasChecked = items.some((item) => item.is_checked);

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      data={items}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.addRow}>
            <View style={styles.addInput}>
              <TextField
                placeholder="Přidat položku"
                value={newItem}
                onChangeText={setNewItem}
                onSubmitEditing={addItem}
                returnKeyType="done"
              />
            </View>
            <Button title="Přidat" onPress={addItem} disabled={!newItem.trim()} />
          </View>
          <ErrorText message={error} />
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.is_checked }}
          onPress={() => toggle(item)}
          style={[styles.item, { borderColor: theme.border }]}>
          <Ionicons
            name={item.is_checked ? 'checkbox' : 'square-outline'}
            size={24}
            color={item.is_checked ? theme.primary : theme.textSecondary}
          />
          <AppText
            style={[styles.itemText, item.is_checked && styles.checked]}
            variant={item.is_checked ? 'secondary' : 'body'}>
            {item.name}
          </AppText>
          <AppText variant="secondary">{formatQuantity(item.quantity, item.unit_code)}</AppText>
        </Pressable>
      )}
      ListEmptyComponent={
        loading ? null : (
          <EmptyState
            title="Seznam je prázdný"
            description="Přidejte položku ručně, nebo suroviny z detailu receptu."
          />
        )
      }
      ListFooterComponent={
        hasChecked ? <Button title="Smazat koupené" variant="secondary" onPress={clearChecked} /> : null
      }
    />
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  header: {
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  addInput: {
    flex: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemText: {
    flex: 1,
  },
  checked: {
    textDecorationLine: 'line-through',
  },
});
