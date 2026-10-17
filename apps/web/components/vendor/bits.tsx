"use client";

import { useTranslation } from "react-i18next";
import {
  CATEGORY_EMOJI,
  type Category,
  type LiveInfo,
  minutesAgo,
  type PaymentMethod,
  type PublicPoint,
} from "@streeteats/shared";
import { api } from "@/lib/api";
import { useFormat } from "@/lib/hooks/useFormat";
import { useNow } from "@/lib/hooks/useNow";

const PAYMENT_ICON: Record<PaymentMethod, string> = {
  cash: "💵",
  card: "💳",
  venmo: "V",
  zelle: "Z",
  cash_app: "$",
  apple_pay: "",
};

export function CategoryIcon({ category, size = "md" }: { category: Category | undefined; size?: "md" | "lg" }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full bg-sand ${size === "lg" ? "size-16 text-4xl" : "size-12 text-2xl"}`}
    >
      {CATEGORY_EMOJI[category ?? "other"]}
    </span>
  );
}

/** Payment *types* only. Never handles, numbers or account details. */
export function PaymentBadges({ methods, size = "sm" }: { methods: PaymentMethod[]; size?: "sm" | "md" }) {
  const { t } = useTranslation("catalog");
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={t("payments", { ns: "vendor" })}>
      {methods.map((m) => (
        <li
          key={m}
          className={`inline-flex items-center gap-1 rounded-full border border-ink/20 bg-white font-semibold ${
            size === "md" ? "px-3 py-1 text-base" : "px-2 py-0.5 text-sm"
          }`}
        >
          {PAYMENT_ICON[m] && <span aria-hidden>{PAYMENT_ICON[m]}</span>}
          {t(`payments.${m}`)}
        </li>
      ))}
    </ul>
  );
}

export function Rating({ average, count }: { average: number | null; count: number }) {
  const { t } = useTranslation("vendor");
  if (!count || average === null) return <span className="text-ink-soft">{t("noRatings")}</span>;
  return (
    <span className="font-semibold">
      <span aria-hidden className="text-marigold">★ </span>
      {t("rating", { average: average.toFixed(1), count })}
    </span>
  );
}

export function VerifiedBadge({ withHint = false }: { withHint?: boolean }) {
  const { t } = useTranslation("vendor");
  return (
    <span
      title={t("verifiedHint")}
      className="inline-flex items-center gap-1 rounded-full bg-live/10 px-2 py-0.5 text-sm font-bold text-live"
    >
      <span aria-hidden>✔</span> {t("verified")}
      {withHint && <span className="sr-only">. {t("verifiedHint")}</span>}
    </span>
  );
}

/** "Open now · Confirmed 3 min ago · Until 9:00 PM" */
export function LiveLine({ live }: { live: LiveInfo }) {
  const { t } = useTranslation("search");
  const f = useFormat();
  const now = useNow();
  const mins = minutesAgo(live.lastConfirmedAt, now);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 text-sm">
      <span className="inline-flex items-center gap-1 font-bold text-live">
        <span aria-hidden className="inline-block size-2.5 rounded-full bg-live" />
        {t("live.openNow")}
      </span>
      <span className="text-ink-soft">
        {mins < 1 ? t("live.confirmedJustNow") : t("live.confirmedMinutes", { count: mins })}
      </span>
      <span className="text-ink-soft">· {t("live.until", { time: f.time(live.endsAt) })}</span>
    </span>
  );
}

export function PrecisionNote({ location }: { location: PublicPoint }) {
  const { t } = useTranslation("search");
  return (
    <span className="text-sm text-ink-soft">
      📍 {location.precision === "approximate" ? t("live.approximate") : t("live.exact")}
    </span>
  );
}

/** Opens Apple or Google Maps at the vendor's public point. */
export function DirectionsButtons({ vendorId, location }: { vendorId: string; location: PublicPoint }) {
  const { t } = useTranslation("vendor");
  const dest = `${location.lat},${location.lng}`;
  const links = [
    { label: t("directionsGoogle"), href: `https://www.google.com/maps/dir/?api=1&destination=${dest}` },
    { label: t("directionsApple"), href: `https://maps.apple.com/?daddr=${dest}` },
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <a
            key={l.href}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void api.event(vendorId, "directions").catch(() => {})}
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-5 text-base font-bold text-white hover:bg-ink/85"
          >
            🧭 {l.label}
          </a>
        ))}
      </div>
      {location.precision === "approximate" && <p className="text-sm text-ink-soft">{t("directionsApprox")}</p>}
    </div>
  );
}
