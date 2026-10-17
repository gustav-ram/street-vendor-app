"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { API_URL } from "@/lib/api";

export function ServerStatus() {
  const { t } = useTranslation();
  const [state, setState] = useState<"checking" | "ok" | "down">("checking");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/health`, { signal: controller.signal })
      .then((r) => setState(r.ok ? "ok" : "down"))
      .catch(() => {
        if (!controller.signal.aborted) setState("down");
      });
    return () => controller.abort();
  }, []);

  const label = state === "checking" ? t("status.loading") : state === "ok" ? t("status.serverOk") : t("status.serverDown");
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-ink-soft">
      <span
        aria-hidden
        className={`inline-block size-3 rounded-full ${
          state === "ok" ? "bg-live" : state === "down" ? "bg-chile" : "bg-ink-soft"
        }`}
      />
      {label}
    </p>
  );
}
