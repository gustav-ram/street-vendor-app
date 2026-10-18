"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { minutesAgo, type ReportTarget, type ReviewPublic, type VendorProfile } from "@streeteats/shared";
import { api, ApiRequestError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useFormat } from "@/lib/hooks/useFormat";
import { useNow } from "@/lib/hooks/useNow";
import { CommunityActions, PhotoGrid, ReportDialog } from "../community/VendorCommunity";
import { CategoryIcon, DirectionsButtons, LiveLine, PaymentBadges, PrecisionNote, Rating, VerifiedBadge } from "./bits";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t-2 border-sand pt-6">
      <h2 className="text-2xl font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

/** Counts one profile view per vendor per browser tab session (aggregate only). */
function useProfileViewEvent(id: string) {
  useEffect(() => {
    const key = `se_viewed_${id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Storage blocked: still count it.
    }
    void api.event(id, "profile_view").catch(() => {});
  }, [id]);
}

function daysSince(iso: string) {
  const start = new Date(iso);
  const today = new Date();
  const a = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((b - a) / 86_400_000);
}

function LastActive({ iso }: { iso: string | null }) {
  const { t } = useTranslation("vendor");
  if (!iso) return <>{t("lastActive.long")}</>;
  const d = daysSince(iso);
  if (d <= 0) return <>{t("lastActive.today")}</>;
  if (d === 1) return <>{t("lastActive.yesterday")}</>;
  if (d > 30) return <>{t("lastActive.long")}</>;
  return <>{t("lastActive.days", { count: d })}</>;
}

function Review({ r, onReport }: { r: ReviewPublic; onReport?: () => void }) {
  const { t } = useTranslation("vendor");
  const { t: tm } = useTranslation("community");
  const f = useFormat();
  return (
    <li className="flex flex-col gap-1 rounded-2xl bg-white p-4">
      <div className="flex items-center gap-2">
        <span aria-label={`${r.rating}/5`} className="text-marigold">
          {"★".repeat(r.rating)}
          <span className="text-ink/20">{"★".repeat(5 - r.rating)}</span>
        </span>
        <span className="font-bold">{r.authorName ?? t("anonymous")}</span>
        <span className="text-sm text-ink-soft">{new Intl.DateTimeFormat(f.locale, { dateStyle: "medium" }).format(new Date(r.createdAt))}</span>
        {onReport && (
          <button type="button" onClick={onReport} className="ml-auto text-sm font-bold text-ink-soft underline-offset-2 hover:underline">
            ⚑ {tm("report.action")}
          </button>
        )}
      </div>
      {r.body && <p>{r.body}</p>}
      {r.vendorReply && (
        <div className="mt-2 rounded-xl border-l-4 border-chile bg-paper px-3 py-2">
          <p className="text-sm font-bold">{t("vendorReply")}</p>
          <p>{r.vendorReply}</p>
        </div>
      )}
    </li>
  );
}

/** "A customer confirmed they're here 12 minutes ago" */
function CustomerConfirmed({ iso }: { iso: string }) {
  const { t } = useTranslation("community");
  const mins = minutesAgo(iso, useNow());
  return (
    <p className="font-semibold text-live">
      ✓ {mins < 1 ? t("stillHere.customerConfirmedJustNow") : t("stillHere.customerConfirmed", { count: mins })}
    </p>
  );
}

function Profile({ v }: { v: VendorProfile }) {
  const { t, i18n } = useTranslation("vendor");
  const { t: tc } = useTranslation("catalog");
  const { t: ts } = useTranslation("search");
  const { t: tm } = useTranslation("community");
  const { status } = useAuth();
  const f = useFormat();
  const lang = i18n.language;
  const [reporting, setReporting] = useState<{ type: ReportTarget; id: string } | null>(null);
  const canReport = status === "signedIn";

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <Link href={`/${lang}`} className="w-fit font-bold text-chile hover:underline">
        ← {t("backToMap")}
      </Link>

      {v.photos.cover && (
        // eslint-disable-next-line @next/next/no-img-element -- served by our API, already resized
        <img src={v.photos.cover.url} alt="" className="aspect-[3/1] w-full rounded-3xl bg-sand object-cover" />
      )}

      <header className="flex items-start gap-4">
        {v.photos.profile ? (
          // eslint-disable-next-line @next/next/no-img-element -- served by our API, already resized
          <img src={v.photos.profile.thumbUrl} alt="" className="size-16 shrink-0 rounded-full border-2 border-white object-cover shadow" />
        ) : (
          <CategoryIcon category={v.categories[0]} size="lg" />
        )}
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl leading-tight font-black sm:text-4xl">{v.displayName}</h1>
          <p className="text-ink-soft">
            {v.categories.map((c) => tc(`categories.${c}`)).join(" · ")}
            {v.priceLevel ? ` · ${"$".repeat(v.priceLevel)}` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {v.verified && <VerifiedBadge withHint />}
            <Rating average={v.rating.average} count={v.rating.count} />
          </div>
        </div>
      </header>

      {v.live ? (
        <div className="flex flex-col gap-3 rounded-3xl border-2 border-live bg-live/5 p-5">
          <LiveLine live={v.live} />
          {v.live.customerConfirmedAt && <CustomerConfirmed iso={v.live.customerConfirmedAt} />}
          <PrecisionNote location={v.live.location} />
          <DirectionsButtons vendorId={v.id} location={v.live.location} />
        </div>
      ) : (
        <div className="rounded-3xl border-2 border-ink/15 bg-white p-5">
          <p className="text-lg font-extrabold">{t("closed")}</p>
          <p className="text-ink-soft">
            <LastActive iso={v.lastActiveAt} />
          </p>
        </div>
      )}

      <CommunityActions v={v} lang={lang} onReport={setReporting} />

      {v.status && (
        <p className="rounded-2xl bg-marigold/25 px-4 py-3 text-lg font-semibold">
          📣 {v.status}
        </p>
      )}

      <Section title={t("menu")}>
        {v.menu.length === 0 ? (
          <p className="text-ink-soft">{t("emptyMenu")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-sand rounded-2xl bg-white">
            {v.menu.map((m) => (
              <li key={m.id} className={`flex items-start justify-between gap-4 px-4 py-3 ${m.soldOut ? "opacity-60" : ""}`}>
                <div>
                  <p className={`text-lg font-bold ${m.soldOut ? "line-through" : ""}`}>{m.name}</p>
                  {m.description && <p className="text-ink-soft">{m.description}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <span className="text-lg font-extrabold">{f.price(m.priceCents)}</span>
                  {m.soldOut && <span className="rounded-full bg-chile px-2 py-0.5 text-sm font-bold text-white">{t("soldOut")}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {(v.photos.gallery.length > 0 || v.photos.customer.length > 0) && (
        <Section title={tm("photos.title")}>
          {v.photos.gallery.length > 0 && (
            <>
              <h3 className="font-extrabold text-ink-soft">{tm("photos.fromVendor")}</h3>
              <PhotoGrid photos={v.photos.gallery} onReport={setReporting} />
            </>
          )}
          {v.photos.customer.length > 0 && (
            <>
              <h3 className="font-extrabold text-ink-soft">{tm("photos.fromCustomers")}</h3>
              <PhotoGrid photos={v.photos.customer} onReport={setReporting} />
            </>
          )}
        </Section>
      )}

      <Section title={t("payments")}>
        <PaymentBadges methods={v.paymentMethods} size="md" />
      </Section>

      {v.languages.length > 0 && (
        <Section title={t("speaks")}>
          <p className="text-lg">{v.languages.map((l) => tc(`languages.${l}`)).join(" · ")}</p>
        </Section>
      )}

      {v.upcoming.length > 0 && (
        <Section title={t("upcoming")}>
          <ul className="flex flex-col gap-2">
            {v.upcoming.map((u) => (
              <li key={`${u.kind}-${u.id}-${u.startsAt}`} className="rounded-2xl bg-white p-4">
                <p className="font-bold">
                  {ts(`upcoming.${u.kind}`)} · {ts("upcoming.when", { start: f.dayTime(u.startsAt), end: f.time(u.endsAt) })}
                </p>
                {u.placeLabel && <p>📍 {u.placeLabel}</p>}
                {u.note && <p className="text-ink-soft">{u.note}</p>}
                {u.location && (
                  <div className="mt-2">
                    <PrecisionNote location={u.location} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {v.schedule.length > 0 && (
        <Section title={t("schedule")}>
          <ul className="flex flex-col gap-1">
            {v.schedule.map((s, i) => (
              <li key={i} className="flex flex-wrap gap-x-3">
                <span className="w-28 font-bold">{f.weekday(s.weekday)}</span>
                <span>
                  {f.clock(s.startTime)} – {f.clock(s.endTime)}
                </span>
                {s.placeLabel && <span className="text-ink-soft">· {s.placeLabel}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(v.description || v.tags.length > 0) && (
        <Section title={t("about")}>
          {v.description && <p className="text-lg leading-relaxed whitespace-pre-line">{v.description}</p>}
          <ul className="flex flex-wrap gap-2">
            {v.tags.map((tag) => (
              <li key={tag.slug} className="rounded-full bg-sand px-3 py-1 text-sm font-semibold">
                {lang === "es" ? tag.nameEs : tag.nameEn}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {v.contact && (
        <Section title={t("contact")}>
          <p className="text-lg">{v.contact}</p>
        </Section>
      )}

      <Section title={t("reviews")}>
        {v.reviews.length === 0 ? (
          <p className="text-ink-soft">{t("noReviews")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {v.reviews.map((r) => (
              <Review key={r.id} r={r} onReport={canReport ? () => setReporting({ type: "review", id: r.id }) : undefined} />
            ))}
          </ul>
        )}
      </Section>

      <ReportDialog target={reporting} onClose={() => setReporting(null)} />
    </article>
  );
}

export function VendorProfileView({ id }: { id: string }) {
  const { t } = useTranslation("vendor");
  const { t: tc } = useTranslation();
  const { t: te } = useTranslation("errors");
  const query = useQuery({ queryKey: ["vendor", id], queryFn: () => api.vendor(id) });
  useProfileViewEvent(id);

  if (query.isPending) return <p className="mx-auto w-full max-w-3xl p-6 text-ink-soft">{tc("status.loading")}</p>;
  if (query.isError) {
    const notFound = query.error instanceof ApiRequestError && query.error.code === "not_found";
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-start gap-3 p-6">
        <p role="alert" className="text-lg font-semibold">
          {notFound ? t("notFound") : te(query.error instanceof ApiRequestError ? query.error.code : "internal")}
        </p>
        <Link href="/" className="font-bold text-chile">
          ← {t("backToMap")}
        </Link>
      </div>
    );
  }
  return <Profile v={query.data} />;
}
