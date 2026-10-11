/**
 * Admin "Accept creator": one idempotent button that
 *   1. group     creates <name>@keshah.com (Google Group) and saves keshah_email
 *   2. invite    emails a single-use set-password link for the portal
 *   3. contract  sends the contract for e-signature (if template + signature exist)
 * and sets status "onboarding" + accepted_at the first time. A new offer also
 * gets contract_deadline_at (lib/creators/deadline.ts), named in the welcome email.
 *
 * Each step's outcome is written to ContentCreators/{id}.accept.steps.<step>
 * as soon as it finishes. Re-running retries only steps that aren't "done"
 * (plus any listed in `force`, e.g. "Resend invite").
 */
import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { emailConfigured, sendEmail } from "@/lib/email";
import { CREATORS_COLLECTION, CreatorDataError, mapCreatorStatus } from "./db";
import { contractSetupProblem, getContractSettings, getTemplate, sendContract } from "./contract";
import { groupsClientFromEnv, groupsConfigured, provisionCreatorGroup } from "./google-groups";
import { CREATOR_FROM_NAME, newInvite, setPasswordUrl, welcomeEmail } from "./invite";
import { contractDeadlineFor, deadlineLong, deadlineOf, getsDeadline } from "./deadline";
import type { AcceptRecord, AcceptStepKey, AcceptStepRecord } from "./types";

export const ACCEPT_STEPS: AcceptStepKey[] = ["group", "invite", "contract"];
const LOCK_MS = 120_000;

function ref(id: string) {
  return getFirebaseAdmin().db.collection(CREATORS_COLLECTION).doc(id);
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function acceptOf(d: DocumentData | undefined): AcceptRecord {
  const a = (d?.accept ?? {}) as Partial<AcceptRecord>;
  return { ...a, steps: { ...(a.steps ?? {}) } };
}

export interface AcceptOptions {
  /** Base URL for the set-password link, e.g. https://www.keshah.com */
  siteUrl: string;
  /** Admin-chosen address (else the creator's saved keshah_email, else firstname@...). */
  keshahEmail?: string;
  /** Re-run these even if already "done". Only "invite" is meaningful today. */
  force?: AcceptStepKey[];
}

export interface AcceptResult {
  accept: AcceptRecord;
  /** Raw set-password link, returned once when a new invite was made. */
  invite_link?: string;
}

/** null = the contract can be sent (or already was); otherwise why not. */
async function contractNotReadyReason(d: DocumentData): Promise<string | null> {
  const st = (d.contract ?? {}).status;
  if (st === "sent" || st === "signed") return null;
  const s = await getContractSettings();
  const hasTemplate = !!s.current_template_version && !!(await getTemplate(s.current_template_version));
  return contractSetupProblem(s, hasTemplate);
}

export async function acceptCreator(id: string, opts: AcceptOptions): Promise<AcceptResult> {
  const r = ref(id);
  const db = getFirebaseAdmin().db;
  const now = () => new Date().toISOString();

  // Lock (double-click guard).
  const start = await db.runTransaction(async (tx) => {
    const snap = await tx.get(r);
    if (!snap.exists) throw new CreatorDataError("Creator not found", 404);
    const a = acceptOf(snap.data());
    if (a.running_until && Date.parse(a.running_until) > Date.now()) {
      throw new CreatorDataError("Accept is already running for this creator. Give it a minute.", 409);
    }
    tx.update(r, { "accept.running_until": new Date(Date.now() + LOCK_MS).toISOString() });
    return snap.data()!;
  });

  let d = start;
  const accept = acceptOf(d);
  const force = new Set(opts.force ?? []);
  const shouldRun = (k: AcceptStepKey) => force.has(k) || accept.steps[k]?.status !== "done";
  const record = async (k: AcceptStepKey, status: AcceptStepRecord["status"], detail: string, extra: Record<string, unknown> = {}) => {
    const rec: AcceptStepRecord = { status, at: now(), detail };
    accept.steps[k] = rec;
    await r.update({ [`accept.steps.${k}`]: rec, ...extra });
  };
  let inviteLink: string | undefined;
  let inviteEmailedNow = false;

  try {
    const fullName = String(d.legal_name || d.name || "").trim();
    const personal = String(d.email ?? "").trim().toLowerCase();

    // ---- 1. Google Group
    if (shouldRun("group")) {
      if (!groupsConfigured()) {
        await record("group", "skipped", "Google Workspace not connected yet");
      } else {
        try {
          const override = (opts.keshahEmail ?? d.keshah_email ?? "").toString().trim().toLowerCase();
          const client = await groupsClientFromEnv();
          const res = await provisionCreatorGroup(client, { fullName, personalEmail: personal, override: override || undefined });
          const fellBack = res.tried.length > 1 ? ` (taken: ${res.tried.slice(0, -1).join(", ")})` : "";
          await record("group", "done", `${res.created ? "Created" : "Reused"} ${res.email}${fellBack}`, { keshah_email: res.email });
          d = { ...d, keshah_email: res.email };
        } catch (e) {
          await record("group", "error", errMsg(e));
        }
      }
    }

    // 72-hour contract deadline: set once, the first time a new offer is accepted
    // (never for Isai / anyone already working with us). A re-run keeps the stored one.
    // Saved right away so the welcome email and the stored deadline always agree.
    let deadline = deadlineOf(d);
    if (!deadline && !d.accepted_at && ["onboarding", "trial"].includes(mapCreatorStatus(d.status)) && getsDeadline(d)) {
      deadline = contractDeadlineFor(new Date());
      await r.update({ contract_deadline_at: deadline });
      d = { ...d, contract_deadline_at: deadline };
    }
    const notReady = await contractNotReadyReason(d).catch(() => "Couldn't check the contract settings. Send it from the creator page.");
    const ready = !notReady;

    // ---- 2. Portal invite
    if (shouldRun("invite")) {
      if (d.password_hash && !force.has("invite")) {
        await record("invite", "skipped", "Already has a portal password. Use Resend invite to send a new set-password link anyway.");
      } else if (!personal) {
        await record("invite", "error", "No personal email on this creator. Add one in the profile, then accept again.");
      } else {
        const { token, invite } = newInvite();
        await r.update({ invite });
        inviteLink = setPasswordUrl(opts.siteUrl, token);
        const groupDone = accept.steps.group?.status === "done";
        if (!emailConfigured()) {
          await record("invite", "error", "Email isn't set up on the server (KESHAH_GMAIL_USER / KESHAH_GMAIL_APP_PASSWORD). Copy the link and send it yourself.");
        } else {
          try {
            const mail = welcomeEmail({
              firstName: String(d.name || d.legal_name || "").trim().split(/\s+/)[0] ?? "",
              link: inviteLink,
              keshahEmail: groupDone ? String(d.keshah_email || "") : undefined,
              signInEmail: personal,
              contractReady: ready,
              // Already working with us (migrated): portal intro, not an offer email.
              existing: d.status === "active" || d.status === "leaving",
              ...(deadline && d.contract?.status !== "signed" ? { deadlineText: deadlineLong(deadline) } : {}),
            });
            // Plain text only: reads like a personal Gmail message, which
            // keeps it in Primary instead of Promotions.
            await sendEmail({ to: personal, subject: mail.subject, text: mail.text, fromName: CREATOR_FROM_NAME });
            inviteEmailedNow = true;
            await record("invite", "done", `Emailed ${personal}. Link expires ${invite.expires_at.slice(0, 10)}.`);
          } catch (e) {
            await record("invite", "error", `Email failed: ${errMsg(e)}. Copy the link and send it yourself.`);
          }
        }
      }
    }

    // ---- 3. Contract
    if (shouldRun("contract")) {
      const c = (d.contract ?? {}) as { status?: string; sent_at?: string };
      if (c.status === "signed") {
        await record("contract", "done", "Already signed");
      } else if (c.status === "sent") {
        await record("contract", "done", `Already sent${c.sent_at ? ` ${String(c.sent_at).slice(0, 10)}` : ""}`);
      } else if (!ready) {
        await record("contract", "skipped", notReady!);
      } else {
        try {
          const res = await sendContract(id, { email: !inviteEmailedNow });
          const how = inviteEmailedNow ? "the welcome email points them to it" : res.emailed ? "emailed them" : "not emailed";
          await record("contract", "done", `Sent version ${res.contract.template_version} (${how})`);
        } catch (e) {
          await record("contract", e instanceof CreatorDataError && e.status === 400 ? "skipped" : "error", errMsg(e));
        }
      }
    }

    // ---- status + accepted_at (first time only; never downgrade an active creator)
    const top: Record<string, unknown> = { "accept.last_run_at": now() };
    if (!d.accepted_at) {
      top.accepted_at = now();
      // New creators start on the 20-day trial (3 videos, $15 a day). Anyone
      // already paid or credited with earlier months (Isai) keeps their terms.
      if (!d.trial_plan && !d.start_date && !Number(d.starting_completed_months ?? 0)) top.trial_plan = "v2";
      const mapped = mapCreatorStatus(d.status);
      if (mapped === "onboarding" || mapped === "trial") {
        if (d.status !== "onboarding") top.status_changed_at = FieldValue.serverTimestamp();
        top.status = "onboarding";
      }
    }
    await r.update(top);
  } finally {
    await r.update({ "accept.running_until": null }).catch((e) => console.error("accept unlock failed:", e));
  }

  const fresh = await r.get();
  return { accept: acceptOf(fresh.data()), ...(inviteLink ? { invite_link: inviteLink } : {}) };
}

/** Founder sent the set-password link by hand: mark the invite step done. */
export async function markInviteSentManually(id: string): Promise<AcceptRecord> {
  const r = ref(id);
  const snap = await r.get();
  if (!snap.exists) throw new CreatorDataError("Creator not found", 404);
  const inv = snap.data()!.invite as { used_at?: string | null } | undefined;
  if (!inv) throw new CreatorDataError("There's no set-password link yet. Click Accept first.", 400);
  const rec: AcceptStepRecord = {
    status: "done",
    at: new Date().toISOString(),
    detail: inv.used_at ? "Link already used" : "Sent the link manually",
  };
  await r.update({ "accept.steps.invite": rec });
  return acceptOf((await r.get()).data());
}
