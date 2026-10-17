import "i18next";
import type { resources } from "@streeteats/shared/i18n";

// Type-checks translation keys: t("home.vendorTitle"), t("errors:not_found").
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: (typeof resources)["en"];
  }
}
