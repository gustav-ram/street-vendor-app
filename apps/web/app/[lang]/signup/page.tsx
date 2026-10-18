import { Suspense } from "react";
import { SignupForm } from "@/components/AuthForms";

export default async function SignupPage({ params }: PageProps<"/[lang]/signup">) {
  const { lang } = await params;
  // The form reads ?role= and ?code= (from invite QR codes), which is request-time data.
  return (
    <Suspense>
      <SignupForm lang={lang} />
    </Suspense>
  );
}
