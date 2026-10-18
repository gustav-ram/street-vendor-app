"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { type AutoOffHours, CATEGORY_EMOJI, type LiveNotice, type MyVendor, type Precision } from "@streeteats/shared";
import { useFormat } from "@/lib/hooks/useFormat";
import { useNow } from "@/lib/hooks/useNow";
import { dismissNotice, goLive, goOffline, syncLive, takeOver, useLive } from "@/lib/live";
import { buttonClass, Chip, Choice, Notice, Panel } from "../ui";

// Leaflet touches `window`, so the map only renders in the browser.
const LiveMap = dynamic(() => import("./LiveMap"), { ssr: false, loading: () => <div className="h-56 animate-pulse rounded-2xl bg-sand" /> });

const AUTO_OFF: AutoOffHours[] = [2, 4, 8, null];

/** "I'm open" / "Close now", with what customers see while live. */
export function GoLivePanel({ vendor }: { vendor: MyVendor }) {
  const { t } = useTranslation("dashboard");
  const { t: te } = useTranslation("errors");
  const { t: tc } = useTranslation();
  const f = useFormat();
  const now = useNow(5_000);
  const live = useLive();
  // Starts from the profile default; the default is changed on another page, so this remounts with it.
  const [precision, setPrecision] = useState<Precision>(vendor.defaultPrecision);
  const [autoOff, setAutoOff] = useState<AutoOffHours>(null);

  useEffect(() => syncLive(vendor.live), [vendor.live]);

  const isOn = live.phase === "live" || live.phase === "reconnecting";
  const busy = live.phase === "starting" || live.phase === "stopping";
  const graceMin = Math.round((live.status?.graceSec ?? vendor.live.graceSec) / 60);
  const sinceOk = live.lastOkAt ? Math.max(0, Math.round((now - live.lastOkAt) / 1000)) : null;

  const banner =
    live.phase === "live"
      ? { text: t("live.stateLive"), cls: "bg-live text-white" }
      : live.phase === "reconnecting"
        ? { text: t("live.stateReconnecting"), cls: "bg-marigold text-ink" }
        : live.phase === "elsewhere"
          ? { text: t("live.stateElsewhere"), cls: "bg-live text-white" }
          : { text: t("live.stateOffline"), cls: "bg-sand text-ink" };

  const notices: Record<NonNullable<LiveNotice>, { text: string; tone: "info" | "warn" | "error" }> = {
    autoOffline: { text: t("live.wentOfflineAutoWeb"), tone: "warn" },
    timerEnded: { text: t("live.timerEnded"), tone: "info" },
    offlinePending: { text: t("live.offlinePending", { minutes: graceMin }), tone: "warn" },
    locationDenied: { text: t("live.locationDeniedWeb"), tone: "error" },
    locationUnavailable: { text: t("live.locationUnavailable"), tone: "error" },
    vacation: { text: t("live.vacationOn"), tone: "error" },
    error: { text: te("internal"), tone: "error" },
  };
  const point = (isOn || live.phase === "elsewhere") && live.status?.location ? live.status.location : null;

  return (
    <Panel title={t("web.liveTitle")}>
      <p role="status" aria-live="polite" className={`rounded-2xl px-4 py-4 text-center text-xl font-black ${banner.cls}`}>
        {live.phase === "live" && <span aria-hidden className="mr-2 inline-block size-3 animate-pulse rounded-full bg-white align-middle" />}
        {banner.text}
      </p>

      {live.notice && (
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <Notice tone={notices[live.notice].tone}>{notices[live.notice].text}</Notice>
          </div>
          <button type="button" onClick={dismissNotice} aria-label={tc("actions.close")} className="grid size-11 place-items-center rounded-full font-bold hover:bg-sand">
            ✕
          </button>
        </div>
      )}

      {point ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-lg font-extrabold">{t("live.seeOnMap")}</h3>
          <LiveMap point={point} emoji={CATEGORY_EMOJI[vendor.categories[0] ?? "other"]} label={vendor.displayName} />
          <p className="text-lg">
            <span aria-hidden>📍 </span>
            {point.precision === "approximate" ? t("live.approximate") : t("live.exact")}
          </p>
          {live.status?.endsAt && (
            <p className="text-lg">
              <span aria-hidden>⏰ </span>
              {t("live.closesAt", { time: f.time(live.status.endsAt) })}
            </p>
          )}
          {isOn && sinceOk !== null && (
            <p className="text-ink-soft">
              {t("live.lastUpdate", { when: sinceOk < 5 ? t("live.justNow") : t("live.secondsAgo", { count: sinceOk }) })}
            </p>
          )}
          {isOn ? (
            <Notice>{t("live.keepOpenWeb", { minutes: graceMin })}</Notice>
          ) : (
            <>
              <Notice>{t("live.elsewhereBody")}</Notice>
              <button type="button" className={buttonClass.outline} disabled={busy} onClick={() => void takeOver(point.precision)}>
                📍 {t("live.takeOver")}
              </button>
            </>
          )}
          <button type="button" className={`${buttonClass.dark} min-h-20 rounded-3xl text-2xl`} disabled={busy} onClick={() => void goOffline()}>
            {live.phase === "stopping" ? t("live.stopping") : `■ ${t("live.goOffline")}`}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-extrabold">{t("live.precisionLabel")}</h3>
          <Choice
            name="precision"
            value={precision}
            onChange={setPrecision}
            options={[
              { value: "approximate", label: t("live.approximate"), hint: t("live.approximateHint") },
              { value: "exact", label: t("live.exact"), hint: t("live.exactHint") },
            ]}
          />
          <h3 className="text-lg font-extrabold">{t("live.autoOffLabel")}</h3>
          <div className="flex flex-wrap gap-2">
            {AUTO_OFF.map((h) => (
              <Chip key={String(h)} on={autoOff === h} onClick={() => setAutoOff(h)}>
                {h ? t("live.hours", { count: h }) : t("live.endOfDay")}
              </Chip>
            ))}
          </div>
          <Notice>{t("live.locationNeeded")}</Notice>
          {vendor.hidden && <Notice tone="warn">{t("live.vacationOn")}</Notice>}
          <button
            type="button"
            className="inline-flex min-h-20 items-center justify-center rounded-3xl bg-live px-6 text-2xl font-black text-white hover:bg-live/90 disabled:opacity-50"
            disabled={busy || vendor.hidden || live.phase === "unknown"}
            onClick={() => void goLive(precision, autoOff)}
          >
            {live.phase === "starting" ? t("live.starting") : `● ${t("live.goLive")}`}
          </button>
        </div>
      )}
    </Panel>
  );
}
