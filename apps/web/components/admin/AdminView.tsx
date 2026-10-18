"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AdminReport } from "@streeteats/shared";
import { adminApi, useAuth } from "@/lib/auth";
import { useFormat } from "@/lib/hooks/useFormat";
import { useErrorText } from "../community/dialogs";
import { buttonClass, Field, Notice, Panel } from "../ui";

const small = "inline-flex min-h-11 items-center justify-center rounded-full border-2 px-4 font-bold disabled:opacity-50";
const approveClass = `${small} border-live bg-live text-white`;
const rejectClass = `${small} border-chile bg-white text-chile`;

/** Photos waiting for review aren't public: load them with the moderator's session. */
function PendingImg({ photoId }: { photoId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    void adminApi
      .photoUrl(photoId, "full")
      .then((u) => {
        if (cancelled) URL.revokeObjectURL(u);
        else setSrc((url = u));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photoId]);
  // eslint-disable-next-line @next/next/no-img-element -- a blob URL
  return src ? <img src={src} alt="" className="max-h-72 w-full rounded-2xl bg-sand object-contain" /> : <div className="h-48 animate-pulse rounded-2xl bg-sand" />;
}

function ReportCard({ r, lang, onDone, onError }: { r: AdminReport; lang: string; onDone: () => void; onError: (e: unknown) => void }) {
  const { t } = useTranslation("admin");
  const { t: tm } = useTranslation("community");
  const f = useFormat();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const decide = async (status: "dismissed" | "upheld" | "resolved") => {
    setBusy(true);
    try {
      await adminApi.decideReport(r.id, status, note.trim() || undefined);
      onDone();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="flex flex-col gap-3 rounded-3xl border-2 border-ink/10 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-ink px-3 py-1 text-sm font-bold text-white">{t(`targets.${r.targetType}`)}</span>
        <span className="font-bold">{t("reason", { reason: tm(`report.reasons.${r.reason}`) })}</span>
        <span className="text-sm text-ink-soft">{f.dayTime(r.createdAt)}</span>
      </div>
      {r.details && <p className="rounded-xl bg-paper p-3">“{r.details}”</p>}
      {r.target ? (
        <div className="flex flex-col gap-2">
          {r.target.vendorName && <p className="font-bold">{t("for", { vendor: r.target.vendorName })}</p>}
          {r.target.photoId && <PendingImg photoId={r.target.photoId} />}
          {r.target.text && <p className="text-lg">{r.target.text}</p>}
          {r.target.vendorId && (
            <Link href={`/${lang}/v/${r.target.vendorId}`} className="w-fit font-bold text-chile hover:underline" target="_blank">
              {t("openVendor")} ↗
            </Link>
          )}
        </div>
      ) : (
        <p className="text-ink-soft">{t("targetGone")}</p>
      )}
      <Field label={t("note")} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={rejectClass} disabled={busy} onClick={() => void decide("upheld")}>
          {t("uphold")}
        </button>
        <button type="button" className={`${small} border-ink bg-white`} disabled={busy} onClick={() => void decide("resolved")}>
          {t("resolve")}
        </button>
        <button type="button" className={`${small} border-ink/30 bg-white`} disabled={busy} onClick={() => void decide("dismissed")}>
          {t("dismiss")}
        </button>
      </div>
    </li>
  );
}

export function AdminView({ lang }: { lang: string }) {
  const { t } = useTranslation("admin");
  const { t: tc } = useTranslation();
  const { t: ta } = useTranslation("auth");
  const { t: tv } = useTranslation("vendor");
  const errorText = useErrorText();
  const qc = useQueryClient();
  const { status, me } = useAuth();
  const isAdmin = status === "signedIn" && me?.role === "admin";
  const queue = useQuery({ queryKey: ["admin", "queue"], queryFn: adminApi.queue, enabled: isAdmin });
  const reports = useQuery({ queryKey: ["admin", "reports"], queryFn: () => adminApi.reports("open"), enabled: isAdmin });
  const [error, setError] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin"] });
  const onError = (err: unknown) => setError(errorText(err));

  const decide = (kind: "photo" | "review", id: string, decision: "approved" | "rejected") =>
    adminApi.decide(kind, id, decision).then(refresh, onError);

  if (status === "loading") return <main className="mx-auto max-w-4xl p-6 text-ink-soft">{tc("status.loading")}</main>;
  if (!isAdmin) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-10">
        <Notice tone="warn">{t("adminsOnly")}</Notice>
        {status === "signedOut" && (
          <Link href={`/${lang}/login`} className={buttonClass.primary}>
            {ta("signIn")}
          </Link>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <h1 className="text-4xl font-black">{t("title")}</h1>
      {error && <Notice tone="error">{error}</Notice>}

      <Panel title={`📷 ${t("photos")} (${queue.data?.photos.length ?? "…"})`}>
        {queue.data?.photos.length === 0 && <p className="text-ink-soft">{t("empty")}</p>}
        <ul className="grid gap-4 sm:grid-cols-2">
          {queue.data?.photos.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 rounded-3xl border-2 border-ink/10 bg-white p-4">
              <PendingImg photoId={p.id} />
              <p className="font-bold">{t("for", { vendor: p.vendorName })}</p>
              {p.caption && <p>“{p.caption}”</p>}
              <div className="flex gap-2">
                <button type="button" className={approveClass} onClick={() => void decide("photo", p.id, "approved")}>
                  ✓ {t("approve")}
                </button>
                <button type="button" className={rejectClass} onClick={() => void decide("photo", p.id, "rejected")}>
                  ✕ {t("reject")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title={`★ ${t("reviews")} (${queue.data?.reviews.length ?? "…"})`}>
        {queue.data?.reviews.length === 0 && <p className="text-ink-soft">{t("empty")}</p>}
        <ul className="flex flex-col gap-3">
          {queue.data?.reviews.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 rounded-3xl border-2 border-ink/10 bg-white p-4">
              <p className="font-bold">
                <span className="text-marigold">{"★".repeat(r.rating)}</span> {r.authorName ?? tv("anonymous")} · {t("for", { vendor: r.vendorName })}
              </p>
              <p className="text-lg">{r.body}</p>
              <div className="flex gap-2">
                <button type="button" className={approveClass} onClick={() => void decide("review", r.id, "approved")}>
                  ✓ {t("approve")}
                </button>
                <button type="button" className={rejectClass} onClick={() => void decide("review", r.id, "rejected")}>
                  ✕ {t("reject")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title={`⚑ ${t("reports")} (${reports.data?.reports.length ?? "…"})`}>
        {reports.data?.reports.length === 0 && <p className="text-ink-soft">{t("empty")}</p>}
        <ul className="flex flex-col gap-3">
          {reports.data?.reports.map((r) => (
            <ReportCard key={r.id} r={r} lang={lang} onDone={refresh} onError={onError} />
          ))}
        </ul>
      </Panel>
    </main>
  );
}
