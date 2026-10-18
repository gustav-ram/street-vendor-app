"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LIMITS, type MyVendor } from "@streeteats/shared";
import { vendorApi } from "@/lib/auth";
import { useFormat } from "@/lib/hooks/useFormat";
import { useMyVendorCache } from "@/lib/hooks/useMyVendor";
import { buttonClass, Chip, Notice, Panel, TextArea } from "../ui";

const SUGGESTIONS = ["fresh", "soldOut", "specials", "here"] as const;
const DURATIONS = [2, 4, 8, null] as const;

/** Short updates on the public page ("Sold out of onions"). They expire on their own. */
export function StatusComposer({ vendor }: { vendor: MyVendor }) {
  const { t } = useTranslation("dashboard");
  const { t: te } = useTranslation("errors");
  const f = useFormat();
  const cache = useMyVendorCache();
  const [body, setBody] = useState("");
  const [hours, setHours] = useState<(typeof DURATIONS)[number]>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await cache.refetch();
    } catch {
      setError(te("network"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title={<>📣 {t("status.title")}</>}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!body.trim()) return;
          void act(async () => {
            await vendorApi.status.put(crypto.randomUUID(), {
              body: body.trim(),
              expiresInHours: hours ?? undefined,
              clientUpdatedAt: new Date().toISOString(),
            });
            setBody("");
          });
        }}
      >
        <TextArea
          label={t("status.placeholder")}
          value={body}
          maxLength={LIMITS.statusPostMax}
          onChange={(e) => setBody(e.target.value)}
          hint={`${body.length}/${LIMITS.statusPostMax}`}
        />
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <Chip key={s} on={false} onClick={() => setBody(t(`status.suggestions.${s}`))}>
              {t(`status.suggestions.${s}`)}
            </Chip>
          ))}
        </div>
        <span className="text-lg font-extrabold">{t("status.duration")}</span>
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map((h) => (
            <Chip key={String(h)} on={hours === h} onClick={() => setHours(h)}>
              {h ? t("live.hours", { count: h }) : t("live.endOfDay")}
            </Chip>
          ))}
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <button type="submit" className={buttonClass.primary} disabled={busy || !body.trim()}>
          {t("status.post")}
        </button>
      </form>

      <h3 className="text-lg font-extrabold">{t("status.current")}</h3>
      {vendor.statusPosts.length === 0 ? (
        <p className="text-ink-soft">{t("status.none")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {vendor.statusPosts.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-marigold/20 p-4">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-lg font-extrabold break-words">{p.body}</span>
                <span className="text-ink-soft">{t("status.until", { time: f.time(p.expiresAt) })}</span>
              </div>
              <button type="button" className={buttonClass.outline} disabled={busy} onClick={() => void act(() => vendorApi.status.remove(p.id))}>
                {t("status.remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
