"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminApi, useAuth } from "@/lib/auth";
import { buttonClass, Notice } from "../ui";

/**
 * A print-ready, bilingual Letter flyer for one invite code: big text, the
 * three-step pitch and a QR code to the join page. The QR code is drawn here
 * in the browser; no outside service sees the link.
 */
export function Flyer({ lang, id }: { lang: string; id: string }) {
  const { i18n } = useTranslation();
  const { t: tad } = useTranslation("admin");
  const { status, me } = useAuth();
  const isAdmin = status === "signedIn" && me?.role === "admin";
  const invite = useQuery({ queryKey: ["admin", "invite", id], queryFn: () => adminApi.invite(id), enabled: isAdmin });
  const [svg, setSvg] = useState<string | null>(null);
  const en = i18n.getFixedT("en", "auth");
  const es = i18n.getFixedT("es", "auth");
  const url = invite.data && typeof window !== "undefined" ? `${window.location.origin}/join?code=${invite.data.code}` : null;

  useEffect(() => {
    if (!url) return;
    void QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1a1410", light: "#ffffff" } }).then(setSvg);
  }, [url]);

  if (status === "loading" || (isAdmin && invite.isPending)) return <main className="p-6" />;
  if (!isAdmin || !invite.data) return <main className="mx-auto max-w-lg p-6"><Notice tone="warn">{tad("adminsOnly")}</Notice></main>;

  return (
    <main className="flyer-page mx-auto flex w-full max-w-[8.5in] flex-col gap-4 p-4 print:p-0">
      <div className="flex flex-wrap gap-2 print:hidden">
        <button type="button" className={buttonClass.primary} onClick={() => window.print()}>
          🖨 {tad("invites.print")}
        </button>
        <Link href={`/${lang}/admin`} className={buttonClass.outline}>
          ← {tad("invites.back")}
        </Link>
      </div>

      <article className="flyer flex min-h-[10in] flex-col justify-between gap-6 rounded-3xl border-4 border-ink bg-white p-10 text-ink print:rounded-none print:border-0">
        <header className="flex flex-col gap-2">
          <p className="text-3xl font-black text-chile">StreetEats</p>
          <h1 className="text-5xl leading-tight font-black">{en("join.title")}</h1>
          <p className="text-4xl leading-tight font-black text-ink-soft" lang="es">
            {es("join.title")}
          </p>
        </header>

        <ol className="flex flex-col gap-4">
          {(["step1", "step2", "step3"] as const).map((s, i) => (
            <li key={s} className="flex items-center gap-5">
              <span className="grid size-16 shrink-0 place-items-center rounded-full bg-chile text-4xl font-black text-white print:border-4 print:border-chile">
                {i + 1}
              </span>
              <span className="flex flex-col">
                <span className="text-4xl font-black">{en(`join.${s}`)}</span>
                <span className="text-3xl font-bold text-ink-soft" lang="es">
                  {es(`join.${s}`)}
                </span>
              </span>
            </li>
          ))}
        </ol>

        <div className="flex items-center gap-8">
          {/* SVG made here by the qrcode library from our own URL. */}
          <div className="size-[2.6in] shrink-0" dangerouslySetInnerHTML={svg ? { __html: svg } : undefined} aria-label={url ?? undefined} role="img" />
          <div className="flex flex-col gap-3">
            <p className="text-3xl font-black">
              {en("join.scan")}
              <br />
              <span className="text-ink-soft" lang="es">
                {es("join.scan")}
              </span>
            </p>
            <p className="text-2xl font-bold">
              {en("join.code")} / {es("join.code")}: <span className="font-mono tracking-wider">{invite.data.code}</span>
            </p>
            <p className="text-lg break-all text-ink-soft">{url}</p>
          </div>
        </div>

        <footer className="flex flex-col gap-1 border-t-4 border-ink pt-4 text-xl">
          <p className="font-bold">{en("join.noId")}</p>
          <p className="font-bold text-ink-soft" lang="es">
            {es("join.noId")}
          </p>
        </footer>
      </article>
    </main>
  );
}
