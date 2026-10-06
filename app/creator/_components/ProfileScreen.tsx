"use client";

import ContractTab from "./ContractTab";
import DaysOffTab from "./DaysOffTab";
import InvoicesTab from "./InvoicesTab";
import { Screen, usePushed } from "./AppShell";
import type { PortalData } from "./types";
import { Eyebrow, Group, ProfileRow } from "./ui";

type Sub = "off" | "invoices" | "contract";
const SUB_TITLE: Record<Sub, string> = { off: "Days off", invoices: "Invoices", contract: "Contract" };

/**
 * The app's MyProfileScreen (lib/screens/profile/profile_screen.dart), reached
 * from the round person button in the Home header: "Profile" title, the
 * #141414 user card (name 18 w600, email 13 at 0.5), grouped rows, and
 * Sign out in its own group at the bottom.
 */
export default function ProfileScreen({
  data,
  inPortal,
  closing,
  onBack,
  onSignOut,
}: {
  data: PortalData;
  inPortal: boolean;
  closing: boolean;
  onBack: () => void;
  onSignOut: () => void;
}) {
  const sub = usePushed<Sub>();
  const c = data.creator;
  const handles = [c.tiktok_handle && `@${c.tiktok_handle} on TikTok`, c.instagram_handle && `@${c.instagram_handle} on Instagram`].filter(Boolean).join(" · ");
  return (
    <>
      <Screen title="Profile" onBack={onBack} closing={closing}>
        <Group style={{ padding: 20 }}>
          {c.name && <div style={{ fontSize: 18, fontWeight: 600, color: "#fff", marginBottom: 4 }}>{c.name}</div>}
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", wordBreak: "break-all" }}>{c.email}</div>
          {c.keshah_email && c.keshah_email !== c.email && (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", wordBreak: "break-all" }}>{c.keshah_email}</div>
          )}
          {handles && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{handles}</div>}
        </Group>

        {inPortal && (
          <>
            <Eyebrow style={{ marginTop: 32 }}>Account</Eyebrow>
            <Group>
              <ProfileRow label="Days off" subtitle="Ask for a day off" onClick={() => sub.open("off")} />
              <ProfileRow label="Invoices" subtitle="Your monthly pay" onClick={() => sub.open("invoices")} />
              <ProfileRow
                label="Contract"
                trailing={data.contract.status === "signed" ? "Signed" : undefined}
                onClick={() => sub.open("contract")}
                isLast
              />
            </Group>
          </>
        )}

        <Group style={{ marginTop: 32 }}>
          <ProfileRow label="Sign out" onClick={onSignOut} isLast />
        </Group>
        <div style={{ height: 40 }} />
      </Screen>
      {sub.value && (
        <Screen title={SUB_TITLE[sub.value]} onBack={sub.close} closing={sub.closing} depth={1}>
          {sub.value === "off" && <DaysOffTab today={data.today.date} />}
          {sub.value === "invoices" && <InvoicesTab />}
          {sub.value === "contract" && <ContractTab />}
        </Screen>
      )}
    </>
  );
}
