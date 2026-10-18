"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { MyVendor } from "@streeteats/shared";
import { ApiRequestError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useMyVendor } from "@/lib/hooks/useMyVendor";
import { buttonClass, Notice } from "../ui";

function Message({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-10">{children}</div>;
}

type GateProps = { lang: string } & (
  | { mode: "dashboard"; children: (vendor: MyVendor) => ReactNode }
  | { mode: "onboarding"; children: ReactNode }
);

/**
 * Vendor pages need a signed-in vendor. `dashboard` pages also need the quick
 * start done (otherwise they send the vendor there); the quick start page
 * sends vendors who already finished it to the dashboard.
 */
export function VendorGate(props: GateProps) {
  const { lang, mode } = props;
  const { t } = useTranslation("dashboard");
  const { t: tc } = useTranslation();
  const { t: ta } = useTranslation("auth");
  const { t: te } = useTranslation("errors");
  const router = useRouter();
  const { status, me } = useAuth();
  const isVendor = status === "signedIn" && me?.role === "vendor";
  const vendor = useMyVendor(isVendor);
  const needsOnboarding = vendor.error instanceof ApiRequestError && vendor.error.code === "onboarding_required";

  useEffect(() => {
    if (mode === "dashboard" && needsOnboarding) router.replace(`/${lang}/vendor/start`);
    if (mode === "onboarding" && vendor.data) router.replace(`/${lang}/vendor`);
  }, [mode, needsOnboarding, vendor.data, router, lang]);

  if (status === "loading") return <Message>{tc("status.loading")}</Message>;
  if (status === "signedOut") {
    return (
      <Message>
        <h1 className="text-4xl font-black">{t("title")}</h1>
        <p className="text-lg">{t("web.signInNeeded")}</p>
        <Link href={`/${lang}/login`} className={buttonClass.primary}>
          {ta("signIn")}
        </Link>
        <Link href={`/${lang}/signup?role=vendor`} className="font-bold text-chile">
          {ta("noAccount")}
        </Link>
      </Message>
    );
  }
  if (!isVendor) {
    return (
      <Message>
        <Notice tone="warn">{t("web.vendorsOnly")}</Notice>
      </Message>
    );
  }
  if (props.mode === "onboarding") {
    if (needsOnboarding) return props.children;
  } else if (vendor.data) {
    return props.children(vendor.data);
  }
  if (vendor.isError && !needsOnboarding) {
    return (
      <Message>
        <Notice tone="error">{te(vendor.error instanceof ApiRequestError ? vendor.error.code : "internal")}</Notice>
        <button type="button" className={buttonClass.dark} onClick={() => void vendor.refetch()}>
          {tc("actions.retry")}
        </button>
      </Message>
    );
  }
  return <Message>{tc("status.loading")}</Message>;
}
