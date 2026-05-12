// Friday form primitives — Panel, Field, TextInput, Select, ToggleRow,
// RadioGroup. Used by Settings and any future settings-style screen
// (e.g. project settings, team admin). Keep generic; do not bake in
// Settings-specific logic.

"use client";

import * as React from "react";
import { cn } from "@/ui/utils";
import { I } from "@/ui/friday/icons";

// ─── Panel ─────────────────────────────────────────────────────────
interface PanelProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  dirty?: boolean;
  /**
   * Save handler. If it returns a Promise, Panel tracks pending state
   * internally — button shows "Saving…", disables to block double-
   * clicks, and re-enables on resolve/reject. No callers need to
   * manually wire `saving` state for that case.
   */
  onSave?: () => void | Promise<unknown>;
  onCancel?: () => void;
  className?: string;
}

export function Panel({
  title,
  description,
  children,
  footer,
  dirty,
  onSave,
  onCancel,
  className,
}: PanelProps) {
  const showFooter = footer || onSave;
  const [saving, setSaving] = React.useState(false);

  const handleSave = React.useCallback(async () => {
    if (!onSave || saving) return;
    const result = onSave();
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setSaving(true);
      try {
        await result;
      } finally {
        setSaving(false);
      }
    }
  }, [onSave, saving]);

  const buttonLabel = saving ? "Saving…" : dirty ? "Save changes" : "Saved";
  const buttonDisabled = !dirty || saving;

  return (
    <section
      className={cn(
        "bg-friday-bg border border-friday-border-soft rounded-md mb-5 overflow-hidden",
        className,
      )}
    >
      <div className="px-6 pt-5 pb-4 border-b border-friday-border-soft">
        <h2 className="font-display italic text-[22px] leading-tight tracking-tight text-friday-fg m-0">
          {title}
        </h2>
        {description ? (
          <p className="text-[12px] text-friday-fg-muted mt-1 leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      <div className="px-6 py-5">{children}</div>
      {showFooter ? (
        <div className="px-5 py-3 border-t border-friday-border-soft bg-friday-surface flex items-center justify-end gap-2">
          {footer}
          {dirty && onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="h-[30px] px-3 bg-transparent text-friday-fg-muted border border-friday-border-soft rounded-[3px] text-[11.5px] cursor-pointer hover:text-friday-fg transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          ) : null}
          {onSave ? (
            <button
              type="button"
              onClick={handleSave}
              disabled={buttonDisabled}
              className={cn(
                "h-[30px] px-[14px] rounded-[3px] text-[11.5px] font-medium tracking-wide transition-colors duration-100 active:scale-[0.98]",
                buttonDisabled
                  ? "bg-friday-surface-2 text-friday-fg-subtle cursor-default"
                  : "bg-friday-accent text-white cursor-pointer hover:opacity-90",
              )}
            >
              {buttonLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// ─── Field ─────────────────────────────────────────────────────────
interface FieldProps {
  label: string;
  hint?: string;
  span?: 1 | 2;
  children: React.ReactNode;
}

export function Field({ label, hint, span = 1, children }: FieldProps) {
  return (
    <div className={span === 2 ? "col-span-2" : ""}>
      <label className="block text-[9.5px] font-semibold uppercase tracking-[0.18em] text-friday-fg-muted mb-1.5">
        {label}
      </label>
      {children}
      {hint ? (
        <p className="text-[11px] text-friday-fg-subtle mt-1.5 leading-snug">{hint}</p>
      ) : null}
    </div>
  );
}

// ─── TextInput ─────────────────────────────────────────────────────
interface TextInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  disabled?: boolean;
}

export function TextInput({ value, onChange, placeholder, mono, disabled }: TextInputProps) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(
        "w-full h-8 px-[11px] bg-friday-bg text-friday-fg border border-friday-border-soft rounded-[3px] outline-none",
        "focus:border-friday-accent focus:ring-2 focus:ring-friday-accent-ring focus:ring-offset-2 focus:ring-offset-friday-bg",
        "disabled:opacity-60",
        "transition-[border-color,box-shadow] duration-150",
        mono ? "font-mono text-[11.5px]" : "text-[12px]",
      )}
    />
  );
}

// ─── Select ────────────────────────────────────────────────────────
interface SelectOption {
  v: string;
  l: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
  disabled?: boolean;
}

export function Select({ value, options, onChange, disabled }: SelectProps) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          "w-full h-8 pl-[11px] pr-7 bg-friday-bg text-friday-fg border border-friday-border-soft rounded-[3px] outline-none",
          "appearance-none cursor-pointer text-[12px]",
          "disabled:opacity-60 disabled:cursor-default",
          "focus:border-friday-accent focus:ring-2 focus:ring-friday-accent-ring",
        )}
      >
        {options.map((o) => (
          <option key={o.v} value={o.v} disabled={o.disabled}>
            {o.l}
          </option>
        ))}
      </select>
      <I.ChevDown
        size={10}
        className="absolute right-[11px] top-1/2 -translate-y-1/2 text-friday-fg-muted pointer-events-none"
      />
    </div>
  );
}

// ─── ToggleRow ─────────────────────────────────────────────────────
interface ToggleRowProps {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

export function ToggleRow({ label, hint, value, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center gap-3.5 min-h-9 px-3 py-2 bg-friday-surface rounded-[3px]">
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] text-friday-fg font-medium">{label}</div>
        {hint ? (
          <div className="text-[10.5px] text-friday-fg-muted mt-0.5">{hint}</div>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={cn(
          "relative w-[30px] h-[18px] rounded-full border-0 cursor-pointer transition-colors duration-150",
          value ? "bg-friday-accent" : "bg-friday-surface-3",
        )}
      >
        <span
          className="absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-[left] duration-150"
          style={{
            left: value ? 14 : 2,
            boxShadow: "0 1px 2px rgba(20,18,12,0.25)",
          }}
        />
      </button>
    </div>
  );
}

// ─── RadioGroup ────────────────────────────────────────────────────
interface RadioOption {
  v: string;
  l: string;
}

interface RadioGroupProps {
  value: string;
  options: RadioOption[];
  onChange: (v: string) => void;
}

export function RadioGroup({ value, options, onChange }: RadioGroupProps) {
  return (
    <div className="flex gap-1.5">
      {options.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={cn(
              "flex-1 h-[38px] rounded-[3px] border cursor-pointer text-[12.5px] transition-colors duration-150",
              active
                ? "bg-friday-fg text-friday-bg border-friday-fg font-medium"
                : "bg-friday-bg text-friday-fg border-friday-border-soft hover:border-friday-fg-muted",
            )}
          >
            {o.l}
          </button>
        );
      })}
    </div>
  );
}
