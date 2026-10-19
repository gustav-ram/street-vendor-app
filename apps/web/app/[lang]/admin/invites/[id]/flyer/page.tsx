import type { Metadata } from "next";
import { Suspense } from "react";
import { Flyer } from "@/components/admin/Flyer";

export const metadata: Metadata = { title: "StreetEats flyer", robots: { index: false } };

type Params = PageProps<"/[lang]/admin/invites/[id]/flyer">["params"];

// The invite id is request-time data, so it's read inside Suspense.
async function FlyerForParams({ params }: { params: Params }) {
  const { lang, id } = await params;
  return <Flyer lang={lang} id={id} />;
}

export default function FlyerPage({ params }: PageProps<"/[lang]/admin/invites/[id]/flyer">) {
  return (
    <Suspense>
      <FlyerForParams params={params} />
    </Suspense>
  );
}
