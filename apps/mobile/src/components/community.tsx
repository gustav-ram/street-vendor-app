import { useState, type ReactNode } from 'react';
import { Image, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  ERROR_CODES,
  type ErrorCode,
  LIMITS,
  type MyReview,
  type PhotoPublic,
  REPORT_REASONS,
  type ReportReason,
  type ReportTarget,
} from '@streeteats/shared';
import { communityApi, uploadFile } from '@/api/community';
import { pickPhoto, readPhoto } from '@/lib/photos';
import { colors, space, touch, type } from '@/theme';
import { Button, Field, Notice } from './ui';

/** Error codes from the API, the upload client or the picker, as translated text. */
export function useErrorText() {
  const { t } = useTranslation('errors');
  return (err: unknown): string => {
    const code = (err as { code?: unknown } | null)?.code;
    const known = typeof code === 'string' && (ERROR_CODES as readonly string[]).includes(code);
    return t(known ? (code as ErrorCode) : code === 'network' ? 'network' : 'internal');
  };
}

/** A page sheet with a title and a close button. */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.sheet} edges={['bottom', 'left', 'right']}>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle} accessibilityRole="header">
            {title}
          </Text>
          <Text style={styles.link} onPress={onClose} accessibilityRole="button">
            {t('actions.close')}
          </Text>
        </View>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

export function StarsInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const { t } = useTranslation('community');
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{t('reviews.rating')}</Text>
      <View style={{ flexDirection: 'row', gap: 4 }} accessibilityRole="radiogroup">
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            accessibilityRole="radio"
            accessibilityState={{ checked: value === n }}
            accessibilityLabel={t('reviews.stars', { count: n })}
            hitSlop={4}
            style={styles.star}
          >
            <Text style={{ fontSize: 40, color: n <= value ? colors.marigold : 'rgba(26,20,16,0.2)' }}>★</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function ReviewSheet({
  vendorId,
  existing,
  visible,
  onClose,
  onSaved,
}: {
  vendorId: string;
  existing: MyReview | null;
  visible: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { t } = useTranslation('community');
  const errorText = useErrorText();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [body, setBody] = useState(existing?.body ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setError(null);
    try {
      onSaved(await fn());
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={existing ? t('reviews.edit') : t('reviews.write')}>
      <StarsInput value={rating} onChange={setRating} />
      <Field
        label={t('reviews.body')}
        hint={t('reviews.nameHint')}
        placeholder={t('reviews.bodyPlaceholder')}
        value={body}
        onChangeText={setBody}
        maxLength={LIMITS.reviewMax}
        multiline
      />
      {error && <Notice tone="error" text={error} />}
      <Button
        label={existing ? t('reviews.update') : t('reviews.post')}
        disabled={busy || !rating}
        onPress={() =>
          void run(async () => {
            const saved = await communityApi.review(vendorId, { rating, body });
            return saved.moderation === 'pending' ? t('reviews.pending') : t('reviews.posted');
          })
        }
      />
      {existing && (
        <Button
          variant="outline"
          label={`🗑 ${t('reviews.delete')}`}
          disabled={busy}
          onPress={() =>
            void run(async () => {
              await communityApi.deleteReview(vendorId);
              return t('reviews.deleted');
            })
          }
        />
      )}
    </Sheet>
  );
}

export function ReportSheet({ target, onClose }: { target: { type: ReportTarget; id: string } | null; onClose: () => void }) {
  const { t } = useTranslation('community');
  const errorText = useErrorText();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const title = target?.type === 'photo' ? t('report.photo') : target?.type === 'review' ? t('report.review') : t('report.vendor');

  const close = () => {
    setReason(null);
    setDetails('');
    setState('idle');
    setError(null);
    onClose();
  };

  return (
    <Sheet visible={target !== null} onClose={close} title={title}>
      {state === 'sent' ? (
        <>
          <Notice text={t('report.sent')} />
          <Button variant="dark" label="OK" onPress={close} />
        </>
      ) : (
        <>
          <Text style={styles.label}>{t('report.title')}</Text>
          <View style={{ gap: 8 }} accessibilityRole="radiogroup">
            {REPORT_REASONS.map((r) => (
              <Pressable
                key={r}
                accessibilityRole="radio"
                accessibilityState={{ checked: reason === r }}
                onPress={() => setReason(r)}
                style={[styles.option, reason === r && styles.optionOn]}
              >
                <Text style={[styles.optionText, reason === r && { color: colors.white }]}>
                  {reason === r ? '● ' : '○ '}
                  {t(`report.reasons.${r}`)}
                </Text>
              </Pressable>
            ))}
          </View>
          <Field label={t('report.details')} value={details} onChangeText={setDetails} maxLength={LIMITS.reportDetailsMax} multiline />
          {error && <Notice tone="error" text={error} />}
          <Button
            label={t('report.send')}
            disabled={!reason || state === 'busy'}
            onPress={async () => {
              if (!target || !reason) return;
              setState('busy');
              setError(null);
              try {
                await communityApi.report({ targetType: target.type, targetId: target.id, reason, details: details.trim() || undefined });
                setState('sent');
              } catch (err) {
                setError(errorText(err));
                setState('idle');
              }
            }}
          />
        </>
      )}
    </Sheet>
  );
}

/** Choose a photo (shrunk on the phone), add a caption, upload it with progress. */
export function AddPhotoSheet({
  visible,
  onClose,
  title,
  hint,
  successText,
  upload,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  hint: string;
  successText: string;
  upload: (uploadId: string, caption: string) => Promise<void>;
}) {
  const { t } = useTranslation('community');
  const errorText = useErrorText();
  const [photo, setPhoto] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [caption, setCaption] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setPhoto(null);
    setCaption('');
    setProgress(null);
    setDone(false);
    setError(null);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={close} title={title}>
      {done ? (
        <>
          <Notice text={successText} />
          <Button variant="dark" label="OK" onPress={close} />
        </>
      ) : (
        <>
          <Notice text={hint} />
          <Text style={styles.muted}>🔒 {t('photos.privacy')}</Text>
          <Button
            variant="outline"
            label={`📷 ${t('photos.choose')}`}
            disabled={progress !== null}
            onPress={async () => {
              setError(null);
              try {
                const picked = await pickPhoto();
                if (picked) setPhoto(picked);
              } catch (err) {
                setError(errorText(err));
              }
            }}
          />
          {photo && (
            <Image source={{ uri: photo.uri }} style={[styles.preview, { aspectRatio: photo.width / Math.max(1, photo.height) }]} resizeMode="contain" />
          )}
          <Field label={t('photos.caption')} value={caption} onChangeText={setCaption} maxLength={LIMITS.photoCaptionMax} />
          {progress !== null && (
            <View style={{ gap: 6 }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
              <View style={styles.track}>
                <View style={[styles.bar, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
              <Text style={styles.muted}>
                {progress < 1 ? t('photos.uploading', { percent: Math.round(progress * 100) }) : t('photos.processing')}
              </Text>
            </View>
          )}
          {error && <Notice tone="error" text={error} />}
          <Button
            label={t('photos.upload')}
            disabled={!photo || progress !== null}
            onPress={async () => {
              if (!photo) return;
              setError(null);
              setProgress(0);
              try {
                const uploadId = await uploadFile(await readPhoto(photo.uri), 'image/jpeg', setProgress);
                await upload(uploadId, caption.trim());
                setDone(true);
              } catch (err) {
                setError(errorText(err));
                setProgress(null);
              }
            }}
          />
        </>
      )}
    </Sheet>
  );
}

/** A row of thumbnails; tapping one opens it full screen, with a report button. */
export function PhotoStrip({ photos, onReport }: { photos: PhotoPublic[]; onReport?: (t: { type: ReportTarget; id: string }) => void }) {
  const { t } = useTranslation('community');
  const { t: tc } = useTranslation();
  const [open, setOpen] = useState<PhotoPublic | null>(null);
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {photos.map((p) => (
          <Pressable key={p.id} onPress={() => setOpen(p)} accessibilityRole="imagebutton" accessibilityLabel={p.caption ?? t('photos.open')}>
            <Image source={{ uri: p.thumbUrl }} style={styles.thumb} />
          </Pressable>
        ))}
      </ScrollView>
      <Modal visible={open !== null} animationType="fade" onRequestClose={() => setOpen(null)}>
        <SafeAreaView style={styles.viewer}>
          {open && (
            <>
              <Image source={{ uri: open.url }} style={{ flex: 1 }} resizeMode="contain" accessibilityLabel={open.caption ?? ''} />
              {open.caption ? <Text style={styles.viewerCaption}>{open.caption}</Text> : null}
              <View style={styles.viewerActions}>
                {onReport && (
                  <Button
                    variant="outline"
                    label={`⚑ ${t('report.photo')}`}
                    onPress={() => {
                      const id = open.id;
                      setOpen(null);
                      onReport({ type: 'photo', id });
                    }}
                    style={{ flex: 1 }}
                  />
                )}
                <Button variant="dark" label={tc('actions.close')} onPress={() => setOpen(null)} style={{ flex: 1, borderWidth: 2, borderColor: colors.white }} />
              </View>
            </>
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.paper },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: space.md, gap: space.md },
  sheetTitle: { flex: 1, fontSize: type.heading, fontWeight: '900', color: colors.ink },
  sheetBody: { padding: space.md, paddingTop: 0, gap: space.md, paddingBottom: space.xl * 2 },
  link: { color: colors.chile, fontWeight: '800', fontSize: type.body - 1 },
  label: { fontSize: type.body, fontWeight: '900', color: colors.ink },
  muted: { fontSize: type.small, color: colors.inkSoft },
  star: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  option: { minHeight: touch.min - 4, borderWidth: 2, borderColor: 'rgba(26,20,16,0.2)', borderRadius: 16, padding: 12, justifyContent: 'center', backgroundColor: colors.white },
  optionOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  optionText: { fontSize: type.body - 1, fontWeight: '700', color: colors.ink },
  preview: { width: '100%', maxHeight: 280, borderRadius: 16, backgroundColor: colors.sand },
  track: { height: 12, borderRadius: 999, backgroundColor: colors.sand, overflow: 'hidden' },
  bar: { height: '100%', backgroundColor: colors.live },
  thumb: { width: 112, height: 112, borderRadius: 16, backgroundColor: colors.sand },
  viewer: { flex: 1, backgroundColor: colors.ink, padding: space.md, gap: space.md },
  viewerCaption: { color: colors.white, fontSize: type.body, fontWeight: '700', textAlign: 'center' },
  viewerActions: { flexDirection: 'row', gap: space.sm },
});
