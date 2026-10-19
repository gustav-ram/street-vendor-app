"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AnalyticsDay, AnalyticsRange } from "@streeteats/shared";
import { vendorApi } from "@/lib/auth";
import { Chip, Panel } from "../ui";

const METRICS = ["profileViews", "mapImpressions", "directionsTaps", "favoritesAdded", "confirmations"] as const;
type Metric = (typeof METRICS)[number];

/** Daily totals for a vendor: a row of numbers, then one metric per day. Nothing about who. */
export function StatsView() {
  const { t, i18n } = useTranslation("dashboard");
  const [range, setRange] = useState<AnalyticsRange>("7d");
  const [metric, setMetric] = useState<Metric>("profileViews");
  const q = useQuery({ queryKey: ["analytics", range], queryFn: () => vendorApi.analytics(range), placeholderData: keepPreviousData });
  const locale = i18n.language === "es" ? "es-US" : "en-US";
  // Days are calendar dates in the vendor's time zone; format them as such (noon UTC avoids off-by-one).
  const dayLabel = (day: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
  const n = (v: number) => new Intl.NumberFormat(locale).format(v);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2" role="group">
        {(["7d", "30d"] as const).map((r) => (
          <Chip key={r} on={range === r} onClick={() => setRange(r)}>
            {r === "7d" ? t("stats.range7") : t("stats.range30")}
          </Chip>
        ))}
      </div>

      {!q.data ? (
        <div className="h-64 animate-pulse rounded-3xl bg-sand" />
      ) : (
        <>
          <p className="text-2xl font-black">♥ {t("stats.favoritesNow", { count: q.data.favoritesNow })}</p>

          {/* The totals for the period; each picks the chart below. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {METRICS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={metric === m}
                onClick={() => setMetric(m)}
                className={`flex min-h-24 flex-col items-start justify-between rounded-2xl border-2 p-3 text-left ${metric === m ? "border-ink bg-white" : "border-ink/10 bg-white/70 hover:border-ink/40"}`}
              >
                <span className="text-sm font-bold text-ink-soft">{t(`stats.${m}`)}</span>
                <span className="text-3xl font-black">{n(q.data.totals[m])}</span>
              </button>
            ))}
          </div>

          <Panel title={t("stats.perDay", { what: t(`stats.${metric}`) })}>
            <DailyColumns days={q.data.days} metric={metric} dayLabel={dayLabel} n={n} todayLabel={t("stats.today")} />
            {q.data.days.every((d) => d[metric] === 0) && <p className="text-ink-soft">{t("stats.empty")}</p>}
            <details>
              <summary className="cursor-pointer font-bold">{t("stats.table")}</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b-2 border-ink/10">
                      <th className="py-1 pr-3">{t("stats.day")}</th>
                      {METRICS.map((m) => (
                        <th key={m} className="py-1 pr-3 text-right">
                          {t(`stats.${m}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...q.data.days].reverse().map((d) => (
                      <tr key={d.day} className="border-b border-ink/5">
                        <td className="py-1 pr-3">{dayLabel(d.day, { weekday: "short", month: "short", day: "numeric" })}</td>
                        {METRICS.map((m) => (
                          <td key={m} className="py-1 pr-3 text-right tabular-nums">
                            {n(d[m])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </Panel>
          <p className="text-ink-soft">🔒 {t("stats.privacy")}</p>
        </>
      )}
    </div>
  );
}

/** One column per day, from a single baseline, with a tooltip on hover or focus. */
function DailyColumns({
  days,
  metric,
  dayLabel,
  n,
  todayLabel,
}: {
  days: AnalyticsDay[];
  metric: Metric;
  dayLabel: (day: string, opts: Intl.DateTimeFormatOptions) => string;
  n: (v: number) => string;
  todayLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d[metric]));
  const peak = days.reduce((best, d, i) => (d[metric] > (days[best]?.[metric] ?? -1) ? i : best), 0);
  const last = days.length - 1;
  // Labels on the axis: first, middle and today, so they never collide.
  const labelled = new Set([0, Math.floor(last / 2), last]);

  return (
    <div className="relative pt-8" onMouseLeave={() => setHover(null)}>
      <div className="flex h-44 items-end gap-0.5 border-b border-ink/25">
        {days.map((d, i) => {
          const v = d[metric];
          const showValue = v > 0 && (i === peak || i === last);
          return (
            <button
              key={d.day}
              type="button"
              className="group relative flex h-full flex-1 cursor-default items-end justify-center focus:outline-none"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${dayLabel(d.day, { weekday: "long", month: "long", day: "numeric" })}: ${n(v)}`}
            >
              {showValue && hover === null && (
                <span className="absolute text-xs font-bold text-ink" style={{ bottom: `calc(${(v / max) * 100}% + 4px)` }}>
                  {n(v)}
                </span>
              )}
              <span
                className={`block w-full max-w-6 rounded-t-[4px] ${hover === i ? "bg-chile-dark" : "bg-chile"}`}
                style={{ height: v === 0 ? 0 : `max(${(v / max) * 100}%, 3px)` }}
              />
            </button>
          );
        })}
      </div>
      <div className="relative mt-1 h-5 text-xs text-ink-soft">
        {[...labelled].map((i) => (
          <span
            key={i}
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${((i + 0.5) / days.length) * 100}%`, ...(i === last ? { transform: "translateX(-100%)", left: "100%" } : i === 0 ? { transform: "none", left: 0 } : {}) }}
          >
            {i === last ? todayLabel : dayLabel(days[i]!.day, { month: "short", day: "numeric" })}
          </span>
        ))}
      </div>
      {hover !== null && days[hover] && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg bg-ink px-2 py-1 text-sm whitespace-nowrap text-white shadow"
          style={{ left: `${Math.min(92, Math.max(8, ((hover + 0.5) / days.length) * 100))}%` }}
        >
          {dayLabel(days[hover].day, { weekday: "short", month: "short", day: "numeric" })}: <strong>{n(days[hover][metric])}</strong>
        </div>
      )}
    </div>
  );
}
