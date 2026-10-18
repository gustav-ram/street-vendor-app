"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LIMITS, type ReportTarget, type VendorReview } from "@streeteats/shared";
import { vendorApi } from "@/lib/auth";
import { useFormat } from "@/lib/hooks/useFormat";
import { ReportDialog, useErrorText } from "../community/dialogs";
import { buttonClass, Notice, Panel, TextArea } from "../ui";

const small = "inline-flex min-h-11 items-center justify-center rounded-full border-2 border-ink bg-white px-4 font-bold hover:bg-sand disabled:opacity-50";

function ReviewCard({
  r,
  onChanged,
  onReport,
  onError,
}: {
  r: VendorReview;
  onChanged: () => void;
  onReport: () => void;
  onError: (err: unknown) => void;
}) {
  const { t } = useTranslation("dashboard");
  const { t: tv } = useTranslation("vendor");
  const { t: tm } = useTranslation("community");
  const f = useFormat();
  const [editing, setEditing] = useState(false);
  const [reply, setReply] = useState(r.vendorReply ?? "");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      setEditing(false);
      onChanged();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-3xl border-2 border-ink/10 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span aria-label={`${r.rating}/5`} className="text-xl text-marigold">
          {"★".repeat(r.rating)}
          <span className="text-ink/20">{"★".repeat(5 - r.rating)}</span>
        </span>
        <span className="font-bold">{r.authorName ?? tv("anonymous")}</span>
        <span className="text-sm text-ink-soft">{new Intl.DateTimeFormat(f.locale, { dateStyle: "medium" }).format(new Date(r.createdAt))}</span>
        {r.authorBlocked && <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-bold text-white">{t("reviews.blocked")}</span>}
      </div>
      {r.body && <p className="text-lg">{r.body}</p>}

      {editing ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (reply.trim()) void run(() => vendorApi.reviews.reply(r.id, reply.trim()));
          }}
        >
          <TextArea label={t("reviews.reply")} placeholder={t("reviews.replyPlaceholder")} value={reply} maxLength={LIMITS.reviewReplyMax} onChange={(e) => setReply(e.target.value)} />
          <div className="flex gap-2">
            <button type="submit" className={buttonClass.primary} disabled={busy || !reply.trim()}>
              {t("reviews.sendReply")}
            </button>
            <button type="button" className={buttonClass.outline} onClick={() => setEditing(false)}>
              ✕
            </button>
          </div>
        </form>
      ) : r.vendorReply ? (
        <div className="rounded-xl border-l-4 border-chile bg-paper px-3 py-2">
          <p className="text-sm font-bold">{tv("vendorReply")}</p>
          <p>{r.vendorReply}</p>
        </div>
      ) : null}

      {!editing && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={small} onClick={() => setEditing(true)}>
            💬 {r.vendorReply ? t("reviews.editReply") : t("reviews.reply")}
          </button>
          {r.vendorReply && (
            <button type="button" className={small} disabled={busy} onClick={() => void run(() => vendorApi.reviews.deleteReply(r.id))}>
              {t("reviews.deleteReply")}
            </button>
          )}
          <button type="button" className={small} onClick={onReport}>
            ⚑ {tm("report.action")}
          </button>
          {!r.authorBlocked && (
            <button
              type="button"
              className={small}
              disabled={busy}
              onClick={() => window.confirm(t("reviews.blockHint")) && void run(() => vendorApi.blocks.add({ reviewId: r.id }))}
            >
              🚫 {t("reviews.block")}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function ReviewsManager() {
  const { t } = useTranslation("dashboard");
  const { t: tc } = useTranslation();
  const errorText = useErrorText();
  const qc = useQueryClient();
  const reviews = useQuery({ queryKey: ["myReviews"], queryFn: vendorApi.reviews.list });
  const blocks = useQuery({ queryKey: ["myBlocks"], queryFn: vendorApi.blocks.list });
  const [reporting, setReporting] = useState<{ type: ReportTarget; id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["myReviews"] });
    void qc.invalidateQueries({ queryKey: ["myBlocks"] });
  };

  return (
    <div className="flex flex-col gap-6">
      {error && <Notice tone="error">{error}</Notice>}
      {reviews.isPending ? (
        <p className="text-ink-soft">{tc("status.loading")}</p>
      ) : reviews.isError ? (
        <Notice tone="error">{errorText(reviews.error)}</Notice>
      ) : reviews.data.reviews.length === 0 ? (
        <p className="text-lg text-ink-soft">{t("reviews.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {reviews.data.reviews.map((r) => (
            <ReviewCard
              key={`${r.id}-${r.vendorReplyAt ?? ""}`}
              r={r}
              onChanged={refresh}
              onReport={() => setReporting({ type: "review", id: r.id })}
              onError={(err) => setError(errorText(err))}
            />
          ))}
        </ul>
      )}

      <Panel title={`🚫 ${t("reviews.blocks")}`}>
        <p className="text-ink-soft">{t("reviews.blockHint")}</p>
        {blocks.data && blocks.data.blocks.length > 0 && (
          <ul className="flex flex-col gap-2">
            {blocks.data.blocks.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3">
                <span className="font-bold">{b.name ?? "—"}</span>
                <button
                  type="button"
                  className={small}
                  onClick={async () => {
                    await vendorApi.blocks.remove(b.id).catch((err) => setError(errorText(err)));
                    refresh();
                  }}
                >
                  {t("reviews.unblock")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <ReportDialog target={reporting} onClose={() => setReporting(null)} />
    </div>
  );
}
