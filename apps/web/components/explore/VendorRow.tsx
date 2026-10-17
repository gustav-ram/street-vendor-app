"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import type { LiveResult, UpcomingResult } from "@streeteats/shared";
import { CategoryIcon, LiveLine, PaymentBadges, Rating, VerifiedBadge } from "@/components/vendor/bits";
import { useFormat } from "@/lib/hooks/useFormat";

export function isLive(v: LiveResult | UpcomingResult): v is LiveResult {
  return "live" in v;
}

export function UpcomingLine({ vendor }: { vendor: UpcomingResult }) {
  const { t } = useTranslation("search");
  const f = useFormat();
  return (
    <span className="text-sm">
      <span className="font-bold">{t(`upcoming.${vendor.spot.kind}`)}</span>{" "}
      <span className="text-ink-soft">
        {t("upcoming.when", { start: f.dayTime(vendor.spot.startsAt), end: f.time(vendor.spot.endsAt) })}
        {vendor.spot.placeLabel ? ` · ${vendor.spot.placeLabel}` : ""}
      </span>
    </span>
  );
}

export function VendorRow({
  vendor,
  selected,
  onSelect,
}: {
  vendor: LiveResult | UpcomingResult;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { t, i18n } = useTranslation("search");
  const f = useFormat();
  return (
    <li className={`border-b border-sand ${selected ? "bg-marigold/15" : ""}`}>
      <div className="flex gap-3 p-4">
        <button type="button" onClick={() => onSelect(vendor.id)} aria-label={vendor.displayName} className="shrink-0">
          <CategoryIcon category={vendor.categories[0]} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/${i18n.language}/v/${vendor.id}`} className="text-lg leading-tight font-extrabold hover:underline">
              {vendor.displayName}
            </Link>
            {vendor.verified && <VerifiedBadge />}
          </div>
          {vendor.status && <p className="rounded-lg bg-marigold/25 px-2 py-1 text-sm font-semibold">📣 {vendor.status}</p>}
          {isLive(vendor) ? <LiveLine live={vendor.live} /> : <UpcomingLine vendor={vendor} />}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {vendor.distanceM !== null && <span className="font-semibold">{t("away", { distance: f.distance(vendor.distanceM) })}</span>}
            <Rating average={vendor.rating.average} count={vendor.rating.count} />
            {vendor.priceLevel && <span className="font-semibold">{"$".repeat(vendor.priceLevel)}</span>}
          </div>
          <PaymentBadges methods={vendor.paymentMethods} />
        </div>
      </div>
    </li>
  );
}
