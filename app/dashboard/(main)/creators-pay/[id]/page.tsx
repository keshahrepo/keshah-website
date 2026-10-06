"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import MetricCard from "@/components/MetricCard";
import {
  Btn,
  ErrorText,
  Field,
  INVOICE_COLORS,
  Loading,
  MarkPaidForm,
  PageHeader,
  Pill,
  SubNav,
  api,
  card,
  fileUrl,
  fmtUsd,
  fmtUsdShort,
  h3,
  input,
  muted,
  shiftMonth,
  td,
  th,
  uploadFile,
} from "../_ui";

interface Creator {
  id: string;
  name: string;
  legal_name: string;
  email: string;
  keshah_email: string;
  timezone: string;
  start_date: string;
  starting_completed_months: number;
  campaign_tags: string[];
  status: string;
  status_display: string;
  ended_on: string | null;
  contract: {
    status: "none" | "sent" | "signed";
    signed_at?: string;
    pdf_path?: string;
    template_version?: string;
    template_sha256?: string;
    sent_at?: string;
    viewed_at?: string;
    signed_sha256?: string;
    audit?: Record<string, string>;
  };
  w9_on_file: boolean;
  creator_link_id: string;
  tracking_url: string;
  tiktok_handle: string;
  instagram_handle: string;
  pay_ready: boolean;
  accept: { steps: Partial<Record<AcceptStepKey, { status: "done" | "skipped" | "error"; at: string; detail: string }>>; last_run_at?: string };
  accepted_at: string | null;
  invite: { created_at: string; expires_at: string; used_at: string | null } | null;
  has_password: boolean;
  suggested_keshah_email: string;
}
type AcceptStepKey = "group" | "invite" | "contract";
interface Line {
  kind: string;
  label: string;
  amount_cents: number;
}
interface Invoice {
  number: string;
  month: string;
  lines: Line[];
  total_cents: number;
  status: string;
  submitted_at?: string;
  approved_at?: string;
  paid_at?: string;
  payment_reference?: string;
  payment_proof_path?: string;
  locked: boolean;
}
interface Claim {
  id: string;
  video_url: string;
  platform: string;
  posted_on: string;
  crossed_100k_on?: string;
  crossed_1m_on?: string;
  views_claimed: number;
  screenshot_path?: string;
  status: string;
  admin_note?: string;
}
interface Detail {
  creator: Creator;
  month: string;
  today: string;
  summary: {
    postedDays: number;
    expectedWeekdays: number;
    approvedOffDays: number;
    missedDays: number;
    pendingDays: number;
    levelBaseCents: number;
    baseDueCents: number;
    totalCents: number;
    completed: boolean;
  } | null;
  draftLines: Line[];
  completedMonths: number | null;
  nextLevel: { nextBaseCents: number | null; monthsNeeded: number | null; earliestMonth: string | null } | null;
  calendar: { date: string; state: string; videos: number; logged_at: string | null }[];
  postingDays: { date: string; videos: Record<string, unknown>[]; complete: number; logged_at: string | null }[];
  daysOff: { id: string; date: string; status: string; reason?: string }[];
  bonusClaims: Claim[];
  adjustments: { id: string; month: string; amount_cents: number; note: string; created_at?: string }[];
  invoices: Invoice[];
  onboarding: { done: number; total: number; raw: Record<string, unknown> | null };
  contractEvents: { id: string; type: string; at: string; actor: string; detail?: string; ip?: string; signed_sha256?: string }[];
  attribution: { trials: number; purchases: number; purchasesInWindow: number; recordedProceedsUsd: number };
}

const STATE_STYLE: Record<string, { bg: string; label: string }> = {
  posted: { bg: "rgba(74,222,128,0.25)", label: "Posted" },
  approved_off: { bg: "rgba(96,165,250,0.25)", label: "Approved off" },
  requested_off: { bg: "rgba(251,191,36,0.2)", label: "Off requested" },
  missed: { bg: "rgba(248,113,113,0.25)", label: "Missed" },
  pending: { bg: "rgba(255,255,255,0.06)", label: "Pending" },
  inactive: { bg: "transparent", label: "Not active" },
};

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <CreatorDetail />
    </Suspense>
  );
}

function CreatorDetail() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const [month, setMonth] = useState(sp.get("month") || new Date().toISOString().slice(0, 7));
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    setErr("");
    api<Detail>(`/api/admin/creators/${id}?month=${month}`)
      .then(setD)
      .catch((e) => setErr(String(e.message ?? e)));
  }, [id, month]);

  useEffect(() => {
    load();
  }, [load]);

  if (!d) return err ? <ErrorText>{err}</ErrorText> : <Loading />;
  const c = d.creator;

  return (
    <div>
      <p style={{ marginBottom: 8 }}>
        <Link href="/dashboard/creators-pay" style={{ ...muted, textDecoration: "none" }}>
          ← All creators
        </Link>
      </p>
      <PageHeader
        title={c.legal_name || c.name || c.id}
        subtitle={[c.status_display, c.email, c.timezone].filter(Boolean).join(" · ")}
        right={
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Btn onClick={() => setMonth(shiftMonth(month, -1))}>←</Btn>
            <span style={{ fontSize: 13, minWidth: 70, textAlign: "center" }}>{month}</span>
            <Btn onClick={() => setMonth(shiftMonth(month, 1))}>→</Btn>
          </div>
        }
      />
      <SubNav />
      <ErrorText>{err}</ErrorText>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
        <MetricCard
          label="Level"
          value={d.summary ? `${fmtUsdShort(d.summary.levelBaseCents)}/mo` : "–"}
          subtitle={d.completedMonths !== null ? `${d.completedMonths} completed months` : "Pay starts on the first posting day"}
        />
        <MetricCard
          label="Next level"
          value={d.nextLevel?.nextBaseCents ? `${fmtUsdShort(d.nextLevel.nextBaseCents)}/mo` : d.summary ? "Top" : "–"}
          subtitle={d.nextLevel?.earliestMonth ? `earliest ${d.nextLevel.earliestMonth}` : undefined}
        />
        <MetricCard
          label="Days posted"
          value={d.summary ? `${d.summary.postedDays} / ${d.summary.expectedWeekdays}` : "–"}
          subtitle={d.summary ? `${d.summary.approvedOffDays} off · ${d.summary.missedDays} missed · ${d.summary.pendingDays} to go` : undefined}
        />
        <MetricCard
          label={`Owed ${month}`}
          value={fmtUsd(d.summary?.totalCents ?? 0)}
          subtitle={d.summary ? `base ${fmtUsd(d.summary.baseDueCents)}` : undefined}
        />
        <MetricCard
          label="Trials / paid"
          value={`${d.attribution.trials} / ${d.attribution.purchases}`}
          subtitle={c.campaign_tags.length ? c.campaign_tags.join(", ") : "no campaign tags"}
        />
        <MetricCard label="Onboarding" value={`${d.onboarding.done}/${d.onboarding.total}`} />
      </div>

      <AcceptPanel c={c} isNew={sp.get("new") === "1"} reload={load} />
      <PostingLog d={d} />
      <DaysOff d={d} reload={load} />
      <BonusClaims d={d} reload={load} />
      <Adjustments d={d} reload={load} />
      <Invoices d={d} reload={load} />
      <ContractW9 c={c} events={d.contractEvents ?? []} reload={load} />
      <ProfileEditor c={c} reload={load} />
    </div>
  );
}

// ---------------------------------------------------------------- accept

const ACCEPT_LABELS: [AcceptStepKey, string][] = [
  ["group", "keshah.com inbox"],
  ["invite", "Portal invite"],
  ["contract", "Contract"],
];
const STEP_COLORS = { done: "#4ade80", skipped: "#fbbf24", error: "#f87171" } as const;

function AcceptPanel({ c, isNew, reload }: { c: Creator; isNew: boolean; reload: () => void }) {
  const steps = c.accept?.steps ?? {};
  const allDone = ACCEPT_LABELS.every(([k]) => steps[k]?.status === "done");
  const groupDone = steps.group?.status === "done";
  const [address, setAddress] = useState(c.keshah_email || c.suggested_keshah_email);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(!allDone || isNew);

  async function run(extra: Record<string, unknown> = {}) {
    setBusy(true);
    setErr("");
    setCopied(false);
    try {
      const body: Record<string, unknown> = { ...extra };
      if (!groupDone && address.trim() && address.trim().toLowerCase() !== c.suggested_keshah_email) body.keshah_email = address.trim();
      const r = await api<{ invite_link?: string }>(`/api/admin/creators/${c.id}/accept`, { method: "POST", body: JSON.stringify(body) });
      setLink(r.invite_link ?? "");
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function markSent() {
    try {
      await api(`/api/admin/creators/${c.id}/accept`, { method: "POST", body: JSON.stringify({ action: "mark_invite_sent" }) });
      setLink("");
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setErr("Couldn't copy. Select the link and copy it by hand.");
    }
  }

  return (
    <div style={{ ...card, ...(isNew && !c.accepted_at ? { border: "1px solid rgba(96,165,250,0.5)" } : {}) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ ...h3, marginBottom: 0 }}>Accept creator</h3>
        {c.accepted_at && <span style={muted}>accepted {c.accepted_at.slice(0, 10)}</span>}
        {allDone && <Pill color="#4ade80">all set</Pill>}
        {allDone && (
          <button onClick={() => setOpen(!open)} style={{ background: "none", border: "none", color: "#60a5fa", fontSize: 12, cursor: "pointer", padding: 0, marginLeft: "auto" }}>
            {open ? "Hide" : "Details"}
          </button>
        )}
      </div>
      {open && (
        <div style={{ marginTop: 12 }}>
          {isNew && !c.accepted_at && (
            <p style={{ fontSize: 13, marginBottom: 12, color: "rgba(255,255,255,0.8)" }}>
              Creator added. Check the inbox address, then accept to set up their keshah.com inbox, email their portal invite and send the contract.
            </p>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 12, alignItems: "end" }}>
            <Field label="Inbox address" hint={groupDone ? "Group already created" : "Tried first. If it's taken, firstname.lastname@ and so on"}>
              <input style={input} value={address} onChange={(e) => setAddress(e.target.value)} disabled={groupDone} placeholder="name@keshah.com" />
            </Field>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn kind="primary" onClick={() => run()} disabled={busy || allDone}>
                {busy ? "Working..." : c.accepted_at ? "Retry unfinished steps" : "Accept creator"}
              </Btn>
              {(steps.invite || c.invite) && (
                <Btn onClick={() => run({ resend_invite: true })} disabled={busy}>
                  Resend invite
                </Btn>
              )}
            </div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {ACCEPT_LABELS.map(([k, label]) => {
                const st = steps[k];
                return (
                  <tr key={k}>
                    <td style={{ ...td, width: 130 }}>{label}</td>
                    <td style={{ ...td, width: 80 }}>
                      {st ? <Pill color={STEP_COLORS[st.status]}>{st.status}</Pill> : <span style={muted}>not run</span>}
                    </td>
                    <td style={td}>
                      {st?.detail}
                      {st?.at && <span style={{ ...muted, marginLeft: 8 }}>{st.at.replace("T", " ").slice(0, 16)} UTC</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {c.invite && (
            <p style={{ ...muted, marginTop: 8 }}>
              Set-password link: {c.invite.used_at ? `used ${c.invite.used_at.slice(0, 10)}` : `made ${c.invite.created_at.slice(0, 10)}, expires ${c.invite.expires_at.slice(0, 10)}`}
              {c.has_password ? " · has a portal password" : " · no password yet"}
            </p>
          )}
          {link && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)" }}>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                Set-password link (shown once{steps.invite?.status === "done" ? ", already emailed" : ". Send it to them yourself"}):
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <code style={{ fontSize: 12, wordBreak: "break-all", flex: "1 1 260px" }}>{link}</code>
                <Btn onClick={copy}>{copied ? "Copied" : "Copy"}</Btn>
                {steps.invite?.status !== "done" && <Btn onClick={markSent}>I sent it</Btn>}
              </div>
              <div style={{ ...muted, marginTop: 6 }}>Running Accept or Resend invite again makes a new link, and this one stops working.</div>
            </div>
          )}
          <ErrorText>{err}</ErrorText>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- profile

function ProfileEditor({ c, reload }: { c: Creator; reload: () => void }) {
  const initial = {
    legal_name: c.legal_name,
    name: c.name,
    email: c.email,
    keshah_email: c.keshah_email,
    timezone: c.timezone,
    start_date: c.start_date,
    ended_on: c.ended_on ?? "",
    starting_completed_months: String(c.starting_completed_months),
    campaign_tags: c.campaign_tags.join(", "),
    tracking_url: c.tracking_url,
    tiktok_handle: c.tiktok_handle,
    instagram_handle: c.instagram_handle,
    status: c.status,
  };
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await api(`/api/admin/creators/${c.id}`, {
        method: "PATCH",
        // Only changed fields, so untouched legacy values (e.g. an old status) aren't re-validated.
        body: JSON.stringify(
          Object.fromEntries(
            Object.entries(f)
              .filter(([k, v]) => v !== initial[k as keyof typeof initial])
              .map(([k, v]) => [k, k === "starting_completed_months" ? Number(v) : v]),
          ),
        ),
      });
      setMsg("Saved");
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={card}>
      <h3 style={h3}>Profile</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <Field label="Legal name">
          <input style={input} value={f.legal_name} onChange={set("legal_name")} />
        </Field>
        <Field label="Display name">
          <input style={input} value={f.name} onChange={set("name")} />
        </Field>
        <Field label="Email" hint="Also their portal login email">
          <input style={input} value={f.email} onChange={set("email")} />
        </Field>
        <Field label="keshah.com email">
          <input style={input} value={f.keshah_email} onChange={set("keshah_email")} placeholder="name@keshah.com" />
        </Field>
        <Field label="Timezone" hint="IANA, e.g. America/Chicago">
          <input style={input} value={f.timezone} onChange={set("timezone")} />
        </Field>
        <Field label="Status">
          <select style={input} value={f.status} onChange={set("status")}>
            {!["onboarding", "trial", "active", "leaving", "ended"].includes(f.status) && (
              <option value={f.status}>{f.status || "(none)"}</option>
            )}
            {["onboarding", "trial", "active", "leaving", "ended"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start date" hint="Blank = set automatically on their first posting day">
          <input type="date" style={input} value={f.start_date} onChange={set("start_date")} />
        </Field>
        <Field label="Last working day" hint="Only when leaving">
          <input type="date" style={input} value={f.ended_on} onChange={set("ended_on")} />
        </Field>
        <Field label="Starting completed months">
          <input type="number" min={0} style={input} value={f.starting_completed_months} onChange={set("starting_completed_months")} />
        </Field>
        <Field label="Campaign tags" hint="Comma separated, exact attribution campaign values">
          <input style={input} value={f.campaign_tags} onChange={set("campaign_tags")} placeholder="Exact AppStack campaign name, e.g. Jen S" />
        </Field>
        <Field label="Tracking link" hint="AppStack campaign link (any https URL). Shown in their portal.">
          <input style={input} value={f.tracking_url} onChange={set("tracking_url")} placeholder="https://" />
        </Field>
        <Field label="TikTok handle">
          <input style={input} value={f.tiktok_handle} onChange={set("tiktok_handle")} />
        </Field>
        <Field label="Instagram handle">
          <input style={input} value={f.instagram_handle} onChange={set("instagram_handle")} />
        </Field>
      </div>
      <ErrorText>{err}</ErrorText>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
        <Btn kind="primary" onClick={save} disabled={busy}>
          {busy ? "Saving..." : "Save profile"}
        </Btn>
        {msg && <span style={{ ...muted, color: "#4ade80" }}>{msg}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- contract + W-9

const AUDIT_LABELS: [string, string][] = [
  ["document_id", "Document ID"],
  ["template_version", "Template version"],
  ["template_sha256", "Template SHA-256"],
  ["signer_typed_name", "Typed name"],
  ["signer_legal_name", "Legal name"],
  ["signer_address", "Address"],
  ["signer_email", "Email"],
  ["signer_user_id", "Account ID"],
  ["signer_ip", "IP"],
  ["signer_user_agent", "User agent"],
  ["signed_at_utc", "Signed (UTC)"],
  ["signed_at_local", "Signed (local)"],
  ["consent_text_version", "Consent text"],
  ["countersigner_name", "Countersigned by"],
];

function ContractW9({ c, events, reload }: { c: Creator; events: Detail["contractEvents"]; reload: () => void }) {
  const eSigned = !!c.contract.signed_sha256;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [confirmSend, setConfirmSend] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [showPaper, setShowPaper] = useState(false);
  const [signedAt, setSignedAt] = useState((c.contract.signed_at ?? "").slice(0, 10));
  const [file, setFile] = useState<File | null>(null);

  async function send() {
    if (!confirmSend) return setConfirmSend(true);
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const r = await api<{ emailed: boolean }>(`/api/admin/creators/${c.id}/contract`, { method: "POST", body: JSON.stringify({ action: "send" }) });
      setMsg(r.emailed ? "Sent. They got an email to sign in the portal." : "Sent. It's waiting in their portal (email not sent).");
      setConfirmSend(false);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setConfirmSend(false);
    } finally {
      setBusy(false);
    }
  }

  async function savePaper() {
    setBusy(true);
    setErr("");
    try {
      const contract: Record<string, unknown> = { status: "signed", template_version: "paper" };
      if (signedAt) contract.signed_at = `${signedAt}T12:00:00.000Z`;
      if (file) contract.pdf_path = await uploadFile(c.id, "contract", file);
      await api(`/api/admin/creators/${c.id}`, { method: "PATCH", body: JSON.stringify({ contract }) });
      setFile(null);
      setShowPaper(false);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleW9(v: boolean) {
    try {
      await api(`/api/admin/creators/${c.id}`, { method: "PATCH", body: JSON.stringify({ w9_on_file: v }) });
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const st = c.contract.status;
  return (
    <div style={card}>
      <h3 style={h3}>Contract & W-9</h3>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <Pill color={st === "signed" ? "#4ade80" : st === "sent" ? "#fbbf24" : "rgba(255,255,255,0.5)"}>{st === "none" ? "not sent" : st}</Pill>
        {c.contract.template_version && <span style={muted}>version {c.contract.template_version}</span>}
        {c.contract.sent_at && <span style={muted}>sent {c.contract.sent_at.slice(0, 10)}</span>}
        {c.contract.viewed_at && <span style={muted}>opened {c.contract.viewed_at.slice(0, 10)}</span>}
        {c.contract.signed_at && <span style={muted}>signed {c.contract.signed_at.replace("T", " ").slice(0, 16)} UTC</span>}
        {eSigned && <Pill color="#60a5fa">e-signed, locked</Pill>}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        {st !== "signed" && (
          <Btn kind="primary" onClick={send} disabled={busy}>
            {busy ? "Sending..." : confirmSend ? (st === "sent" ? "Confirm: send again with the current version" : "Confirm: send for e-signature") : st === "sent" ? "Send again" : "Send contract"}
          </Btn>
        )}
        {confirmSend && <Btn onClick={() => setConfirmSend(false)}>Cancel</Btn>}
        {c.contract.pdf_path && (
          <a href={fileUrl(c.contract.pdf_path)} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "#60a5fa" }}>
            {eSigned ? "Signed PDF" : "Contract PDF"}
          </a>
        )}
        {eSigned && (
          <button onClick={() => setShowAudit(!showAudit)} style={{ background: "none", border: "none", color: "#60a5fa", fontSize: 13, cursor: "pointer", padding: 0 }}>
            {showAudit ? "Hide audit" : "Audit trail"}
          </button>
        )}
        {!eSigned && st !== "sent" && (
          <button onClick={() => setShowPaper(!showPaper)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 12, cursor: "pointer", padding: 0 }}>
            {showPaper ? "Cancel" : "Record a paper contract instead"}
          </button>
        )}
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer", marginLeft: "auto" }}>
          <input type="checkbox" checked={c.w9_on_file} onChange={(e) => toggleW9(e.target.checked)} />
          W-9 on file
          <span style={muted}>(kept outside this system; no tax IDs stored here)</span>
        </label>
      </div>

      {showPaper && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 12, alignItems: "end" }}>
          <Field label="Signed on">
            <input type="date" style={input} value={signedAt} onChange={(e) => setSignedAt(e.target.value)} />
          </Field>
          <Field label="Signed PDF">
            <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ ...input, padding: 6 }} />
          </Field>
          <Btn kind="primary" onClick={savePaper} disabled={busy || !file}>
            Mark signed (paper)
          </Btn>
        </div>
      )}

      {showAudit && c.contract.audit && (
        <div style={{ marginTop: 12, fontSize: 12 }}>
          {AUDIT_LABELS.map(([k, label]) =>
            c.contract.audit?.[k] ? (
              <div key={k} style={{ display: "flex", gap: 10, padding: "3px 0" }}>
                <span style={{ ...muted, minWidth: 130 }}>{label}</span>
                <span style={{ wordBreak: "break-all" }}>{c.contract.audit[k]}</span>
              </div>
            ) : null,
          )}
          <div style={{ display: "flex", gap: 10, padding: "3px 0" }}>
            <span style={{ ...muted, minWidth: 130 }}>Signed PDF SHA-256</span>
            <span style={{ wordBreak: "break-all", fontFamily: "monospace" }}>{c.contract.signed_sha256}</span>
          </div>
        </div>
      )}

      {events.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ ...muted, marginBottom: 4 }}>Contract log</div>
          {events.map((e) => (
            <div key={e.id} style={{ fontSize: 12, padding: "2px 0", color: e.type === "email_failed" ? "#f87171" : "rgba(255,255,255,0.7)" }}>
              {e.at.replace("T", " ").slice(0, 19)} UTC · {e.type} · {e.actor}
              {e.detail ? ` · ${e.detail}` : ""}
              {e.ip ? ` · ${e.ip}` : ""}
            </div>
          ))}
        </div>
      )}
      <ErrorText>{err}</ErrorText>
      {msg && <p style={{ color: "#4ade80", fontSize: 13 }}>{msg}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- posting log

function PostingLog({ d }: { d: Detail }) {
  const [open, setOpen] = useState<string | null>(null);
  const first = d.calendar[0]?.date;
  const lead = first ? (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7 : 0; // Mon = 0
  const posting = new Map(d.postingDays.map((p) => [p.date, p]));
  const sel = open ? posting.get(open) : null;

  return (
    <div style={card}>
      <h3 style={h3}>Posting log · {d.month}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri"].map((w) => (
          <div key={w} style={{ ...muted, fontSize: 11, textAlign: "center" }}>
            {w}
          </div>
        ))}
        {Array.from({ length: lead }).map((_, i) => (
          <div key={`lead${i}`} />
        ))}
        {d.calendar.map((day) => {
          const st = STATE_STYLE[day.state] ?? STATE_STYLE.pending;
          const isToday = day.date === d.today;
          return (
            <button
              key={day.date}
              onClick={() => setOpen(open === day.date ? null : day.date)}
              title={st.label}
              style={{
                background: st.bg,
                border: isToday ? "1px solid #fff" : "1px solid rgba(255,255,255,0.06)",
                borderRadius: 8,
                padding: "8px 6px",
                color: day.state === "inactive" ? "rgba(255,255,255,0.25)" : "#fff",
                cursor: "pointer",
                textAlign: "left",
                minHeight: 52,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600 }}>{Number(day.date.slice(8))}</div>
              <div style={{ fontSize: 10, opacity: 0.7 }}>
                {st.label}
                {day.videos > 0 && day.state !== "posted" ? ` · ${day.videos}/5` : ""}
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
        {Object.entries(STATE_STYLE)
          .filter(([k]) => k !== "inactive")
          .map(([k, v]) => (
            <span key={k} style={{ ...muted, display: "inline-flex", gap: 4, alignItems: "center" }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: v.bg, display: "inline-block" }} /> {v.label}
            </span>
          ))}
      </div>
      {open && (
        <div style={{ marginTop: 12, fontSize: 13 }}>
          <strong>{open}</strong>{" "}
          {sel ? (
            <span style={muted}>
              {sel.complete} complete video{sel.complete === 1 ? "" : "s"} · logged {sel.logged_at?.replace("T", " ").slice(0, 16) ?? "–"} UTC
            </span>
          ) : (
            <span style={muted}>nothing logged</span>
          )}
          {sel && (
            <ol style={{ margin: "8px 0 0 18px", padding: 0, listStyleType: "decimal" }}>
              {sel.videos.map((v, i) => (
                <li key={i} style={{ marginBottom: 4 }}>
                  {["tiktok_url", "instagram_url", "url"].map((k) =>
                    v[k] ? (
                      <a key={k} href={String(v[k])} target="_blank" rel="noreferrer" style={{ color: "#60a5fa", marginRight: 10 }}>
                        {k === "tiktok_url" ? "TikTok" : k === "instagram_url" ? "Instagram" : String(v.platform ?? "link")}
                      </a>
                    ) : k !== "url" ? (
                      <span key={k} style={{ color: "#f87171", marginRight: 10 }}>
                        {k === "tiktok_url" ? "no TikTok" : "no Instagram"}
                      </span>
                    ) : null,
                  )}
                  {v.inspired_by_url ? (
                    <a href={String(v.inspired_by_url)} target="_blank" rel="noreferrer" style={{ color: "rgba(255,255,255,0.6)", marginRight: 10 }}>
                      inspired by
                    </a>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- days off

function DaysOff({ d, reload }: { d: Detail; reload: () => void }) {
  const [err, setErr] = useState("");
  async function decide(date: string, status: string) {
    setErr("");
    try {
      await api(`/api/admin/creators/${d.creator.id}/days-off/${date}`, { method: "PATCH", body: JSON.stringify({ status }) });
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <div style={card}>
      <h3 style={h3}>Days off</h3>
      {!d.daysOff.length && <p style={muted}>No requests.</p>}
      {d.daysOff.map((o) => (
        <div
          key={o.id}
          style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", flexWrap: "wrap" }}
        >
          <span style={{ fontSize: 13, minWidth: 90 }}>{o.date}</span>
          <Pill color={o.status === "approved" ? "#4ade80" : o.status === "declined" ? "#f87171" : "#fbbf24"}>{o.status}</Pill>
          {o.reason && <span style={muted}>{o.reason}</span>}
          <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {o.status !== "approved" && <Btn onClick={() => decide(o.date, "approved")}>Approve</Btn>}
            {o.status !== "declined" && (
              <Btn kind="danger" onClick={() => decide(o.date, "declined")}>
                Decline
              </Btn>
            )}
          </span>
        </div>
      ))}
      <ErrorText>{err}</ErrorText>
    </div>
  );
}

// ---------------------------------------------------------------- bonus claims

function BonusClaims({ d, reload }: { d: Detail; reload: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState("");
  async function patch(claimId: string, body: Record<string, unknown>) {
    setErr("");
    try {
      await api(`/api/admin/creators/${d.creator.id}/bonus-claims/${claimId}`, { method: "PATCH", body: JSON.stringify(body) });
      setEditing(null);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <div style={card}>
      <h3 style={h3}>Bonus claims</h3>
      <p style={{ ...muted, marginTop: -6, marginBottom: 10 }}>$15 at 100K, $100 total at 1M, if crossed within 30 days of posting. Paid in the month crossed.</p>
      {!d.bonusClaims.length && <p style={muted}>No claims.</p>}
      {d.bonusClaims.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr>
                <th style={th}>Video</th>
                <th style={th}>Posted</th>
                <th style={th}>Views</th>
                <th style={th}>100K on</th>
                <th style={th}>1M on</th>
                <th style={th}>Status</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {d.bonusClaims.map((b) =>
                editing === b.id ? (
                  <ClaimEditRow key={b.id} b={b} onSave={(body) => patch(b.id, body)} onCancel={() => setEditing(null)} />
                ) : (
                  <tr key={b.id}>
                    <td style={td}>
                      <a href={b.video_url} target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>
                        {b.platform === "tiktok" ? "TikTok" : "Instagram"}
                      </a>
                      {b.screenshot_path && (
                        <>
                          {" · "}
                          <a href={fileUrl(b.screenshot_path)} target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>
                            screenshot
                          </a>
                        </>
                      )}
                      {b.admin_note && <div style={muted}>{b.admin_note}</div>}
                    </td>
                    <td style={td}>{b.posted_on}</td>
                    <td style={td}>{b.views_claimed.toLocaleString()}</td>
                    <td style={td}>{b.crossed_100k_on || "–"}</td>
                    <td style={td}>{b.crossed_1m_on || "–"}</td>
                    <td style={td}>
                      <Pill color={b.status === "approved" ? "#4ade80" : b.status === "rejected" ? "#f87171" : "#fbbf24"}>{b.status}</Pill>
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      <span style={{ display: "inline-flex", gap: 6 }}>
                        {b.status !== "approved" && <Btn onClick={() => patch(b.id, { status: "approved" })}>Approve</Btn>}
                        {b.status !== "rejected" && (
                          <Btn kind="danger" onClick={() => patch(b.id, { status: "rejected" })}>
                            Reject
                          </Btn>
                        )}
                        <Btn onClick={() => setEditing(b.id)}>Edit</Btn>
                      </span>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
      <ErrorText>{err}</ErrorText>
    </div>
  );
}

function ClaimEditRow({ b, onSave, onCancel }: { b: Claim; onSave: (body: Record<string, unknown>) => void; onCancel: () => void }) {
  const [f, setF] = useState({
    posted_on: b.posted_on ?? "",
    views_claimed: String(b.views_claimed ?? 0),
    crossed_100k_on: b.crossed_100k_on ?? "",
    crossed_1m_on: b.crossed_1m_on ?? "",
    admin_note: b.admin_note ?? "",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <tr>
      <td style={td}>
        <input style={input} value={f.admin_note} onChange={set("admin_note")} placeholder="Admin note" />
      </td>
      <td style={td}>
        <input type="date" style={input} value={f.posted_on} onChange={set("posted_on")} />
      </td>
      <td style={td}>
        <input type="number" style={input} value={f.views_claimed} onChange={set("views_claimed")} />
      </td>
      <td style={td}>
        <input type="date" style={input} value={f.crossed_100k_on} onChange={set("crossed_100k_on")} />
      </td>
      <td style={td}>
        <input type="date" style={input} value={f.crossed_1m_on} onChange={set("crossed_1m_on")} />
      </td>
      <td style={td} colSpan={2}>
        <span style={{ display: "inline-flex", gap: 6 }}>
          <Btn kind="primary" onClick={() => onSave({ ...f, views_claimed: Number(f.views_claimed) })}>
            Save
          </Btn>
          <Btn onClick={onCancel}>Cancel</Btn>
        </span>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------- adjustments

function Adjustments({ d, reload }: { d: Detail; reload: () => void }) {
  const [month, setMonth] = useState(d.month);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function add() {
    setErr("");
    const cents = Math.round(Number(amount) * 100);
    if (!cents) return setErr("Enter a non-zero dollar amount (use - for a deduction).");
    setBusy(true);
    try {
      await api(`/api/admin/creators/${d.creator.id}/adjustments`, {
        method: "POST",
        body: JSON.stringify({ month, amount_cents: cents, note }),
      });
      setAmount("");
      setNote("");
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(adjId: string) {
    setErr("");
    try {
      await api(`/api/admin/creators/${d.creator.id}/adjustments/${adjId}`, { method: "DELETE" });
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <div style={card}>
      <h3 style={h3}>Adjustments</h3>
      {d.adjustments.map((a) => (
        <div key={a.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <span style={{ ...muted, minWidth: 64 }}>{a.month}</span>
          <span style={{ fontSize: 13, minWidth: 80, color: a.amount_cents < 0 ? "#f87171" : "#4ade80" }}>{fmtUsd(a.amount_cents)}</span>
          <span style={{ fontSize: 13, flex: 1 }}>{a.note}</span>
          <Btn kind="danger" onClick={() => remove(a.id)}>
            Remove
          </Btn>
        </div>
      ))}
      <div className="cp-stack" style={{ display: "grid", gridTemplateColumns: "170px 130px 1fr auto", gap: 8, marginTop: 12, alignItems: "end" }}>
        <Field label="Month">
          <input type="month" style={input} value={month} onChange={(e) => setMonth(e.target.value)} />
        </Field>
        <Field label="Amount $">
          <input style={input} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="-25.00" />
        </Field>
        <Field label="Note">
          <input style={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why" />
        </Field>
        <Btn kind="primary" onClick={add} disabled={busy}>
          Add
        </Btn>
      </div>
      <ErrorText>{err}</ErrorText>
    </div>
  );
}

// ---------------------------------------------------------------- invoices

function Invoices({ d, reload }: { d: Detail; reload: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [err, setErr] = useState("");
  async function act(number: string, action: string) {
    setErr("");
    try {
      await api(`/api/admin/creators/${d.creator.id}/invoices/${encodeURIComponent(number)}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <div style={card}>
      <h3 style={h3}>Invoices</h3>
      {d.summary && (
        <p style={{ ...muted, marginTop: -6, marginBottom: 10 }}>
          Calculated for {d.month} so far: {fmtUsd(d.summary.totalCents)} ({d.draftLines.length} line{d.draftLines.length === 1 ? "" : "s"}). The creator
          submits invoices from their portal.
        </p>
      )}
      {!d.invoices.length && <p style={muted}>No invoices yet.</p>}
      {d.invoices.map((inv) => (
        <div key={inv.number} style={{ padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => setOpen(open === inv.number ? null : inv.number)}
              style={{ background: "none", border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 }}
            >
              {open === inv.number ? "▾" : "▸"} {inv.number}
            </button>
            <span style={muted}>{inv.month}</span>
            <span style={{ fontSize: 13 }}>{fmtUsd(inv.total_cents)}</span>
            <span style={{ color: INVOICE_COLORS[inv.status] ?? "#fff", fontSize: 12 }}>{inv.status}</span>
            {inv.locked && <Pill>locked</Pill>}
            {inv.paid_at && <span style={muted}>paid {inv.paid_at.slice(0, 10)} · ref {inv.payment_reference}</span>}
            <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
              <a
                href={`/api/admin/creators/${d.creator.id}/invoices/${encodeURIComponent(inv.number)}`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 12, color: "#60a5fa", alignSelf: "center" }}
              >
                View
              </a>
              {inv.payment_proof_path && (
                <a href={fileUrl(inv.payment_proof_path)} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#60a5fa", alignSelf: "center" }}>
                  Proof
                </a>
              )}
              {!inv.locked && (inv.status === "submitted" || inv.status === "draft") && (
                <Btn onClick={() => act(inv.number, "approve")}>Approve</Btn>
              )}
              {!inv.locked && inv.status === "approved" && (
                <>
                  <Btn onClick={() => act(inv.number, "unapprove")}>Un-approve</Btn>
                  <Btn kind="primary" onClick={() => setPaying(inv.number)}>
                    Mark paid
                  </Btn>
                </>
              )}
            </span>
          </div>
          {open === inv.number && (
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
              <tbody>
                {inv.lines.map((l, i) => (
                  <tr key={i}>
                    <td style={{ ...td, fontSize: 12 }}>{l.label}</td>
                    <td style={{ ...td, fontSize: 12, textAlign: "right" }}>{fmtUsd(l.amount_cents)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...td, fontWeight: 600 }}>Total</td>
                  <td style={{ ...td, fontWeight: 600, textAlign: "right" }}>{fmtUsd(inv.total_cents)}</td>
                </tr>
              </tbody>
            </table>
          )}
          {paying === inv.number && (
            <MarkPaidForm
              creatorId={d.creator.id}
              invoiceNumber={inv.number}
              amountCents={inv.total_cents}
              onCancel={() => setPaying(null)}
              onDone={() => {
                setPaying(null);
                reload();
              }}
            />
          )}
        </div>
      ))}
      <ErrorText>{err}</ErrorText>
    </div>
  );
}
