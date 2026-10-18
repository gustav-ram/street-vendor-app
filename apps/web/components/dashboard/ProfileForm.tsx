"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CATEGORIES,
  CATEGORY_EMOJI,
  type Category,
  LANGUAGES,
  type LanguageCode,
  LIMITS,
  type MyVendor,
  PAYMENT_METHODS,
  type PaymentMethod,
  type Precision,
} from "@streeteats/shared";
import { ApiRequestError } from "@/lib/api";
import { vendorApi } from "@/lib/auth";
import { useMyVendorCache } from "@/lib/hooks/useMyVendor";
import { goOffline, isLiveHere } from "@/lib/live";
import { buttonClass, Chip, Choice, Field, Notice, Panel, Switch, TextArea, toggle } from "../ui";

function ChipGroup({ legend, hint, children }: { legend: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-lg font-extrabold">{legend}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
      {hint && <p className="text-ink-soft">{hint}</p>}
    </fieldset>
  );
}

/** Profile, payment badges, languages, map precision, optional contact and vacation mode. */
export function ProfileForm({ vendor }: { vendor: MyVendor }) {
  const { t } = useTranslation("dashboard");
  const { t: tc } = useTranslation("catalog");
  const { t: te } = useTranslation("errors");
  const cache = useMyVendorCache();
  const [name, setName] = useState(vendor.displayName);
  const [description, setDescription] = useState(vendor.description);
  const [categories, setCategories] = useState<Category[]>(vendor.categories);
  const [payments, setPayments] = useState<PaymentMethod[]>(vendor.paymentMethods);
  const [languages, setLanguages] = useState<LanguageCode[]>(vendor.languages);
  const [precision, setPrecision] = useState<Precision>(vendor.defaultPrecision);
  const [contactText, setContactText] = useState(vendor.contactText ?? "");
  const [contactVisible, setContactVisible] = useState(vendor.contactVisible);
  const [hidden, setHidden] = useState(vendor.hidden);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  const valid = name.trim().length >= 2 && categories.length > 0 && payments.length > 0;

  return (
    <form
      className="flex flex-col gap-6"
      onChange={() => setMessage(null)}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        setMessage(null);
        try {
          // Vacation mode takes the stand off the map; close it here first so this page stops sharing location.
          if (hidden && isLiveHere()) await goOffline();
          const updated = await vendorApi.update({
            displayName: name.trim(),
            description: description.trim(),
            categories,
            paymentMethods: payments,
            languages,
            defaultPrecision: precision,
            contactText: contactText.trim() || null,
            contactVisible: contactVisible && contactText.trim().length > 0,
            hidden,
          });
          cache.set(updated);
          setMessage({ text: t("settings.saved"), tone: "info" });
        } catch (err) {
          setMessage({ text: te(err instanceof ApiRequestError ? err.code : "internal"), tone: "error" });
        } finally {
          setBusy(false);
        }
      }}
    >
      <Panel>
        <Field
          label={t("quickStart.nameLabel")}
          hint={t("quickStart.nameHint")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={LIMITS.displayNameMax}
          spellCheck={false}
          required
        />
        <TextArea
          label={t("settings.description")}
          placeholder={t("settings.descriptionPlaceholder")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={LIMITS.descriptionMax}
        />
        <ChipGroup legend={t("settings.categories")}>
          {CATEGORIES.map((c) => (
            <Chip key={c} on={categories.includes(c)} onClick={() => setCategories(toggle(categories, c, 3))}>
              <span aria-hidden>{CATEGORY_EMOJI[c]}</span> {tc(`categories.${c}`)}
            </Chip>
          ))}
        </ChipGroup>
      </Panel>

      <Panel>
        <ChipGroup legend={t("settings.payments")} hint={t("quickStart.paymentHint")}>
          {PAYMENT_METHODS.map((m) => (
            <Chip key={m} on={payments.includes(m)} onClick={() => setPayments(toggle(payments, m))}>
              {tc(`payments.${m}`)}
            </Chip>
          ))}
        </ChipGroup>
        <ChipGroup legend={t("settings.languages")}>
          {LANGUAGES.map((l) => (
            <Chip key={l} on={languages.includes(l)} onClick={() => setLanguages(toggle(languages, l))}>
              {tc(`languages.${l}`)}
            </Chip>
          ))}
        </ChipGroup>
      </Panel>

      <Panel>
        <span className="text-lg font-extrabold">{t("settings.precision")}</span>
        <Choice
          name="defaultPrecision"
          value={precision}
          onChange={setPrecision}
          options={[
            { value: "approximate", label: t("live.approximate"), hint: t("live.approximateHint") },
            { value: "exact", label: t("live.exact"), hint: t("live.exactHint") },
          ]}
        />
        <Field
          label={t("settings.contact")}
          hint={t("settings.contactHint")}
          value={contactText}
          onChange={(e) => {
            setContactText(e.target.value);
            if (!e.target.value.trim()) setContactVisible(false);
          }}
          maxLength={120}
        />
        <Switch checked={contactVisible} onChange={setContactVisible} label={t("settings.contactShow")} disabled={!contactText.trim()} />
      </Panel>

      <div className="rounded-3xl border-2 border-marigold">
        <Switch checked={hidden} onChange={setHidden} label={<>🏖️ {t("settings.vacation")}</>} hint={t("settings.vacationHint")} />
      </div>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <button type="submit" className={`${buttonClass.primary} min-h-14`} disabled={busy || !valid}>
        {busy ? t("quickStart.saving") : t("settings.save")}
      </button>
    </form>
  );
}
