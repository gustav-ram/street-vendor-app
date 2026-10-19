"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { accountApi, useAuth } from "@/lib/auth";
import { goOffline, isLiveHere } from "@/lib/live";
import { useErrorText } from "../community/dialogs";
import { buttonClass, Field, Notice, Panel } from "../ui";

/** My account: who you're signed in as, your privacy, download your data, delete your account. */
export function AccountView({ lang }: { lang: string }) {
  const { t } = useTranslation("account");
  const { t: ta } = useTranslation("auth");
  const { t: tc } = useTranslation();
  const { t: td } = useTranslation("dashboard");
  const { status, me, signOut, forget } = useAuth();
  const errorText = useErrorText();
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [secret, setSecret] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (deleted) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
        <Notice>{t("delete.done")}</Notice>
        <Link href={`/${lang}`} className={buttonClass.dark}>
          {tc("nav.map")}
        </Link>
      </main>
    );
  }
  if (status === "loading") return <main className="mx-auto max-w-2xl p-6 text-ink-soft">{tc("status.loading")}</main>;
  if (status !== "signedIn" || !me) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-10">
        <h1 className="text-4xl font-black">{t("title")}</h1>
        <Link href={`/${lang}/login`} className={buttonClass.primary}>
          {ta("signIn")}
        </Link>
        <Link href={`/${lang}/privacy`} className="font-bold text-chile hover:underline">
          🔒 {tc("nav.privacy")}
        </Link>
      </main>
    );
  }

  async function download() {
    setExporting(true);
    setError(null);
    try {
      const url = await accountApi.exportUrl();
      const a = document.createElement("a");
      a.href = url;
      a.download = `streeteats-export-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setExportDone(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setExporting(false);
    }
  }

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      // Close the stand properly first, so this page stops sending its location.
      if (isLiveHere()) await goOffline();
      await accountApi.remove(secret);
      forget();
      setDeleted(true);
    } catch (err) {
      setError(errorText(err));
      setDeleting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <h1 className="text-4xl font-black">{t("title")}</h1>
      {error && <Notice tone="error">{error}</Notice>}

      <Panel title={ta("signedInAs")}>
        {me.displayName && <p className="text-xl font-bold">{me.displayName}</p>}
        <div className="flex flex-wrap gap-2">
          {me.role === "vendor" && (
            <Link href={`/${lang}/vendor`} className={buttonClass.primary}>
              {td("title")}
            </Link>
          )}
          <Link href={`/${lang}/privacy`} className={buttonClass.outline}>
            🔒 {tc("nav.privacy")}
          </Link>
          <button
            type="button"
            className={buttonClass.outline}
            onClick={async () => {
              if (isLiveHere()) await goOffline();
              await signOut();
            }}
          >
            {ta("signOut")}
          </button>
        </div>
      </Panel>

      <Panel title={<>📦 {t("export.title")}</>}>
        <p className="text-lg">{t("export.body")}</p>
        <button type="button" className={`${buttonClass.dark} w-fit`} disabled={exporting} onClick={() => void download()}>
          {exporting ? t("export.working") : `⬇ ${t("export.button")}`}
        </button>
        {exportDone && <Notice>{t("export.done")}</Notice>}
      </Panel>

      <Panel title={<>🗑 {t("delete.title")}</>} className="border-chile/40">
        <p className="text-lg">{t("delete.body")}</p>
        {me.role === "vendor" && <p className="text-lg font-bold">{t("delete.vendorNote")}</p>}
        {confirming ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (secret) void remove();
            }}
          >
            <Field label={t("delete.secret")} type="password" autoComplete="current-password" value={secret} onChange={(e) => setSecret(e.target.value)} autoFocus />
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={buttonClass.danger} disabled={!secret || deleting}>
                {deleting ? t("delete.working") : t("delete.button")}
              </button>
              <button type="button" className={buttonClass.outline} onClick={() => setConfirming(false)}>
                {tc("actions.cancel")}
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className={`${buttonClass.outline} w-fit border-chile text-chile`} onClick={() => setConfirming(true)}>
            {t("delete.title")}…
          </button>
        )}
      </Panel>
    </main>
  );
}
