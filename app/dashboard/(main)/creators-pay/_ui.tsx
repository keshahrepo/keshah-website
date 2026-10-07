"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type CSSProperties, type ReactNode } from "react";
import { fmtMoney as sharedFmtMoney } from "@/lib/creators/time";

// Shared bits for the Creator Pay admin section. Styling mirrors the rest
// of the dashboard: black ground, translucent white cards, 12–13px text.

export const card: CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 12,
  padding: 20,
  marginBottom: 24,
};

export const input: CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  color: "#fff",
  padding: "8px 10px",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
};

export const th: CSSProperties = {
  textAlign: "left",
  fontSize: 11,
  fontWeight: 500,
  color: "rgba(255,255,255,0.4)",
  textTransform: "uppercase",
  letterSpacing: "0.3px",
  padding: "8px 10px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  whiteSpace: "nowrap",
};

export const td: CSSProperties = {
  fontSize: 13,
  padding: "10px",
  borderBottom: "1px solid rgba(255,255,255,0.04)",
  verticalAlign: "top",
};

export const muted: CSSProperties = { color: "rgba(255,255,255,0.4)", fontSize: 12 };
export const h3: CSSProperties = { fontSize: 16, fontWeight: 600, marginBottom: 12 };

export function fmtUsd(cents: number | null | undefined): string {
  const c = cents ?? 0;
  const sign = c < 0 ? "-" : "";
  return `${sign}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * UI money: "$650", "$88.64" (cents only when non-zero). Shared with the portal.
 * fmtUsd above (always 2 decimals) is for invoices, payouts and records.
 */
export const fmtMoney = sharedFmtMoney;

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

export function fileUrl(path: string): string {
  return `/api/admin/creators/file-url?path=${encodeURIComponent(path)}`;
}

export function Btn({
  children,
  onClick,
  kind = "secondary",
  disabled,
  type = "button",
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
  style?: CSSProperties;
}) {
  const bg = kind === "primary" ? "#fff" : kind === "danger" ? "rgba(248,113,113,0.15)" : "rgba(255,255,255,0.06)";
  const color = kind === "primary" ? "#000" : kind === "danger" ? "#f87171" : "rgba(255,255,255,0.8)";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "7px 14px",
        fontSize: 12,
        fontWeight: 500,
        borderRadius: 20,
        border: "none",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        background: bg,
        color,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

const FLAG_COLORS: Record<string, string> = {
  green: "#4ade80",
  amber: "#fbbf24",
  red: "#f87171",
  none: "rgba(255,255,255,0.25)",
};

export function Dot({ color, title }: { color: string; title?: string }) {
  return (
    <span
      title={title}
      style={{ display: "inline-block", width: 10, height: 10, borderRadius: 5, background: FLAG_COLORS[color] ?? color }}
    />
  );
}

export function Pill({ children, color = "rgba(255,255,255,0.5)" }: { children: ReactNode; color?: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 10,
        background: "rgba(255,255,255,0.06)",
        color,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export const INVOICE_COLORS: Record<string, string> = {
  draft: "rgba(255,255,255,0.5)",
  submitted: "#fbbf24",
  approved: "#60a5fa",
  paid: "#4ade80",
};

export function SubNav() {
  const pathname = usePathname();
  const items = [
    { href: "/dashboard/creators-pay", label: "Creators" },
    { href: "/dashboard/creators-pay/proven", label: "Proven videos" },
    { href: "/dashboard/creators-pay/payouts", label: "Payout run" },
    { href: "/dashboard/creators-pay/records", label: "Records" },
    { href: "/dashboard/creators-pay/settings", label: "Contract signing & settings" },
    { href: "/dashboard/creators-pay/new", label: "+ Add creator" },
  ];
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
      {items.map((i) => {
        const active = pathname === i.href;
        return (
          <Link
            key={i.href}
            href={i.href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 34,
              padding: "0 14px",
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 20,
              textDecoration: "none",
              whiteSpace: "nowrap",
              background: active ? "#fff" : "rgba(255,255,255,0.06)",
              color: active ? "#000" : "rgba(255,255,255,0.5)",
            }}
          >
            {i.label}
          </Link>
        );
      })}
    </div>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div
      className="flex-stack-mobile"
      style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 12 }}
    >
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px" }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.3px" }}>
        {label}
      </span>
      {children}
      {hint && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{hint}</span>}
    </label>
  );
}

export function Loading() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "40vh" }}>
      <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>Loading...</p>
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p style={{ color: "#f87171", fontSize: 13, margin: "8px 0" }}>{children}</p>;
}

export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

/** Signed-URL upload: ask our API for a PUT URL, then send the file straight to storage. */
export async function uploadFile(
  creatorId: string,
  kind: "contract" | "payment_proof",
  file: File,
  invoice?: string,
): Promise<string> {
  const { uploadUrl, objectPath } = await api<{ uploadUrl: string; objectPath: string }>(
    `/api/admin/creators/${creatorId}/upload-url`,
    {
      method: "POST",
      body: JSON.stringify({ kind, filename: file.name, contentType: file.type, sizeBytes: file.size, invoice }),
    },
  );
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);
  return objectPath;
}

/** Record a manual Amex ACH payment: date + reference + optional proof file. Locks the invoice. */
export function MarkPaidForm({
  creatorId,
  invoiceNumber,
  amountCents,
  onDone,
  onCancel,
}: {
  creatorId: string;
  invoiceNumber: string;
  amountCents: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirming, setConfirming] = useState(false);

  async function submit() {
    setErr("");
    if (!reference.trim()) return setErr("Enter the payment reference.");
    if (!confirming) return setConfirming(true);
    setBusy(true);
    try {
      const proof_path = file ? await uploadFile(creatorId, "payment_proof", file, invoiceNumber) : "";
      await api(`/api/admin/creators/${creatorId}/invoices/${encodeURIComponent(invoiceNumber)}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "mark_paid", paid_on: paidOn, reference, proof_path }),
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...card, marginBottom: 0, marginTop: 8, padding: 14, background: "rgba(255,255,255,0.05)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <Field label="Payment date">
          <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} style={input} />
        </Field>
        <Field label="Reference" hint="Amex ACH confirmation / trace #">
          <input value={reference} onChange={(e) => setReference(e.target.value)} style={input} />
        </Field>
        <Field label="Proof (PDF or image)">
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ ...input, padding: 6 }}
          />
        </Field>
      </div>
      <ErrorText>{err}</ErrorText>
      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Btn kind="primary" onClick={submit} disabled={busy}>
          {busy ? "Saving..." : confirming ? `Confirm: paid ${fmtUsd(amountCents)}, lock invoice` : "Mark paid"}
        </Btn>
        <Btn onClick={onCancel} disabled={busy}>
          Cancel
        </Btn>
        {confirming && <span style={muted}>Once paid, the invoice is locked and can't be edited.</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- self-billed invoice flags

export interface InvoiceFlagFields {
  status: string;
  auto_submitted?: boolean;
  dispute_until?: string | null;
  disputed_at?: string | null;
  dispute_resolved_at?: string | null;
}

export function approveWarning(inv: InvoiceFlagFields & { dispute_note?: string | null }): string | null {
  if (inv.disputed_at && !inv.dispute_resolved_at) return `The creator flagged this invoice: "${inv.dispute_note ?? ""}". Approve anyway?`;
  if (inv.status === "submitted" && inv.dispute_until && Date.now() < Date.parse(inv.dispute_until)) {
    return `The creator can still flag this invoice until ${new Date(inv.dispute_until).toLocaleString()}. Approve now anyway?`;
  }
  return null;
}

export function InvoiceFlags({ inv }: { inv: InvoiceFlagFields }) {
  const inWindow = inv.status === "submitted" && !!inv.dispute_until && Date.now() < Date.parse(inv.dispute_until);
  return (
    <>
      {inv.auto_submitted && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Auto-submitted</span>}
      {inWindow && (
        <span style={{ fontSize: 11, color: "#fbbf24" }}>
          In review until {new Date(inv.dispute_until!).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </span>
      )}
      {inv.disputed_at && !inv.dispute_resolved_at && (
        <span style={{ fontSize: 11, fontWeight: 600, color: "#fff", background: "#dc2626", borderRadius: 4, padding: "1px 6px" }}>Disputed</span>
      )}
    </>
  );
}
