"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CATEGORIES, CATEGORY_EMOJI, LANGUAGES, PAYMENT_METHODS, RADIUS_OPTIONS_M } from "@streeteats/shared";
import { useFormat } from "@/lib/hooks/useFormat";
import type { ExploreFilters } from "./types";

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-11 rounded-full border-2 px-4 font-bold ${on ? "border-ink bg-ink text-white" : "border-ink/25 bg-white hover:border-ink"}`}
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-lg font-extrabold">{title}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

export function FiltersDialog({
  open,
  value,
  defaults,
  onClose,
  onApply,
}: {
  open: boolean;
  value: ExploreFilters;
  defaults: ExploreFilters;
  onClose: () => void;
  onApply: (f: ExploreFilters) => void;
}) {
  const { t } = useTranslation("search");
  const { t: tc } = useTranslation("catalog");
  const f = useFormat();
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setDraft(value);
      dialog.showModal();
    } else if (!open && dialog.open) dialog.close();
  }, [open, value]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto max-h-[90dvh] w-[min(640px,100vw-1rem)] rounded-3xl bg-paper p-0 text-ink backdrop:bg-ink/50"
    >
      <div className="flex max-h-[90dvh] flex-col">
        <div className="flex items-center justify-between border-b-2 border-sand px-5 py-4">
          <h2 className="text-2xl font-black">{t("filters")}</h2>
          <button type="button" onClick={onClose} aria-label={t("actions.close", { ns: "common" })} className="grid size-11 place-items-center text-3xl">
            ×
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
          <label className="flex items-center justify-between gap-4 rounded-2xl bg-white p-4">
            <span>
              <span className="block text-lg font-extrabold">{t("openNow")}</span>
              <span className="text-sm text-ink-soft">{t("openNowHint")}</span>
            </span>
            <input
              type="checkbox"
              className="size-7 accent-live"
              checked={draft.openNow}
              onChange={(e) => setDraft({ ...draft, openNow: e.target.checked })}
            />
          </label>
          <Section title={t("radius")}>
            {RADIUS_OPTIONS_M.map((m) => (
              <Chip key={m} on={draft.radiusM === m} onClick={() => setDraft({ ...draft, radiusM: m })}>
                {f.radius(m)}
              </Chip>
            ))}
          </Section>
          <Section title={t("category")}>
            {CATEGORIES.map((c) => (
              <Chip key={c} on={draft.categories.includes(c)} onClick={() => setDraft({ ...draft, categories: toggle(draft.categories, c) })}>
                <span aria-hidden>{CATEGORY_EMOJI[c]} </span>
                {tc(`categories.${c}`)}
              </Chip>
            ))}
          </Section>
          <Section title={t("price")}>
            {[1, 2, 3].map((p) => (
              <Chip key={p} on={draft.priceLevels.includes(p)} onClick={() => setDraft({ ...draft, priceLevels: toggle(draft.priceLevels, p) })}>
                {"$".repeat(p)}
              </Chip>
            ))}
          </Section>
          <Section title={t("payment")}>
            {PAYMENT_METHODS.map((m) => (
              <Chip key={m} on={draft.paymentMethods.includes(m)} onClick={() => setDraft({ ...draft, paymentMethods: toggle(draft.paymentMethods, m) })}>
                {tc(`payments.${m}`)}
              </Chip>
            ))}
          </Section>
          <Section title={t("languages")}>
            {LANGUAGES.map((l) => (
              <Chip key={l} on={draft.languages.includes(l)} onClick={() => setDraft({ ...draft, languages: toggle(draft.languages, l) })}>
                {tc(`languages.${l}`)}
              </Chip>
            ))}
          </Section>
        </div>
        <div className="flex gap-3 border-t-2 border-sand px-5 py-4">
          <button type="button" onClick={() => setDraft(defaults)} className="min-h-12 rounded-full border-2 border-ink px-5 font-bold">
            {t("reset")}
          </button>
          <button type="button" onClick={() => onApply(draft)} className="min-h-12 flex-1 rounded-full bg-chile px-5 text-lg font-bold text-white">
            {t("apply")}
          </button>
        </div>
      </div>
    </dialog>
  );
}
