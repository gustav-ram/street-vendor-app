"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ERROR_CODES, type ErrorCode, LIMITS, type MyReview, REPORT_REASONS, type ReportReason, type ReportTarget, uploadTypeOf } from "@streeteats/shared";
import { ApiRequestError } from "@/lib/api";
import { communityApi } from "@/lib/auth";
import { Dialog } from "../Dialog";
import { buttonClass, Field, Notice, TextArea } from "../ui";

/** Error codes (from the API, the upload client or the file checks below) as translated text. */
export function useErrorText() {
  const { t } = useTranslation("errors");
  return (err: unknown): string => {
    const code = (err as { code?: unknown } | null)?.code;
    const known = typeof code === "string" && (ERROR_CODES as readonly string[]).includes(code);
    return t(known ? (code as ErrorCode) : code === "network" ? "network" : "internal");
  };
}

/** Five big tappable stars (a radio group, so it works with a keyboard too). */
export function StarsInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const { t } = useTranslation("community");
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-lg font-extrabold">{t("reviews.rating")}</legend>
      <div role="radiogroup" className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer">
            <input type="radio" name="rating" value={n} checked={value === n} onChange={() => onChange(n)} className="peer sr-only" />
            <span
              aria-hidden
              className={`grid size-12 place-items-center rounded-full text-4xl peer-focus-visible:outline-3 peer-focus-visible:outline-marigold ${n <= value ? "text-marigold" : "text-ink/20"}`}
            >
              ★
            </span>
            <span className="sr-only">{t("reviews.stars", { count: n })}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ReviewDialog({
  vendorId,
  existing,
  open,
  onClose,
  onSaved,
}: {
  vendorId: string;
  existing: MyReview | null;
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { t } = useTranslation("community");
  const errorText = useErrorText();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [body, setBody] = useState(existing?.body ?? "");
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
    <Dialog open={open} onClose={onClose} title={existing ? t("reviews.edit") : t("reviews.write")}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!rating) return;
          void run(async () => {
            const saved = await communityApi.review(vendorId, { rating, body });
            return saved.moderation === "pending" ? t("reviews.pending") : t("reviews.posted");
          });
        }}
      >
        <StarsInput value={rating} onChange={setRating} />
        <TextArea
          label={t("reviews.body")}
          placeholder={t("reviews.bodyPlaceholder")}
          value={body}
          maxLength={LIMITS.reviewMax}
          onChange={(e) => setBody(e.target.value)}
          hint={t("reviews.nameHint")}
        />
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={buttonClass.primary} disabled={busy || !rating}>
            {existing ? t("reviews.update") : t("reviews.post")}
          </button>
          {existing && (
            <button
              type="button"
              className={`${buttonClass.outline} ml-auto`}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await communityApi.deleteReview(vendorId);
                  return t("reviews.deleted");
                })
              }
            >
              🗑 {t("reviews.delete")}
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}

export function ReportDialog({ target, onClose }: { target: { type: ReportTarget; id: string } | null; onClose: () => void }) {
  const { t } = useTranslation("community");
  const errorText = useErrorText();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const title = target?.type === "photo" ? t("report.photo") : target?.type === "review" ? t("report.review") : t("report.vendor");

  const close = () => {
    setReason(null);
    setDetails("");
    setState("idle");
    setError(null);
    onClose();
  };

  return (
    <Dialog open={target !== null} onClose={close} title={title}>
      {state === "sent" ? (
        <>
          <Notice>{t("report.sent")}</Notice>
          <button type="button" className={buttonClass.dark} onClick={close}>
            OK
          </button>
        </>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!target || !reason) return;
            setState("busy");
            setError(null);
            try {
              await communityApi.report({ targetType: target.type, targetId: target.id, reason, details: details.trim() || undefined });
              setState("sent");
            } catch (err) {
              setError(errorText(err));
              setState("idle");
            }
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-lg font-extrabold">{t("report.title")}</legend>
            {REPORT_REASONS.map((r) => (
              <label key={r} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 ${reason === r ? "border-ink bg-white" : "border-ink/15 bg-white"}`}>
                <input type="radio" name="reason" className="size-5" checked={reason === r} onChange={() => setReason(r)} />
                <span className="text-lg">{t(`report.reasons.${r}`)}</span>
              </label>
            ))}
          </fieldset>
          <TextArea label={t("report.details")} value={details} maxLength={LIMITS.reportDetailsMax} onChange={(e) => setDetails(e.target.value)} />
          {error && <Notice tone="error">{error}</Notice>}
          <button type="submit" className={buttonClass.primary} disabled={!reason || state === "busy"}>
            {t("report.send")}
          </button>
        </form>
      )}
    </Dialog>
  );
}

/** Pick a photo, add an optional caption, and upload it with a progress bar. */
export function AddPhotoDialog({
  open,
  onClose,
  title,
  hint,
  upload,
  successMessage,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  hint: string;
  /** Uploads the file and creates the photo. */
  upload: (file: File, caption: string, onProgress: (f: number) => void) => Promise<void>;
  successMessage: string;
}) {
  const { t } = useTranslation("community");
  const errorText = useErrorText();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setCaption("");
    setProgress(null);
    setDone(false);
    setError(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} title={title}>
      {done ? (
        <>
          <Notice>{successMessage}</Notice>
          <button type="button" className={buttonClass.dark} onClick={close}>
            OK
          </button>
        </>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!file) return;
            setError(null);
            setProgress(0);
            try {
              await upload(file, caption.trim(), setProgress);
              setDone(true);
            } catch (err) {
              setError(errorText(err));
              setProgress(null);
            }
          }}
        >
          <Notice>{hint}</Notice>
          <p className="text-ink-soft">🔒 {t("photos.privacy")}</p>
          <label className={`${buttonClass.outline} cursor-pointer`}>
            📷 {t("photos.choose")}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (preview) URL.revokeObjectURL(preview);
                setError(null);
                if (f && !uploadTypeOf(f.type)) {
                  setFile(null);
                  setPreview(null);
                  setError(errorText({ code: "unsupported_media" }));
                  return;
                }
                if (f && f.size > LIMITS.photoMaxBytes) {
                  setFile(null);
                  setPreview(null);
                  setError(errorText({ code: "payload_too_large" }));
                  return;
                }
                setFile(f);
                setPreview(f ? URL.createObjectURL(f) : null);
              }}
            />
          </label>
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file */}
          {preview && <img src={preview} alt="" className="max-h-64 w-full rounded-2xl object-contain" />}
          <Field label={t("photos.caption")} value={caption} maxLength={LIMITS.photoCaptionMax} onChange={(e) => setCaption(e.target.value)} />
          {progress !== null && (
            <div className="flex flex-col gap-1" role="status">
              <div className="h-3 overflow-hidden rounded-full bg-sand">
                <div className="h-full bg-live transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <span className="text-ink-soft">
                {progress < 1 ? t("photos.uploading", { percent: Math.round(progress * 100) }) : t("photos.processing")}
              </span>
            </div>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          <button type="submit" className={buttonClass.primary} disabled={!file || progress !== null}>
            {t("photos.upload")}
          </button>
        </form>
      )}
    </Dialog>
  );
}

/** Uploads a customer photo for a vendor (it waits for a moderator). */
export async function uploadCustomerPhoto(vendorId: string, file: File, caption: string, onProgress: (f: number) => void) {
  const type = uploadTypeOf(file.type);
  if (!type) throw new ApiRequestError("unsupported_media", 415);
  const uploadId = await communityApi.upload(file, type, onProgress);
  await communityApi.addPhoto(vendorId, uploadId, caption || undefined);
}
