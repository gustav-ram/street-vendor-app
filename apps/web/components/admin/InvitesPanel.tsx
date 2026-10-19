"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AdminInvite } from "@streeteats/shared";
import { adminApi } from "@/lib/auth";
import { buttonClass, Field, Panel } from "../ui";

const small = "inline-flex min-h-11 items-center justify-center rounded-full border-2 px-4 font-bold disabled:opacity-50";

/** Invite codes for flyers. Only counts are kept: how many codes, how many sign-ups each, never who. */
export function InvitesPanel({ lang, onError }: { lang: string; onError: (e: unknown) => void }) {
  const { t, i18n } = useTranslation("admin");
  const qc = useQueryClient();
  const invites = useQuery({ queryKey: ["admin", "invites"], queryFn: adminApi.invites });
  const [label, setLabel] = useState("");
  const [max, setMax] = useState("");
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin", "invites"] });
  const date = (iso: string) => new Intl.DateTimeFormat(i18n.language === "es" ? "es-US" : "en-US", { dateStyle: "medium" }).format(new Date(iso));

  async function create() {
    setBusy(true);
    try {
      await adminApi.createInvite({
        label: label.trim(),
        maxRedemptions: max ? Number(max) : undefined,
        expiresInDays: days ? Number(days) : undefined,
      });
      setLabel("");
      setMax("");
      setDays("");
      refresh();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  const state = (i: AdminInvite) =>
    i.disabled ? t("invites.disabled") : i.expiresAt && new Date(i.expiresAt) < new Date() ? t("invites.expired") : i.expiresAt ? t("invites.until", { date: date(i.expiresAt) }) : null;

  return (
    <Panel title={`🎟️ ${t("invites.title")}`}>
      <p className="text-ink-soft">{t("invites.hint")}</p>
      {invites.data && <p className="font-bold">{t("invites.stats", invites.data.stats)}</p>}
      <form
        className="grid gap-3 rounded-2xl bg-white p-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim()) void create();
        }}
      >
        <Field label={t("invites.label")} placeholder={t("invites.labelPlaceholder")} value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
        <Field label={t("invites.max")} type="number" min={1} max={10000} inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} />
        <Field label={t("invites.days")} type="number" min={1} max={365} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
        <button type="submit" className={buttonClass.primary} disabled={busy || !label.trim()}>
          {t("invites.create")}
        </button>
      </form>
      {invites.data?.invites.length === 0 && <p className="text-ink-soft">{t("invites.empty")}</p>}
      <ul className="flex flex-col gap-3">
        {invites.data?.invites.map((i) => (
          <li key={i.id} className={`flex flex-col gap-2 rounded-3xl border-2 border-ink/10 bg-white p-4 ${i.disabled ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="font-mono text-2xl font-black tracking-wider">{i.code}</span>
              <span className="font-bold">{i.label}</span>
            </div>
            <p className="text-ink-soft">
              {i.maxRedemptions ? t("invites.usedOf", { count: i.redemptionCount, max: i.maxRedemptions }) : t("invites.used", { count: i.redemptionCount })}
              {state(i) ? ` · ${state(i)}` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href={`/${lang}/admin/invites/${i.id}/flyer`} className={`${small} border-ink bg-ink text-white`}>
                🖨 {t("invites.flyer")}
              </Link>
              <button
                type="button"
                className={`${small} border-ink bg-white`}
                onClick={() => {
                  void navigator.clipboard?.writeText(`${window.location.origin}/join?code=${i.code}`);
                  setCopied(i.id);
                }}
              >
                {copied === i.id ? `✓ ${t("invites.copied")}` : t("invites.copy")}
              </button>
              <button
                type="button"
                className={`${small} border-ink/30 bg-white`}
                onClick={() => void adminApi.setInviteDisabled(i.id, !i.disabled).then(refresh, onError)}
              >
                {i.disabled ? t("invites.enable") : t("invites.disable")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
