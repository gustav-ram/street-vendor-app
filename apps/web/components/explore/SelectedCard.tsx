"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import type { LiveResult, UpcomingResult } from "@streeteats/shared";
import { CategoryIcon, DirectionsButtons, LiveLine, PaymentBadges, VerifiedBadge } from "@/components/vendor/bits";
import { useFormat } from "@/lib/hooks/useFormat";
import { isLive, UpcomingLine } from "./VendorRow";

/** Card over the map for the tapped pin. */
export function SelectedCard({ vendor, onClose }: { vendor: LiveResult | UpcomingResult; onClose: () => void }) {
  const { t, i18n } = useTranslation("vendor");
  const { t: tc } = useTranslation();
  const f = useFormat();
  const location = isLive(vendor) ? vendor.live.location : vendor.spot.location;
  return (
    <div className="absolute inset-x-3 bottom-3 z-[500] rounded-3xl border-2 border-ink bg-white p-4 shadow-xl md:right-auto md:left-4 md:w-[400px]">
      <button type="button" onClick={onClose} aria-label={tc("actions.close")} className="absolute top-2 right-3 grid size-10 place-items-center text-2xl">
        ×
      </button>
      <div className="flex gap-3 pr-8">
        <CategoryIcon category={vendor.categories[0]} />
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-xl leading-tight font-extrabold">{vendor.displayName}</h3>
          {vendor.verified && <VerifiedBadge />}
          {isLive(vendor) ? <LiveLine live={vendor.live} /> : <UpcomingLine vendor={vendor} />}
          {vendor.distanceM !== null && (
            <span className="text-sm font-semibold">{t("away", { ns: "search", distance: f.distance(vendor.distanceM) })}</span>
          )}
        </div>
      </div>
      {vendor.status && <p className="mt-3 rounded-lg bg-marigold/25 px-3 py-2 font-semibold">📣 {vendor.status}</p>}
      <div className="mt-3">
        <PaymentBadges methods={vendor.paymentMethods} />
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <Link
          href={`/${i18n.language}/v/${vendor.id}`}
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-chile px-5 text-lg font-bold text-white hover:bg-chile-dark"
        >
          {t("viewProfile")} →
        </Link>
        {location && <DirectionsButtons vendorId={vendor.id} location={location} />}
      </div>
    </div>
  );
}
