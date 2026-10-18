"use client";

import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

export const buttonClass = {
  primary: "inline-flex min-h-12 items-center justify-center rounded-full bg-chile px-6 text-lg font-bold text-white hover:bg-chile-dark disabled:opacity-50",
  dark: "inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-6 text-lg font-bold text-white hover:bg-ink/85 disabled:opacity-50",
  outline: "inline-flex min-h-12 items-center justify-center rounded-full border-2 border-ink bg-white px-6 text-lg font-bold hover:bg-sand disabled:opacity-50",
};

export function Field({ label, hint, ...input }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-lg font-extrabold">{label}</span>
      <input {...input} className="min-h-12 rounded-xl border-2 border-ink bg-white px-3 text-lg placeholder:text-ink-soft" />
      {hint && <span className="text-sm text-ink-soft">{hint}</span>}
    </label>
  );
}

export function TextArea({ label, hint, ...input }: { label: string; hint?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-lg font-extrabold">{label}</span>
      <textarea {...input} className="min-h-24 rounded-xl border-2 border-ink bg-white p-3 text-lg placeholder:text-ink-soft" />
      {hint && <span className="text-sm text-ink-soft">{hint}</span>}
    </label>
  );
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-11 rounded-full border-2 px-4 font-bold ${on ? "border-ink bg-ink text-white" : "border-ink/25 bg-white hover:border-ink"}`}
    >
      {children}
    </button>
  );
}

export function Choice<T extends string>({
  value,
  options,
  onChange,
  name,
}: {
  value: T;
  name: string;
  options: Array<{ value: T; label: string; hint?: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
      {options.map((o) => (
        <label
          key={o.value}
          className={`flex cursor-pointer flex-col gap-0.5 rounded-2xl border-2 border-ink p-4 ${o.value === value ? "bg-ink text-white" : "bg-white"}`}
        >
          <span className="flex items-center gap-2 text-lg font-extrabold">
            <input type="radio" name={name} className="size-5" checked={o.value === value} onChange={() => onChange(o.value)} />
            {o.label}
          </span>
          {o.hint && <span className={o.value === value ? "text-white/85" : "text-ink-soft"}>{o.hint}</span>}
        </label>
      ))}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error"; children: ReactNode }) {
  const bg = tone === "error" ? "bg-chile/10" : tone === "warn" ? "bg-marigold/25" : "bg-sand";
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 ${bg}`}>
      {children}
    </p>
  );
}

export function toggle<T>(list: T[], item: T, max = 99): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : list.length >= max ? list : [...list, item];
}
