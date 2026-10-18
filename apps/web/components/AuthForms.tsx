"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LIMITS, type UiLocale } from "@streeteats/shared";
import { ApiRequestError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { buttonClass, Choice, Field, Notice } from "./ui";

function useErrorText() {
  const { t } = useTranslation("errors");
  return (err: unknown) => t(err instanceof ApiRequestError ? err.code : "internal");
}

export function LoginForm({ lang }: { lang: string }) {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const { signIn } = useAuth();
  const errorText = useErrorText();
  const [usePhone, setUsePhone] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-10"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const me = await signIn(usePhone ? { phone: identifier.trim() } : { email: identifier.trim() }, secret);
          router.push(me.role === "vendor" ? `/${lang}/vendor` : `/${lang}`);
        } catch (err) {
          setError(errorText(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h1 className="text-4xl font-black">{t("welcome")}</h1>
      <Field
        label={usePhone ? t("phone") : t("email")}
        type={usePhone ? "tel" : "email"}
        autoComplete={usePhone ? "tel" : "username"}
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        required
      />
      <button type="button" className="w-fit font-bold text-chile" onClick={() => setUsePhone((p) => !p)}>
        {usePhone ? t("useEmail") : t("usePhone")}
      </button>
      <Field
        label={`${t("credentialPassword")} / ${t("credentialPin")}`}
        type="password"
        autoComplete="current-password"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        required
      />
      {error && <Notice tone="error">{error}</Notice>}
      <button type="submit" disabled={busy} className={buttonClass.primary}>
        {t("signIn")}
      </button>
      <Link href={`/${lang}/signup`} className="font-bold text-chile">
        {t("noAccount")}
      </Link>
    </form>
  );
}

export function SignupForm({ lang }: { lang: string }) {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const params = useSearchParams();
  const { signUp } = useAuth();
  const errorText = useErrorText();
  const [role, setRole] = useState<"customer" | "vendor">(params.get("role") === "vendor" ? "vendor" : "customer");
  const [usePhone, setUsePhone] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [kind, setKind] = useState<"password" | "pin">("password");
  const [secret, setSecret] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState(params.get("code") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pin = role === "vendor" && kind === "pin";

  return (
    <form
      className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-10"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await signUp({
            role,
            ...(usePhone ? { phone: identifier.trim() } : { email: identifier.trim() }),
            credential: { kind: role === "vendor" ? kind : "password", secret },
            displayName: role === "customer" && displayName.trim() ? displayName.trim() : undefined,
            locale: lang as UiLocale,
            inviteCode: inviteCode.trim() || undefined,
          });
          router.push(role === "vendor" ? `/${lang}/vendor/start` : `/${lang}`);
        } catch (err) {
          setError(errorText(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h1 className="text-4xl font-black">{t("signUpTitle")}</h1>
      <span className="text-lg font-extrabold">{t("iAmA")}</span>
      <Choice
        name="role"
        value={role}
        onChange={setRole}
        options={[
          { value: "customer", label: t("roleCustomer") },
          { value: "vendor", label: t("roleVendor") },
        ]}
      />
      {role === "vendor" && <Notice>{t("assistedHint")}</Notice>}
      <Field
        label={usePhone ? t("phone") : t("email")}
        type={usePhone ? "tel" : "email"}
        autoComplete={usePhone ? "tel" : "username"}
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        required
      />
      <button type="button" className="w-fit font-bold text-chile" onClick={() => setUsePhone((p) => !p)}>
        {usePhone ? t("useEmail") : t("usePhone")}
      </button>
      {role === "vendor" && (
        <Choice
          name="kind"
          value={kind}
          onChange={(k) => {
            setKind(k);
            setSecret("");
          }}
          options={[
            { value: "password", label: t("credentialPassword") },
            { value: "pin", label: t("credentialPin"), hint: t("pinHint") },
          ]}
        />
      )}
      <Field
        label={pin ? t("pin") : t("password")}
        hint={pin ? undefined : t("passwordHint", { count: LIMITS.passwordMin })}
        type="password"
        inputMode={pin ? "numeric" : undefined}
        autoComplete="new-password"
        minLength={pin ? LIMITS.pinLength : LIMITS.passwordMin}
        maxLength={pin ? LIMITS.pinLength : LIMITS.passwordMax}
        value={secret}
        onChange={(e) => setSecret(pin ? e.target.value.replace(/\D/g, "") : e.target.value)}
        required
      />
      {role === "customer" && (
        <Field label={t("displayName")} value={displayName} maxLength={LIMITS.displayNameMax} onChange={(e) => setDisplayName(e.target.value)} />
      )}
      <Field label={t("inviteCode")} value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} autoCapitalize="characters" />
      <Notice>{t("privacyNote")}</Notice>
      {error && <Notice tone="error">{error}</Notice>}
      <button type="submit" disabled={busy} className={buttonClass.primary}>
        {t("signUp")}
      </button>
      <Link href={`/${lang}/login`} className="font-bold text-chile">
        {t("haveAccount")}
      </Link>
    </form>
  );
}
