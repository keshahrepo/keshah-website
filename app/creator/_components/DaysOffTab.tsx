"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtDateShort } from "@/lib/creators/time";
import { Button, Eyebrow, Field, Group, Msg, P, Pill, ProfileRow, api, inputStyle, statusColor, Skel } from "./ui";

interface DayOff {
  date: string;
  status: "requested" | "approved" | "declined";
  reason?: string;
}

const label: Record<string, string> = { requested: "Waiting", approved: "Approved", declined: "Declined" };

export default function DaysOffTab({ today }: { today: string }) {
  const [list, setList] = useState<DayOff[] | null>(null);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ days_off: DayOff[] }>("/api/creator/days-off").then((r) => setList(r.days_off), (e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await api("/api/creator/days-off", { date, reason });
      setOk("Request sent.");
      setDate("");
      setReason("");
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  // Rendered inside the Profile > Days off screen, which supplies the title.
  return (
    <div>
      <P style={{ marginBottom: 24 }}>An approved day off still counts as a full posting day for your pay and your level.</P>
      <form onSubmit={submit}>
        <Field label="Weekday">
          <input style={inputStyle} type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Reason (optional)">
          <input style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </Field>
        <Msg error={err} ok={ok} />
        <Button type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? "Sending..." : "Send request"}
        </Button>
      </form>

      <Eyebrow style={{ marginTop: 32 }}>Your requests</Eyebrow>
      <Group>
        {list === null && (
          <div style={{ padding: "16px 20px" }}>
            <Skel h={14} style={{ marginBottom: 12 }} />
            <Skel h={14} w="60%" />
          </div>
        )}
        {list?.length === 0 && <ProfileRow label="No requests yet." chevron={false} isLast />}
        {list?.map((d, i) => (
          <ProfileRow
            key={d.date}
            label={fmtDateShort(d.date)}
            subtitle={d.reason || undefined}
            trailing={<Pill color={statusColor[d.status]}>{label[d.status]}</Pill>}
            chevron={false}
            isLast={i === list.length - 1}
          />
        ))}
      </Group>
    </div>
  );
}
