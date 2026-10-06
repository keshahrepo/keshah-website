"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtDateShort } from "@/lib/creators/time";
import { Button, C, Card, Eyebrow, Field, Msg, P, Pill, Row, api, inputStyle, statusColor } from "./ui";

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

  return (
    <div>
      <Card>
        <Eyebrow>Ask for a day off</Eyebrow>
        <P>An approved day off still counts as a full posting day for your pay and your level.</P>
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
      </Card>
      <Card>
        <Eyebrow>Your requests</Eyebrow>
        {list === null && <P style={{ marginBottom: 0 }}>Loading...</P>}
        {list?.length === 0 && <P style={{ marginBottom: 0 }}>No requests yet.</P>}
        {list?.map((d) => (
          <Row key={d.date} style={{ padding: "9px 0", borderTop: C.border }}>
            <div>
              <div style={{ fontSize: 14 }}>{fmtDateShort(d.date)}</div>
              {d.reason && <div style={{ fontSize: 12, color: C.faint }}>{d.reason}</div>}
            </div>
            <Pill color={statusColor[d.status]}>{label[d.status]}</Pill>
          </Row>
        ))}
      </Card>
    </div>
  );
}
