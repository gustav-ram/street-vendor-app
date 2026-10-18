"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { type LatLng, LIMITS, type MyVendor, type Precision } from "@streeteats/shared";
import { vendorApi } from "@/lib/auth";
import { useFormat } from "@/lib/hooks/useFormat";
import { useMyVendorCache } from "@/lib/hooks/useMyVendor";
import { useErrorText } from "../community/dialogs";
import { buttonClass, Field, inputClass, Notice, Panel, Switch } from "../ui";

const SpotPicker = dynamic(() => import("./SpotPicker"), { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-2xl bg-sand" /> });

interface Row {
  key: string;
  weekday: number;
  startTime: string;
  endTime: string;
  placeLabel: string;
  location: LatLng | null;
  precision: Precision;
}

const toRows = (v: MyVendor): Row[] =>
  v.schedule.entries.map((e) => ({
    key: e.id,
    weekday: e.weekday,
    startTime: e.startTime,
    endTime: e.endTime,
    placeLabel: e.placeLabel ?? "",
    // The published point; saving it again gives the same point.
    location: e.location ? { lat: e.location.lat, lng: e.location.lng } : null,
    precision: e.location?.precision ?? v.defaultPrecision,
  }));

/** "Fridays near the park": regular days the vendor chooses to publish. */
export function ScheduleEditor({ vendor }: { vendor: MyVendor }) {
  const { t } = useTranslation("dashboard");
  const f = useFormat();
  const cache = useMyVendorCache();
  const errorText = useErrorText();
  const [rows, setRows] = useState<Row[]>(() => toRows(vendor));
  const [published, setPublished] = useState(vendor.schedule.published);
  const [picking, setPicking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const saved = await vendorApi.schedule({
        published,
        entries: rows.map((r) => ({
          weekday: r.weekday,
          startTime: r.startTime,
          endTime: r.endTime,
          placeLabel: r.placeLabel.trim() || null,
          location: r.location,
          precision: r.precision,
        })),
      });
      cache.set(saved);
      setRows(toRows(saved));
      setPicking(null);
      setMessage({ tone: "info", text: t("schedule.saved") });
    } catch (err) {
      setMessage({ tone: "error", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title={<>🗓️ {t("schedule.title")}</>}>
      <p className="text-lg text-ink-soft">{t("schedule.intro")}</p>
      {rows.length === 0 && <p className="text-lg">{t("schedule.empty")}</p>}
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.key} className="flex flex-col gap-3 rounded-2xl border border-ink/10 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-lg font-extrabold">{t("schedule.day")}</span>
                <select className={inputClass} value={r.weekday} onChange={(e) => update(r.key, { weekday: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                    <option key={d} value={d}>
                      {f.weekday(d)}
                    </option>
                  ))}
                </select>
              </label>
              <Field label={t("schedule.from")} type="time" value={r.startTime} onChange={(e) => update(r.key, { startTime: e.target.value })} required />
              <Field label={t("schedule.until")} type="time" value={r.endTime} onChange={(e) => update(r.key, { endTime: e.target.value })} required />
            </div>
            {r.endTime < r.startTime && <p className="text-ink-soft">🌙 {t("schedule.overnight")}</p>}
            <Field
              label={t("upcoming.placeLabel")}
              placeholder={t("upcoming.placeLabelPlaceholder")}
              value={r.placeLabel}
              maxLength={LIMITS.placeLabelMax}
              onChange={(e) => update(r.key, { placeLabel: e.target.value })}
            />
            <p className="text-ink-soft">{r.location ? `📍 ${t("schedule.hasSpot")}` : t("schedule.noSpot")}</p>
            {picking === r.key && (
              <>
                <span className="text-ink-soft">{t("upcoming.whereHint")}</span>
                <SpotPicker initial={r.location ?? vendor.live.location} recenter={null} onChange={(p) => update(r.key, { location: p })} label={t("schedule.spot")} />
              </>
            )}
            <div className="flex flex-wrap gap-2">
              {picking === r.key ? (
                <button type="button" className={buttonClass.dark} onClick={() => setPicking(null)}>
                  ✓ {t("schedule.done")}
                </button>
              ) : (
                <button type="button" className={buttonClass.outline} onClick={() => setPicking(r.key)}>
                  📍 {r.location ? t("schedule.changeSpot") : t("schedule.setSpot")}
                </button>
              )}
              {r.location && (
                <button type="button" className={buttonClass.outline} onClick={() => update(r.key, { location: null })}>
                  {t("schedule.clearSpot")}
                </button>
              )}
              <button type="button" className={`${buttonClass.outline} ml-auto`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                🗑 {t("schedule.remove")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {rows.length < LIMITS.scheduleEntriesMax && (
        <button
          type="button"
          className={`${buttonClass.outline} w-fit`}
          onClick={() =>
            setRows((rs) => [
              ...rs,
              { key: crypto.randomUUID(), weekday: 5, startTime: "17:00", endTime: "22:00", placeLabel: "", location: null, precision: vendor.defaultPrecision },
            ])
          }
        >
          {t("schedule.add")}
        </button>
      )}
      <Switch checked={published} onChange={setPublished} label={t("schedule.publish")} hint={t("schedule.publishHint")} />
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <button type="button" className={buttonClass.primary} disabled={busy || rows.some((r) => r.startTime === r.endTime)} onClick={() => void save()}>
        {t("schedule.save")}
      </button>
    </Panel>
  );
}
