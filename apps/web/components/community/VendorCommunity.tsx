"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PhotoPublic, ReportTarget, VendorProfile } from "@streeteats/shared";
import { communityApi, useAuth } from "@/lib/auth";
import { Dialog } from "../Dialog";
import { buttonClass, Notice } from "../ui";
import { AddPhotoDialog, ReportDialog, ReviewDialog, uploadCustomerPhoto, useErrorText } from "./dialogs";

const pill = "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border-2 px-4 font-bold disabled:opacity-50";
const smallButton = `${pill} border-ink bg-white hover:bg-sand`;
const savedButton = `${pill} border-chile bg-chile text-white hover:bg-chile-dark`;

/** Rounds to ~10 m: plenty for "are you near the cart?", and nothing more precise leaves the phone. */
const roundForCheck = (n: number) => Math.round(n * 10_000) / 10_000;

function currentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("location_denied"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: roundForCheck(p.coords.latitude), lng: roundForCheck(p.coords.longitude) }),
      () => reject(new Error("location_denied")),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  });
}

/** Save, "Still here?", review, photo and report, for whoever is looking at the page. */
export function CommunityActions({ v, lang, onReport }: { v: VendorProfile; lang: string; onReport: (t: { type: ReportTarget; id: string }) => void }) {
  const { t } = useTranslation("community");
  const errorText = useErrorText();
  const qc = useQueryClient();
  const { status, me } = useAuth();
  const signedIn = status === "signedIn" && me !== null;
  const viewer = useQuery({ queryKey: ["viewer", v.id], queryFn: () => communityApi.viewer(v.id), enabled: signedIn });
  const [reviewOpen, setReviewOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  const [checking, setChecking] = useState(false);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["viewer", v.id] });
    void qc.invalidateQueries({ queryKey: ["vendor", v.id] });
    void qc.invalidateQueries({ queryKey: ["favorites"] });
  };

  if (status === "loading") return null;
  if (!signedIn) {
    return (
      <div className="flex flex-wrap gap-2">
        <Link href={`/${lang}/login`} className={smallButton}>
          ♡ {t("favorite.signIn")}
        </Link>
        <Link href={`/${lang}/login`} className={smallButton}>
          ★ {t("reviews.signIn")}
        </Link>
      </div>
    );
  }

  const state = viewer.data;
  const isCustomer = me.role === "customer";
  const owner = state?.isOwner ?? false;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={state?.favorite ?? false}
          aria-label={state?.favorite ? t("favorite.removeLabel") : t("favorite.addLabel")}
          disabled={!state}
          className={state?.favorite ? savedButton : smallButton}
          onClick={async () => {
            setMessage(null);
            try {
              if (state?.favorite) await communityApi.unfavorite(v.id);
              else await communityApi.favorite(v.id, false);
              refresh();
            } catch (err) {
              setMessage({ text: errorText(err), tone: "error" });
            }
          }}
        >
          {state?.favorite ? `♥ ${t("favorite.saved")}` : `♡ ${t("favorite.add")}`}
        </button>
        {isCustomer && !owner && (
          <>
            <button type="button" className={smallButton} disabled={!state} onClick={() => setReviewOpen(true)}>
              ★ {state?.review ? t("reviews.edit") : t("reviews.write")}
            </button>
            <button type="button" className={smallButton} onClick={() => setPhotoOpen(true)}>
              📷 {t("photos.add")}
            </button>
          </>
        )}
        {!owner && (
          <button type="button" className={`${pill} border-ink/25 bg-white hover:bg-sand`} onClick={() => onReport({ type: "vendor", id: v.id })}>
            ⚑ {t("report.action")}
          </button>
        )}
      </div>

      {state?.favorite && (
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-white p-4">
          <input
            type="checkbox"
            className="mt-1 size-5"
            checked={state.notifyOnOpen}
            onChange={async (e) => {
              await communityApi.favorite(v.id, e.target.checked).catch(() => {});
              refresh();
            }}
          />
          <span className="flex flex-col">
            <span className="font-bold">🔔 {t("favorite.notify")}</span>
            <span className="text-sm text-ink-soft">{t("favorite.notifyHint")}</span>
          </span>
        </label>
      )}

      {v.live && isCustomer && !owner && (
        <div className="flex flex-col gap-2 rounded-2xl border-2 border-live/40 bg-white p-4">
          <p className="text-lg font-extrabold">{t("stillHere.question")}</p>
          {state?.confirmedRecently ? (
            <p className="font-bold text-live">✓ {t("stillHere.already")}</p>
          ) : (
            <button
              type="button"
              className="inline-flex min-h-14 items-center justify-center rounded-full bg-live px-6 text-lg font-black text-white hover:bg-live/90 disabled:opacity-50"
              disabled={checking || !state}
              onClick={async () => {
                setChecking(true);
                setMessage(null);
                try {
                  const result = await communityApi.stillHere(v.id, await currentPosition());
                  setMessage({ text: result.status === "confirmed" ? t("stillHere.thanks") : t("stillHere.already"), tone: "info" });
                  refresh();
                } catch (err) {
                  const denied = err instanceof Error && err.message === "location_denied";
                  setMessage({ text: denied ? t("stillHere.needLocation") : errorText(err), tone: "error" });
                } finally {
                  setChecking(false);
                }
              }}
            >
              {checking ? t("stillHere.checking") : `✓ ${t("stillHere.yes")}`}
            </button>
          )}
          <p className="text-sm text-ink-soft">{t("stillHere.locationNote")}</p>
        </div>
      )}

      {state?.review?.moderation === "pending" && <Notice>{t("reviews.pending")}</Notice>}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {state && (
        <ReviewDialog
          key={state.review?.updatedAt ?? "new"}
          vendorId={v.id}
          existing={state.review}
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          onSaved={(text) => {
            setReviewOpen(false);
            setMessage({ text, tone: "info" });
            refresh();
          }}
        />
      )}
      <AddPhotoDialog
        open={photoOpen}
        onClose={() => setPhotoOpen(false)}
        title={t("photos.add")}
        hint={t("photos.addHint")}
        successMessage={t("photos.pending")}
        upload={(file, caption, onProgress) => uploadCustomerPhoto(v.id, file, caption, onProgress)}
      />
    </div>
  );
}

/** Thumbnails that open a larger view, with a report button for signed-in people. */
export function PhotoGrid({ photos, onReport }: { photos: PhotoPublic[]; onReport?: (t: { type: ReportTarget; id: string }) => void }) {
  const { t } = useTranslation("community");
  const { status } = useAuth();
  const [open, setOpen] = useState<PhotoPublic | null>(null);
  return (
    <>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => setOpen(p)} className="block w-full overflow-hidden rounded-2xl bg-sand" aria-label={p.caption ?? t("photos.open")}>
              {/* eslint-disable-next-line @next/next/no-img-element -- served by our API, already resized */}
              <img src={p.thumbUrl} alt={p.caption ?? ""} loading="lazy" className="aspect-square w-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={open !== null} onClose={() => setOpen(null)} title={open?.caption ?? t("photos.title")} wide>
        {open && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- served by our API, already resized */}
            <img src={open.url} alt={open.caption ?? ""} width={open.width} height={open.height} className="max-h-[70vh] w-full rounded-2xl object-contain" />
            {onReport && status === "signedIn" && (
              <button
                type="button"
                className={`${buttonClass.outline} w-fit`}
                onClick={() => {
                  const id = open.id;
                  setOpen(null);
                  onReport({ type: "photo", id });
                }}
              >
                ⚑ {t("report.photo")}
              </button>
            )}
          </>
        )}
      </Dialog>
    </>
  );
}

export { ReportDialog };
