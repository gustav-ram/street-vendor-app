import { Suspense } from "react";
import { VendorProfileView } from "@/components/vendor/VendorProfileView";

export default function VendorPage({ params }: PageProps<"/[lang]/v/[id]">) {
  // The id is runtime data under Cache Components, so it resolves inside Suspense.
  return (
    <Suspense fallback={<div className="mx-auto w-full max-w-3xl p-6 text-ink-soft">…</div>}>
      {params.then(({ id }) => (
        <VendorProfileView id={id} />
      ))}
    </Suspense>
  );
}
