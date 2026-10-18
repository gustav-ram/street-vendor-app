"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type LatLng,
  LIMITS,
  type MyUpcomingPost,
  type MyVendor,
  pickerFromWindow,
  type Precision,
  windowFromPicker,
  windowProblem,
} from "@streeteats/shared";
import { vendorApi } from "@/lib/auth";
import { useFormat } from "@/lib/hooks/useFormat";
import { useMyVendorCache } from "@/lib/hooks/useMyVendor";
import { useErrorText } from "../community/dialogs";
import { buttonClass, Chip, Choice, Field, Notice, Panel } from "../ui";

const SpotPicker = dynamic(() => import("./SpotPicker"), { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-2xl bg-sand" /> });
const DAYS = [0, 1, 2, 3, 4, 5, 6];

/** "Where I'll be": future spots regulars can plan around, without sharing a live location. */
export function UpcomingManager({ vendor }: { vendor: MyVendor }) {
  const { t } = useTranslation("dashboard");
  const f = useFormat();
  const cache = useMyVendorCache();
  const [editing, setEditing] = useState<MyUpcomingPost | "new" | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorText = useErrorText();
  const dayName = useDayName();

  const remove = async (id: string) => {
    setConfirmId(null);
    setError(null);
    cache.patch((v) => ({ ...v, upcoming: v.upcoming.filter((u) => u.id !== id) }));
    try {
      await vendorApi.upcoming.remove(id);
    } catch (err) {
      setError(errorText(err));
    } finally {
      void cache.refetch();
    }
  };

  return (
    <Panel title={<>📍 {t("upcoming.title")}</>}>
      <p className="text-lg text-ink-soft">{t("upcoming.intro")}</p>
      {error && <Notice tone="error">{error}</Notice>}
      {vendor.upcoming.length === 0 && editing !== "new" && <p className="text-lg">{t("upcoming.empty")}</p>}
      <ul className="flex flex-col gap-3">
        {vendor.upcoming.map((u) =>
          editing !== "new" && editing?.id === u.id ? (
            <li key={u.id}>
              <PostForm vendor={vendor} post={u} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={u.id} className="flex flex-col gap-2 rounded-2xl border border-ink/10 bg-white p-4">
              <p className="text-lg font-extrabold">
                {t("upcoming.when", { day: dayName(u.startsAt), start: f.time(u.startsAt), end: f.time(u.endsAt) })}
              </p>
              {u.placeLabel && <p className="font-bold">📍 {u.placeLabel}</p>}
              {u.note && <p>{u.note}</p>}
              <p className="text-sm text-ink-soft">{u.location.precision === "approximate" ? t("upcoming.approxNote") : t("upcoming.exactNote")}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={buttonClass.outline} onClick={() => setEditing(u)}>
                  {t("upcoming.edit")}
                </button>
                <button
                  type="button"
                  className={confirmId === u.id ? buttonClass.danger : buttonClass.outline}
                  onClick={() => (confirmId === u.id ? void remove(u.id) : setConfirmId(u.id))}
                >
                  🗑 {confirmId === u.id ? t("upcoming.confirmDelete") : t("upcoming.delete")}
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
      {editing === "new" ? (
        <PostForm vendor={vendor} post={null} onDone={() => setEditing(null)} />
      ) : (
        <button
          type="button"
          className={buttonClass.primary}
          disabled={vendor.upcoming.length >= LIMITS.upcomingPostsMax}
          onClick={() => setEditing("new")}
        >
          {t("upcoming.add")}
        </button>
      )}
      {vendor.upcoming.length >= LIMITS.upcomingPostsMax && <p className="text-ink-soft">{t("upcoming.limit", { count: LIMITS.upcomingPostsMax })}</p>}
      <p className="text-sm text-ink-soft">{t("upcoming.autoDelete")}</p>
    </Panel>
  );
}

/** "Today", "Tomorrow" or the weekday name. */
export function useDayName() {
  const { t } = useTranslation("dashboard");
  const f = useFormat();
  return (iso: string) => {
    const { dayOffset } = pickerFromWindow(iso, iso);
    return dayOffset === 0 ? t("upcoming.today") : dayOffset === 1 ? t("upcoming.tomorrow") : f.weekday(new Date(iso).getDay());
  };
}

function PostForm({ vendor, post, onDone }: { vendor: MyVendor; post: MyUpcomingPost | null; onDone: () => void }) {
  const { t } = useTranslation("dashboard");
  const { t: tc } = useTranslation();
  const { t: te } = useTranslation("errors");
  const f = useFormat();
  const cache = useMyVendorCache();
  const errorText = useErrorText();
  const initial = post ? pickerFromWindow(post.startsAt, post.endsAt) : { dayOffset: 1, start: "17:00", end: "21:00" };
  const [day, setDay] = useState(initial.dayOffset);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [spot, setSpot] = useState<LatLng | null>(post?.location ?? vendor.live.location ?? null);
  const [recenter, setRecenter] = useState<LatLng | null>(null);
  const [precision, setPrecision] = useState<Precision>(post?.location.precision ?? vendor.defaultPrecision);
  const [placeLabel, setPlaceLabel] = useState(post?.placeLabel ?? "");
  const [note, setNote] = useState(post?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const win = windowFromPicker(day, start, end);
  const problem = windowProblem(win.startsAt, win.endsAt);

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) return;
    setLocating(true);
    // One reading, only to place the pin; the API stores the published (fuzzed) point.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setSpot(p);
        setRecenter(p);
        setLocating(false);
      },
      () => {
        setError(t("live.locationDeniedWeb"));
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 15_000 },
    );
  };

  async function save() {
    if (!spot || problem) return;
    setBusy(true);
    setError(null);
    try {
      await vendorApi.upcoming.put(post?.id ?? crypto.randomUUID(), {
        location: spot,
        precision,
        placeLabel: placeLabel.trim() || null,
        note: note.trim() || null,
        startsAt: win.startsAt,
        endsAt: win.endsAt,
        clientUpdatedAt: new Date().toISOString(),
      });
      await cache.refetch();
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-4 rounded-2xl border-2 border-ink bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h3 className="text-xl font-black">{post ? t("upcoming.edit") : t("upcoming.new")}</h3>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-lg font-extrabold">{t("upcoming.day")}</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => (
            <Chip key={d} on={day === d} onClick={() => setDay(d)}>
              {d === 0 ? t("upcoming.today") : d === 1 ? t("upcoming.tomorrow") : f.weekday((new Date().getDay() + d) % 7)}
            </Chip>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("upcoming.from")} type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
        <Field label={t("upcoming.until")} type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
      </div>
      {win.overnight && !problem && <p className="text-ink-soft">🌙 {t("schedule.overnight")}</p>}
      {problem === "tooLong" && <Notice tone="warn">{t("upcoming.tooLong", { hours: LIMITS.upcomingWindowMaxHours })}</Notice>}
      {problem === "ended" && <Notice tone="warn">{te("window_ended")}</Notice>}

      <div className="flex flex-col gap-2">
        <span className="text-lg font-extrabold">{t("upcoming.where")}</span>
        <span className="text-ink-soft">{t("upcoming.whereHint")}</span>
        <SpotPicker initial={spot} recenter={recenter} onChange={setSpot} label={t("upcoming.where")} />
        <button type="button" className={`${buttonClass.outline} w-fit`} onClick={useMyLocation} disabled={locating}>
          📍 {locating ? t("live.starting") : t("upcoming.useMyLocation")}
        </button>
      </div>
      <Choice
        name={`precision-${post?.id ?? "new"}`}
        value={precision}
        onChange={setPrecision}
        options={[
          { value: "approximate", label: t("live.approximate"), hint: t("upcoming.approxNote") },
          { value: "exact", label: t("live.exact"), hint: t("upcoming.exactNote") },
        ]}
      />
      <Field
        label={t("upcoming.placeLabel")}
        placeholder={t("upcoming.placeLabelPlaceholder")}
        value={placeLabel}
        maxLength={LIMITS.placeLabelMax}
        onChange={(e) => setPlaceLabel(e.target.value)}
      />
      <Field
        label={t("upcoming.note")}
        placeholder={t("upcoming.notePlaceholder")}
        value={note}
        maxLength={LIMITS.upcomingNoteMax}
        onChange={(e) => setNote(e.target.value)}
      />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={buttonClass.primary} disabled={busy || !spot || problem !== null}>
          {t("upcoming.save")}
        </button>
        <button type="button" className={buttonClass.outline} onClick={onDone}>
          {tc("actions.cancel")}
        </button>
      </div>
    </form>
  );
}
