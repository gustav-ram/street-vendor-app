"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { centsToInput, LIMITS, type MyMenuItem, type MyVendor, parsePriceToCents } from "@streeteats/shared";
import { vendorApi } from "@/lib/auth";
import { useFormat } from "@/lib/hooks/useFormat";
import { useMyVendorCache } from "@/lib/hooks/useMyVendor";
import { buttonClass, Field, Notice, Panel } from "../ui";

/** Menu with one-click "sold out". Changes show at once and are then sent to the server. */
export function MenuEditor({ vendor }: { vendor: MyVendor }) {
  const { t } = useTranslation("dashboard");
  const { t: te } = useTranslation("errors");
  const f = useFormat();
  const cache = useMyVendorCache();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const patchMenu = (fn: (menu: MyMenuItem[]) => MyMenuItem[]) => cache.patch((v) => ({ ...v, menu: fn(v.menu) }));

  async function run(change: () => Promise<unknown>) {
    setError(null);
    try {
      await change();
    } catch {
      setError(te("network"));
    } finally {
      void cache.refetch();
    }
  }

  const save = (item: MyMenuItem) => {
    setEditing(null);
    patchMenu((menu) => (menu.some((m) => m.id === item.id) ? menu.map((m) => (m.id === item.id ? item : m)) : [...menu, item]));
    void run(() =>
      vendorApi.menu.put(item.id, {
        name: item.name,
        description: item.description,
        priceCents: item.priceCents,
        soldOut: item.soldOut,
        clientUpdatedAt: item.clientUpdatedAt,
      }),
    );
  };

  const remove = (id: string) => {
    setEditing(null);
    patchMenu((menu) => menu.filter((m) => m.id !== id));
    void run(() => vendorApi.menu.remove(id));
  };

  const setSoldOut = (item: MyMenuItem, soldOut: boolean) => {
    patchMenu((menu) => menu.map((m) => (m.id === item.id ? { ...m, soldOut } : m)));
    void run(() => vendorApi.menu.soldOut(item.id, soldOut));
  };

  return (
    <Panel title={<>🍽️ {t("actions.menu")}</>}>
      {error && <Notice tone="error">{error}</Notice>}
      {vendor.menu.length === 0 && editing !== "new" && <p className="text-lg text-ink-soft">{t("menu.empty")}</p>}
      <ul className="flex flex-col gap-2">
        {vendor.menu.map((item) =>
          editing === item.id ? (
            <li key={item.id}>
              <ItemForm item={item} onCancel={() => setEditing(null)} onSave={save} onDelete={() => remove(item.id)} />
            </li>
          ) : (
            <li key={item.id} className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-white p-4">
              <button type="button" className="flex min-w-0 flex-1 flex-col items-start text-left" onClick={() => setEditing(item.id)}>
                <span className={`text-lg font-extrabold break-words ${item.soldOut ? "text-ink-soft line-through" : ""}`}>{item.name}</span>
                <span className="font-bold text-ink-soft">
                  {f.price(item.priceCents)}
                  <span className="ml-2 font-normal text-chile underline underline-offset-2">{t("menu.edit")}</span>
                </span>
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={!item.soldOut}
                aria-label={`${item.name}: ${t("menu.available")}`}
                onClick={() => setSoldOut(item, !item.soldOut)}
                className={`min-h-12 w-36 shrink-0 rounded-full border-2 px-3 font-black ${
                  item.soldOut ? "border-chile bg-chile text-white" : "border-live bg-white text-live"
                }`}
              >
                {item.soldOut ? `✕ ${t("menu.soldOut")}` : `✓ ${t("menu.available")}`}
              </button>
            </li>
          ),
        )}
      </ul>
      {editing === "new" ? (
        <ItemForm item={null} onCancel={() => setEditing(null)} onSave={save} />
      ) : (
        <button type="button" className={buttonClass.outline} onClick={() => setEditing("new")}>
          {t("menu.add")}
        </button>
      )}
    </Panel>
  );
}

function ItemForm({
  item,
  onCancel,
  onSave,
  onDelete,
}: {
  item: MyMenuItem | null;
  onCancel: () => void;
  onSave: (item: MyMenuItem) => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation("dashboard");
  const { t: tc } = useTranslation();
  const [name, setName] = useState(item?.name ?? "");
  const [price, setPrice] = useState(item ? centsToInput(item.priceCents) : "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cents = parsePriceToCents(price);

  return (
    <form
      className="flex flex-col gap-3 rounded-2xl border-2 border-ink bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || cents === null) return;
        onSave({
          id: item?.id ?? crypto.randomUUID(),
          name: name.trim(),
          description: description.trim(),
          priceCents: cents,
          soldOut: item?.soldOut ?? false,
          sortOrder: item?.sortOrder ?? 999,
          clientUpdatedAt: new Date().toISOString(),
        });
      }}
    >
      <h3 className="text-xl font-black">{item ? t("menu.edit") : t("menu.new")}</h3>
      <Field label={t("menu.name")} value={name} onChange={(e) => setName(e.target.value)} maxLength={LIMITS.menuItemNameMax} autoFocus spellCheck={false} required />
      <Field
        label={t("menu.price")}
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        inputMode="decimal"
        aria-invalid={price !== "" && cents === null}
        required
      />
      <Field label={t("menu.description")} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={LIMITS.menuItemDescriptionMax} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={buttonClass.primary} disabled={!name.trim() || cents === null}>
          {t("menu.save")}
        </button>
        <button type="button" className={buttonClass.outline} onClick={onCancel}>
          {tc("actions.cancel")}
        </button>
        {onDelete && (
          <button
            type="button"
            className={`${confirmDelete ? buttonClass.danger : buttonClass.outline} ml-auto`}
            onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
          >
            🗑 {confirmDelete ? `${t("menu.delete")}?` : t("menu.delete")}
          </button>
        )}
      </div>
    </form>
  );
}
