import { randomUUID } from 'expo-crypto';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { centsToInput, LIMITS, type MyMenuItem, parsePriceToCents, pendingEntityIds } from '@streeteats/shared';
import { PendingChip, SyncBar } from '@/components/sync';
import { Button, Field } from '@/components/ui';
import { useFormat } from '@/hooks/useFormat';
import { useMyVendor } from '@/hooks/useMyVendor';
import { enqueue, useOutboxItems } from '@/offline/outbox';
import { colors, space, touch, type } from '@/theme';

/**
 * Menu with one-tap "sold out". Every change goes through the offline
 * outbox: it shows at once and is sent when there's signal.
 */
export default function MenuScreen() {
  const { t } = useTranslation('dashboard');
  const f = useFormat();
  const vendor = useMyVendor();
  const items = useOutboxItems();
  const pending = useMemo(() => pendingEntityIds(items), [items]);
  const [editing, setEditing] = useState<MyMenuItem | 'new' | null>(null);

  const toggleSoldOut = (item: MyMenuItem, soldOut: boolean) =>
    void enqueue({ type: 'menu.soldOut', entityId: item.id, payload: { soldOut, clientUpdatedAt: new Date().toISOString() } });

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        data={vendor.data?.menu ?? []}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: space.md, gap: space.sm }}
        ListHeaderComponent={<SyncBar savedAt={vendor.savedAt} />}
        ListEmptyComponent={<Text style={styles.muted}>{t('menu.empty')}</Text>}
        renderItem={({ item }) => (
          <View style={[styles.row, item.soldOut && { opacity: 0.6 }]}>
            <Pressable accessibilityRole="button" onPress={() => setEditing(item)} style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.name, item.soldOut && { textDecorationLine: 'line-through' }]}>{item.name}</Text>
              <Text style={styles.price}>{f.price(item.priceCents)}</Text>
              {pending.has(item.id) && <PendingChip />}
            </Pressable>
            <View style={styles.toggle}>
              <Text style={[styles.toggleLabel, item.soldOut && { color: colors.chile }]}>
                {item.soldOut ? t('menu.soldOut') : t('menu.available')}
              </Text>
              <Switch
                value={!item.soldOut}
                onValueChange={(available) => toggleSoldOut(item, !available)}
                trackColor={{ true: colors.live, false: colors.chile }}
                accessibilityLabel={`${item.name}: ${t('menu.soldOut')}`}
              />
            </View>
          </View>
        )}
        ListFooterComponent={<Button label={t('menu.add')} onPress={() => setEditing('new')} style={{ marginTop: space.md }} />}
      />
      {editing && (
        <ItemEditor
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(item) => {
            setEditing(null);
            void enqueue({
              type: 'menu.put',
              entityId: item.id,
              payload: {
                name: item.name,
                description: item.description,
                priceCents: item.priceCents,
                soldOut: item.soldOut,
                clientUpdatedAt: item.clientUpdatedAt,
              },
            });
          }}
          onDelete={(id) => {
            setEditing(null);
            void enqueue({ type: 'menu.delete', entityId: id, payload: { clientUpdatedAt: new Date().toISOString() } });
          }}
        />
      )}
    </SafeAreaView>
  );
}

function ItemEditor({
  item,
  onClose,
  onSave,
  onDelete,
}: {
  item: MyMenuItem | null;
  onClose: () => void;
  onSave: (item: MyMenuItem) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation('dashboard');
  const { t: tc } = useTranslation();
  const [name, setName] = useState(item?.name ?? '');
  const [price, setPrice] = useState(item ? centsToInput(item.priceCents) : '');
  const [description, setDescription] = useState(item?.description ?? '');
  const cents = parsePriceToCents(price);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.sheet}>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>{item ? t('menu.edit') : t('menu.new')}</Text>
          <Text style={styles.link} onPress={onClose}>
            {tc('actions.cancel')}
          </Text>
        </View>
        <View style={{ padding: space.md, gap: space.md }}>
          <Field label={t('menu.name')} value={name} onChangeText={setName} maxLength={LIMITS.menuItemNameMax} autoFocus={!item} autoCorrect={false} />
          <Field label={t('menu.price')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
          <Field label={t('menu.description')} value={description} onChangeText={setDescription} maxLength={LIMITS.menuItemDescriptionMax} multiline />
          <Button
            label={t('menu.save')}
            disabled={!name.trim() || cents === null}
            onPress={() =>
              onSave({
                id: item?.id ?? randomUUID(),
                name: name.trim(),
                description: description.trim(),
                priceCents: cents!,
                soldOut: item?.soldOut ?? false,
                sortOrder: item?.sortOrder ?? 999,
                clientUpdatedAt: new Date().toISOString(),
              })
            }
          />
          {item && <Button variant="outline" label={`🗑 ${t('menu.delete')}`} onPress={() => onDelete(item.id)} />}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: space.md,
    minHeight: touch.min + 16,
    borderWidth: 1,
    borderColor: 'rgba(26,20,16,0.12)',
  },
  name: { fontSize: type.body + 1, fontWeight: '800', color: colors.ink },
  price: { fontSize: type.body, color: colors.inkSoft, fontWeight: '700' },
  toggle: { alignItems: 'center', gap: 4 },
  toggleLabel: { fontSize: 13, fontWeight: '800', color: colors.live },
  muted: { fontSize: type.body, color: colors.inkSoft },
  link: { color: colors.chile, fontWeight: '800', fontSize: type.body - 1 },
  sheet: { flex: 1, backgroundColor: colors.paper },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: space.md },
  sheetTitle: { fontSize: type.heading, fontWeight: '900', color: colors.ink },
});
