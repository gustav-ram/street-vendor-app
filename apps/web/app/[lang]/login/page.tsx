import { LoginForm } from "@/components/AuthForms";

export default async function LoginPage({ params }: PageProps<"/[lang]/login">) {
  const { lang } = await params;
  return <LoginForm lang={lang} />;
}
