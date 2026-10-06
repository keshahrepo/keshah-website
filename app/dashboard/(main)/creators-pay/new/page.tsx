"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Btn, ErrorText, Field, PageHeader, SubNav, api, card, input, muted } from "../_ui";

export default function NewCreatorPage() {
  const router = useRouter();
  const [f, setF] = useState({
    legal_name: "",
    name: "",
    email: "",
    keshah_email: "",
    timezone: "America/New_York",
    start_date: "",
    starting_completed_months: "0",
    campaign_tags: "",
    tracking_url: "",
    tiktok_handle: "",
    instagram_handle: "",
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>("/api/admin/creators", {
        method: "POST",
        body: JSON.stringify({ ...f, starting_completed_months: Number(f.starting_completed_months) }),
      });
      router.push(`/dashboard/creators-pay/${id}`);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Add creator" subtitle="Creates the creator's profile. Portal login invites come later." />
      <SubNav />
      <form onSubmit={submit} style={card}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <Field label="Legal name *">
            <input style={input} value={f.legal_name} onChange={set("legal_name")} required />
          </Field>
          <Field label="Display name" hint="Defaults to legal name">
            <input style={input} value={f.name} onChange={set("name")} />
          </Field>
          <Field label="Email *" hint="Personal email, used for their portal login">
            <input type="email" style={input} value={f.email} onChange={set("email")} required />
          </Field>
          <Field label="keshah.com email">
            <input style={input} value={f.keshah_email} onChange={set("keshah_email")} placeholder="name@keshah.com" />
          </Field>
          <Field label="Timezone *" hint="IANA, e.g. America/Chicago">
            <input style={input} value={f.timezone} onChange={set("timezone")} required />
          </Field>
          <Field label="Start date" hint="Leave blank: pay starts on their first posting day">
            <input type="date" style={input} value={f.start_date} onChange={set("start_date")} />
          </Field>
          <Field label="Starting completed months" hint="Months credited before start (usually 0)">
            <input type="number" min={0} style={input} value={f.starting_completed_months} onChange={set("starting_completed_months")} />
          </Field>
          <Field label="Campaign tags" hint="Comma separated, exact attribution campaign values">
            <input style={input} value={f.campaign_tags} onChange={set("campaign_tags")} placeholder="Name TikTok, Name Insta" />
          </Field>
          <Field label="Tracking link" hint="AppStack campaign link (https://...). Shown in their portal.">
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
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14 }}>
          <Btn kind="primary" type="submit" disabled={busy}>
            {busy ? "Creating..." : "Create creator"}
          </Btn>
          <span style={muted}>Status starts as “onboarding”. Contract and W-9 are set on the creator page.</span>
        </div>
      </form>
    </div>
  );
}
