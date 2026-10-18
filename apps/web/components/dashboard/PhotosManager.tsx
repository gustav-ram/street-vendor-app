"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { type MyPhoto, type ReportTarget, uploadTypeOf, type VendorPhotoKind } from "@streeteats/shared";
import { ApiRequestError } from "@/lib/api";
import { communityApi, vendorApi } from "@/lib/auth";
import { AddPhotoDialog, ReportDialog, useErrorText } from "../community/dialogs";
import { buttonClass, Notice, Panel } from "../ui";

const KEY = ["myPhotos"] as const;
const small = "inline-flex min-h-11 items-center justify-center rounded-full border-2 border-ink bg-white px-3 text-sm font-bold hover:bg-sand disabled:opacity-50";

/** Hidden customer photos aren't public, so the vendor sees them through an authenticated fetch. */
function PrivateImg({ photo, className }: { photo: MyPhoto; className: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    void vendorApi.photos
      .privateUrl(photo.id)
      .then((u) => {
        if (cancelled) URL.revokeObjectURL(u);
        else setSrc((url = u));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo.id]);
  // eslint-disable-next-line @next/next/no-img-element -- a blob URL
  return src ? <img src={src} alt={photo.caption ?? ""} className={className} /> : <div className={`${className} animate-pulse bg-sand`} />;
}

function Thumb({ photo, wide = false }: { photo: MyPhoto; wide?: boolean }) {
  const cls = `${wide ? "aspect-[3/1]" : "aspect-square"} w-full rounded-2xl bg-sand object-cover ${photo.hidden ? "opacity-50" : ""}`;
  if (photo.hidden) return <PrivateImg photo={photo} className={cls} />;
  // eslint-disable-next-line @next/next/no-img-element -- served by our API, already resized
  return <img src={wide ? photo.url : photo.thumbUrl} alt={photo.caption ?? ""} className={cls} loading="lazy" />;
}

export function PhotosManager() {
  const { t } = useTranslation("dashboard");
  const { t: tm } = useTranslation("community");
  const { t: tc } = useTranslation();
  const errorText = useErrorText();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: vendorApi.photos.list });
  const [adding, setAdding] = useState<VendorPhotoKind | null>(null);
  const [reporting, setReporting] = useState<{ type: ReportTarget; id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());

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

  if (query.isPending) return <p className="text-ink-soft">{tc("status.loading")}</p>;
  if (query.isError) return <Notice tone="error">{errorText(query.error)}</Notice>;
  const p = query.data;
  const titles: Record<VendorPhotoKind, string> = { profile: t("photos.profile"), cover: t("photos.cover"), gallery: t("photos.gallery") };

  return (
    <div className="flex flex-col gap-6">
      <Notice tone="warn">{t("photos.warning")}</Notice>
      {error && <Notice tone="error">{error}</Notice>}

      <div className="grid gap-6 sm:grid-cols-[1fr_2fr]">
        <Panel title={t("photos.profile")}>
          {p.profile ? <Thumb photo={p.profile} /> : <p className="text-ink-soft">{t("photos.empty")}</p>}
          <button type="button" className={buttonClass.outline} onClick={() => setAdding("profile")}>
            {p.profile ? t("photos.replace") : t("photos.add")}
          </button>
        </Panel>
        <Panel title={t("photos.cover")}>
          {p.cover ? <Thumb photo={p.cover} wide /> : <p className="text-ink-soft">{t("photos.empty")}</p>}
          <button type="button" className={buttonClass.outline} onClick={() => setAdding("cover")}>
            {p.cover ? t("photos.replace") : t("photos.add")}
          </button>
        </Panel>
      </div>

      <Panel title={t("photos.gallery")}>
        {p.gallery.length === 0 && <p className="text-ink-soft">{t("photos.empty")}</p>}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {p.gallery.map((photo) => (
            <li key={photo.id} className="flex flex-col gap-2">
              <Thumb photo={photo} />
              {photo.caption && <span className="text-sm font-semibold break-words">{photo.caption}</span>}
              <button
                type="button"
                className={small}
                onClick={() => window.confirm(t("photos.confirmDelete")) && void run(() => vendorApi.photos.remove(photo.id))}
              >
                🗑 {t("photos.delete")}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className={buttonClass.primary} onClick={() => setAdding("gallery")}>
          {t("photos.add")}
        </button>
      </Panel>

      <Panel title={t("photos.customer")}>
        {p.customer.length === 0 && <p className="text-ink-soft">{t("photos.customerEmpty")}</p>}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {p.customer.map((photo) => (
            <li key={photo.id} className="flex flex-col gap-2">
              <div className="relative">
                <Thumb photo={photo} />
                {photo.hidden && (
                  <span className="absolute top-2 left-2 rounded-full bg-ink px-2 py-0.5 text-xs font-bold text-white">{t("photos.hidden")}</span>
                )}
              </div>
              {photo.caption && <span className="text-sm break-words">{photo.caption}</span>}
              <button type="button" className={small} onClick={() => void run(() => vendorApi.photos.hide(photo.id, !photo.hidden))}>
                {photo.hidden ? t("photos.unhide") : t("photos.hide")}
              </button>
              <button type="button" className={small} onClick={() => setReporting({ type: "photo", id: photo.id })}>
                ⚑ {tm("report.action")}
              </button>
              <button
                type="button"
                className={small}
                disabled={blocked.has(photo.id)}
                onClick={() =>
                  window.confirm(t("reviews.blockHint")) &&
                  void run(async () => {
                    await vendorApi.blocks.add({ photoId: photo.id });
                    setBlocked((s) => new Set(s).add(photo.id));
                  })
                }
              >
                {blocked.has(photo.id) ? t("reviews.blocked") : `🚫 ${t("reviews.block")}`}
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <AddPhotoDialog
        open={adding !== null}
        onClose={() => setAdding(null)}
        title={adding ? titles[adding] : ""}
        hint={t("photos.warning")}
        successMessage={t("photos.added")}
        upload={async (file, caption, onProgress) => {
          const type = uploadTypeOf(file.type);
          if (!type || !adding) throw new ApiRequestError("unsupported_media", 415);
          const uploadId = await communityApi.upload(file, type, onProgress);
          await vendorApi.photos.add(uploadId, adding, caption || undefined);
          refresh();
        }}
      />
      <ReportDialog target={reporting} onClose={() => setReporting(null)} />
    </div>
  );
}
