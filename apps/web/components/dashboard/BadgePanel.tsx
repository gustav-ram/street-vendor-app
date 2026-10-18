"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { badgeSteps } from "@streeteats/shared";
import { vendorApi } from "@/lib/auth";
import { Notice, Panel } from "../ui";

/** "Community Verified": the vendor's progress, in plain words. Counts only, never who. */
export function BadgePanel() {
  const { t, i18n } = useTranslation("dashboard");
  const q = useQuery({ queryKey: ["verification"], queryFn: vendorApi.verification, staleTime: 60_000 });
  const v = q.data;
  if (!v) return <Panel title={<>🛡️ {t("badge.title")}</>}>{q.isError ? null : <div className="h-24 animate-pulse rounded-2xl bg-sand" />}</Panel>;
  const steps = badgeSteps(v);
  const date = (iso: string) => new Intl.DateTimeFormat(i18n.language === "es" ? "es-US" : "en-US", { dateStyle: "medium" }).format(new Date(iso));

  return (
    <Panel title={<>🛡️ {t("badge.title")}</>}>
      {v.status === "verified" ? (
        <p className="rounded-2xl bg-live px-4 py-3 text-lg font-black text-white">
          ✓ {t("badge.earned")} {v.verifiedAt && <span className="font-bold text-white/85">· {t("badge.earnedSince", { date: date(v.verifiedAt) })}</span>}
        </p>
      ) : v.status === "revoked" ? (
        <Notice tone="warn">
          <strong>{t("badge.revoked")}</strong>
          {v.revokedReason && <span className="block">{t("badge.revokedReason", { reason: v.revokedReason })}</span>}
        </Notice>
      ) : (
        <p className="text-lg font-bold">{t("badge.notYet")}</p>
      )}
      <ol className="flex flex-col gap-3">
        {steps.map((s) => (
          <li key={s.key} className="flex flex-col gap-1.5 rounded-2xl bg-white p-3">
            <span className="flex items-start justify-between gap-3">
              <span className="font-bold">{t(s.need[0], s.need[1])}</span>
              <span className={`shrink-0 font-black ${s.met ? "text-live" : "text-ink-soft"}`}>{s.met ? t("badge.stepDone") : null}</span>
            </span>
            <span className="h-3 overflow-hidden rounded-full bg-sand" aria-hidden>
              <span className={`block h-full rounded-full ${s.met ? "bg-live" : "bg-marigold"}`} style={{ width: `${Math.round(s.fraction * 100)}%` }} />
            </span>
            <span className="text-sm text-ink-soft">{t(s.have[0], s.have[1])}</span>
          </li>
        ))}
      </ol>
      <details className="rounded-2xl bg-sand/60 p-3">
        <summary className="cursor-pointer text-lg font-extrabold">{t("badge.howTitle")}</summary>
        <div className="mt-2 flex flex-col gap-2">
          <p>{t("badge.how")}</p>
          <p>{t("badge.kept")}</p>
          <p className="text-ink-soft">{t("badge.optional")}</p>
        </div>
      </details>
    </Panel>
  );
}
