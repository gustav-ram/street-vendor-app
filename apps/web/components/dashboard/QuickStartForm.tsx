"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CATEGORIES,
  CATEGORY_EMOJI,
  type Category,
  LIMITS,
  PAYMENT_METHODS,
  type PaymentMethod,
  parsePriceToCents,
} from "@streeteats/shared";
import { ApiRequestError } from "@/lib/api";
import { vendorApi } from "@/lib/auth";
import { useMyVendorCache } from "@/lib/hooks/useMyVendor";
import { buttonClass, Chip, Field, inputClass, Notice, toggle } from "../ui";

interface Row {
  id: string;
  name: string;
  price: string;
}

const newRow = (): Row => ({ id: crypto.randomUUID(), name: "", price: "" });

/** Get a vendor on the map in under two minutes: name, what, a few items, how to pay. */
export function QuickStartForm({ lang }: { lang: string }) {
  const { t } = useTranslation("dashboard");
  const { t: tc } = useTranslation("catalog");
  const { t: te } = useTranslation("errors");
  const router = useRouter();
  const cache = useMyVendorCache();
  const [name, setName] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<Row[]>(() => [newRow(), newRow()]);
  const [payments, setPayments] = useState<PaymentMethod[]>(["cash"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const menu = rows
    .map((r) => ({ id: r.id, name: r.name.trim(), priceCents: parsePriceToCents(r.price) }))
    .filter((r): r is { id: string; name: string; priceCents: number } => r.name.length > 0 && r.priceCents !== null);
  const ready = name.trim().length >= 2 && categories.length > 0 && menu.length > 0 && payments.length > 0;
  const setRow = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <form
      className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready) return;
        setBusy(true);
        setError(null);
        try {
          const created = await vendorApi.quickStart({
            displayName: name.trim(),
            categories,
            menu,
            paymentMethods: payments,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          });
          cache.set(created);
          router.replace(`/${lang}/vendor`);
        } catch (err) {
          const code = err instanceof ApiRequestError ? err.code : "internal";
          if (code === "already_onboarded") return router.replace(`/${lang}/vendor`);
          setError(te(code));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-black">{t("quickStart.title")}</h1>
        <p className="text-lg text-ink-soft">{t("quickStart.intro")}</p>
      </div>

      <Field
        label={`1. ${t("quickStart.nameLabel")}`}
        hint={t("quickStart.nameHint")}
        placeholder={t("quickStart.namePlaceholder")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={LIMITS.displayNameMax}
        autoComplete="organization"
        spellCheck={false}
        required
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-lg font-extrabold">2. {t("quickStart.categoryLabel")}</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Chip key={c} on={categories.includes(c)} onClick={() => setCategories(toggle(categories, c, 3))}>
              <span aria-hidden>{CATEGORY_EMOJI[c]}</span> {tc(`categories.${c}`)}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-lg font-extrabold">3. {t("quickStart.menuLabel")}</legend>
        {rows.map((r, i) => (
          <div key={r.id} className="flex items-center gap-2">
            <input
              className={`${inputClass} min-w-0 flex-1`}
              placeholder={i === 0 ? t("quickStart.itemNamePlaceholder") : t("quickStart.itemName")}
              aria-label={`${t("quickStart.itemName")} ${i + 1}`}
              value={r.name}
              maxLength={LIMITS.menuItemNameMax}
              spellCheck={false}
              onChange={(e) => setRow(r.id, { name: e.target.value })}
            />
            <input
              className={`${inputClass} w-28`}
              placeholder="$"
              inputMode="decimal"
              aria-label={`${t("quickStart.itemPrice")} ${i + 1}`}
              aria-invalid={r.price !== "" && parsePriceToCents(r.price) === null}
              value={r.price}
              onChange={(e) => setRow(r.id, { price: e.target.value })}
            />
            {rows.length > 1 && (
              <button
                type="button"
                className="grid size-12 shrink-0 place-items-center rounded-full text-2xl text-ink-soft hover:bg-sand"
                aria-label={`${t("quickStart.removeItem")} ${i + 1}`}
                onClick={() => setRows(rows.filter((x) => x.id !== r.id))}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {rows.length < 10 && (
          <button type="button" className="w-fit font-bold text-chile" onClick={() => setRows([...rows, newRow()])}>
            {t("quickStart.addItem")}
          </button>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-lg font-extrabold">4. {t("quickStart.paymentLabel")}</legend>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_METHODS.map((m) => (
            <Chip key={m} on={payments.includes(m)} onClick={() => setPayments(toggle(payments, m))}>
              {tc(`payments.${m}`)}
            </Chip>
          ))}
        </div>
        <p className="text-ink-soft">{t("quickStart.paymentHint")}</p>
      </fieldset>

      {error && <Notice tone="error">{error}</Notice>}
      <button type="submit" disabled={!ready || busy} className={`${buttonClass.primary} min-h-16 text-xl`}>
        {busy ? t("quickStart.saving") : t("quickStart.submit")}
      </button>
    </form>
  );
}
