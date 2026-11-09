import type { ReactNode } from "react";
import { KIND_CONFIG, type FileKind } from "../lib/organizer/types";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger" | "accent";
}) {
  return <span className={`badge ${tone === "neutral" ? "" : tone}`}>{children}</span>;
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
  hint?: string;
}) {
  return (
    <label className="switch" title={hint}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { id: T; label: string }[];
  ariaLabel?: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button key={option.id} type="button" aria-pressed={value === option.id} onClick={() => onChange(option.id)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function KindDot({ kind }: { kind: FileKind }) {
  return <span className="kinddot" style={{ background: KIND_CONFIG[kind].color }} aria-hidden="true" />;
}

export function FileGlyph({ kind, children }: { kind: FileKind; children?: ReactNode }) {
  return (
    <span className="fileglyph" style={{ color: KIND_CONFIG[kind].color }} aria-hidden="true">
      {children ?? KIND_CONFIG[kind].glyph}
    </span>
  );
}

export function Empty({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {hint ? <div className="hint" style={{ maxWidth: 300 }}>{hint}</div> : null}
      {action}
    </div>
  );
}

export function Spinner() {
  return <span className="spin" aria-hidden="true" />;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="row" style={{ justifyContent: "space-between" }}>
      <span className="label">{children}</span>
      {right}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
