"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { buttonClass, Notice } from "./ui";

const APP_LINK = process.env.NEXT_PUBLIC_APP_LINK ?? "streeteats://";

/**
 * Where a flyer's QR code lands: the three-step pitch, then sign up here or
 * in the app with the invite code filled in. The code only tells us that a
 * flyer worked; it's never linked to the account.
 */
export function JoinView({ lang }: { lang: string }) {
  const { t } = useTranslation("auth");
  const params = useSearchParams();
  const code = (params.get("code") ?? "").trim().toUpperCase().slice(0, 32);
  const check = useQuery({ queryKey: ["invite", code], queryFn: () => api.checkInvite(code), enabled: Boolean(code) });
  const usable = Boolean(code) && check.data?.valid === true;
  const query = new URLSearchParams({ role: "vendor", ...(usable ? { code } : {}) }).toString();

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10">
      <h1 className="text-4xl leading-tight font-black sm:text-5xl">{t("join.title")}</h1>
      <ol className="flex flex-col gap-3">
        {(["step1", "step2", "step3"] as const).map((s, i) => (
          <li key={s} className="flex items-center gap-4 rounded-3xl bg-white p-4 text-2xl font-extrabold">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-chile text-2xl font-black text-white">{i + 1}</span>
            {t(`join.${s}`)}
          </li>
        ))}
      </ol>
      <p className="text-lg text-ink-soft">{t("join.noId")}</p>

      {code && check.isSuccess && (usable ? <Notice>✓ {t("join.codeOk", { code })}</Notice> : <Notice tone="warn">{t("join.codeBad")}</Notice>)}

      <Link href={`/${lang}/signup?${query}`} className={buttonClass.primary}>
        {t("join.web")}
      </Link>
      <div className="flex flex-col gap-1">
        <a href={`${APP_LINK}auth/sign-up?${query}`} className={buttonClass.outline}>
          📱 {t("join.app")}
        </a>
        <span className="text-center text-sm text-ink-soft">{t("join.appHint")}</span>
      </div>
      <Link href={`/${lang}`} className="text-center font-bold text-chile hover:underline">
        {t("join.customer")} →
      </Link>
    </main>
  );
}
