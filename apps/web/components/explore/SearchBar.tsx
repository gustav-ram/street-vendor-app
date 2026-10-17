"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

export function SearchBar({ initial, onSubmit }: { initial: string; onSubmit: (q: string) => void }) {
  const { t } = useTranslation("search");
  const [value, setValue] = useState(initial);
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value.trim());
      }}
      className="flex items-center gap-2"
    >
      <label className="relative flex-1">
        <span className="sr-only">{t("searchLabel")}</span>
        <span aria-hidden className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-xl">
          🔍
        </span>
        <input
          type="search"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (e.target.value === "") onSubmit("");
          }}
          placeholder={t("searchPlaceholder")}
          maxLength={80}
          enterKeyHint="search"
          className="min-h-14 w-full rounded-full border-2 border-ink bg-white pr-4 pl-12 text-lg placeholder:text-ink-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-marigold"
        />
      </label>
      <button type="submit" className="min-h-14 rounded-full bg-chile px-6 text-lg font-bold text-white hover:bg-chile-dark">
        {t("searchButton")}
      </button>
    </form>
  );
}
