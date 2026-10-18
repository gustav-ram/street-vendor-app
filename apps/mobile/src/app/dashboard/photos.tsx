import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { MyPhoto, OutboxItem, ReportTarget, VendorPhotoKind } from '@streeteats/shared';
import { vendorApi } from '@/api/vendor';
import { mediaHeaders } from '@/auth/session';
import { AddPhotoSheet, ReportSheet, useErrorText } from '@/components/community';
import { PendingChip } from '@/components/sync';
import { Button, Notice } from '@/components/ui';
import { API_URL } from '@/config';
import { queuePhoto, useOutboxItems } from '@/offline/outbox';
import { colors, space, type } from '@/theme';

const KEY = ['myPhotos'] as const;

/** Hidden customer photos aren't public, so they load with the vendor's session. */
function Thumb({ photo, wide = false, size }: { photo: MyPhoto; wide?: boolean; size?: number }) {
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    if (photo.hidden) void mediaHeaders().then(setHeaders);
  }, [photo.hidden]);
  const style = [wide ? styles.cover : styles.thumb, size ? { width: size, height: size, minWidth: 0 } : null, photo.hidden && { opacity: 0.5 }];
  if (!photo.hidden) return <Image source={{ uri: wide ? photo.url : photo.thumbUrl }} style={style} />;
  if (!headers) return <View style={style} />;
  return <Image source={{ uri: `${API_URL}/v1/photos/${photo.id}/image?size=thumb`, headers }} style={style} />;
}

export default function PhotosScreen() {
  const { t } = useTranslation('dashboard');
  const { t: tm } = useTranslation('community');
  const { t: tc } = useTranslation();
  const errorText = useErrorText();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: vendorApi.photos.list });
  const [adding, setAdding] = useState<VendorPhotoKind | null>(null);
  const [reporting, setReporting] = useState<{ type: ReportTarget; id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Photos waiting in the outbox (no signal yet, or still uploading).
  const queued = useOutboxItems().filter((i): i is OutboxItem & { action: { type: 'photo.add' } } => i.action.type === 'photo.add' && i.state === 'pending');
  const queuedOf = (kind: VendorPhotoKind) => queued.filter((i) => i.action.payload.kind === kind);

  const refresh = () => void qc.invalidateQueries({ queryKey: KEY });
  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      refresh();
    }
  }
  const confirm = (message: string, action: () => void) =>
    Alert.alert(message, undefined, [
      { text: tc('actions.cancel'), style: 'cancel' },
      { text: tc('actions.continue'), style: 'destructive', onPress: action },
    ]);

  const p = query.data;
  const titles: Record<VendorPhotoKind, string> = { profile: t('photos.profile'), cover: t('photos.cover'), gallery: t('photos.gallery') };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <Notice tone="warn" text={t('photos.warning')} />
      {error && <Notice tone="error" text={error} />}
      {query.isError && <Notice tone="error" text={errorText(query.error)} />}
      {!p ? (
        <Text style={styles.muted}>{tc('status.loading')}</Text>
      ) : (
        <>
          <Text style={styles.heading}>{t('photos.profile')}</Text>
          <View style={styles.inline}>
            {p.profile ? <Thumb photo={p.profile} size={112} /> : <Text style={styles.muted}>{t('photos.empty')}</Text>}
            <Button variant="outline" label={p.profile ? t('photos.replace') : t('photos.add')} onPress={() => setAdding('profile')} style={{ flex: 1 }} />
          </View>

          <Text style={styles.heading}>{t('photos.cover')}</Text>
          {p.cover ? <Thumb photo={p.cover} wide /> : <Text style={styles.muted}>{t('photos.empty')}</Text>}
          <Button variant="outline" label={p.cover ? t('photos.replace') : t('photos.add')} onPress={() => setAdding('cover')} />

          <Text style={styles.heading}>{t('photos.gallery')}</Text>
          {p.gallery.length === 0 && <Text style={styles.muted}>{t('photos.empty')}</Text>}
          <View style={styles.grid}>
            {p.gallery.map((photo) => (
              <View key={photo.id} style={styles.cell}>
                <Thumb photo={photo} />
                {photo.caption ? <Text style={styles.caption}>{photo.caption}</Text> : null}
                <Button
                  variant="outline"
                  label={`🗑 ${t('photos.delete')}`}
                  onPress={() => confirm(t('photos.confirmDelete'), () => void run(() => vendorApi.photos.remove(photo.id)))}
                  style={styles.small}
                />
              </View>
            ))}
          </View>
          {queuedOf('gallery').length + queuedOf('profile').length + queuedOf('cover').length > 0 && (
            <View style={styles.grid}>
              {queued.map((i) => (
                <View key={i.id} style={styles.cell}>
                  <Image source={{ uri: i.action.payload.fileUri }} style={[styles.thumb, { opacity: 0.7 }]} />
                  <Text style={styles.caption}>{titles[i.action.payload.kind]}</Text>
                  <PendingChip />
                </View>
              ))}
            </View>
          )}
          <Button label={t('photos.add')} onPress={() => setAdding('gallery')} />

          <Text style={styles.heading}>{t('photos.customer')}</Text>
          {p.customer.length === 0 && <Text style={styles.muted}>{t('photos.customerEmpty')}</Text>}
          <View style={styles.grid}>
            {p.customer.map((photo) => (
              <View key={photo.id} style={styles.cell}>
                <Thumb photo={photo} />
                {photo.hidden && <Text style={styles.badge}>{t('photos.hidden')}</Text>}
                {photo.caption ? <Text style={styles.caption}>{photo.caption}</Text> : null}
                <Button
                  variant="outline"
                  label={photo.hidden ? t('photos.unhide') : t('photos.hide')}
                  onPress={() => void run(() => vendorApi.photos.hide(photo.id, !photo.hidden))}
                  style={styles.small}
                />
                <Button variant="outline" label={`⚑ ${tm('report.action')}`} onPress={() => setReporting({ type: 'photo', id: photo.id })} style={styles.small} />
                <Button
                  variant="outline"
                  label={`🚫 ${t('reviews.block')}`}
                  onPress={() => confirm(t('reviews.blockHint'), () => void run(() => vendorApi.blocks.add({ photoId: photo.id })))}
                  style={styles.small}
                />
              </View>
            ))}
          </View>
        </>
      )}

      <AddPhotoSheet
        visible={adding !== null}
        onClose={() => setAdding(null)}
        title={adding ? titles[adding] : ''}
        hint={t('photos.warning')}
        successText={t('photos.added')}
        // Through the offline outbox: saved on the phone first, uploaded when there's signal.
        queue={async (uri, caption) => {
          if (adding) await queuePhoto(uri, adding, caption || undefined);
        }}
      />
      <ReportSheet target={reporting} onClose={() => setReporting(null)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.md, gap: space.md, paddingBottom: space.xl * 3 },
  heading: { fontSize: type.heading - 2, fontWeight: '900', color: colors.ink, marginTop: space.sm },
  muted: { fontSize: type.small, color: colors.inkSoft },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  cell: { width: '47%', gap: 6 },
  thumb: { width: '100%', aspectRatio: 1, minWidth: 96, borderRadius: 16, backgroundColor: colors.sand },
  cover: { width: '100%', aspectRatio: 3, borderRadius: 16, backgroundColor: colors.sand },
  caption: { fontSize: type.small, color: colors.ink, fontWeight: '600' },
  badge: { alignSelf: 'flex-start', backgroundColor: colors.ink, color: colors.white, fontWeight: '800', fontSize: 13, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  small: { minHeight: 44 },
});
