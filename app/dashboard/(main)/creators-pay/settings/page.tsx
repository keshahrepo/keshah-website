"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Btn, ErrorText, Field, Loading, PageHeader, Pill, SubNav, api, card, fileUrl, h3, input, muted, td, th } from "../_ui";

interface Template {
  version: string;
  title: string;
  sha256: string;
  storage_path: string;
  pages: number;
  bytes: number;
  uploaded_at: string;
}
interface Settings {
  contract: {
    founder_name: string;
    founder_title: string;
    entity_name: string;
    signature_path?: string;
    signature_sha256?: string;
    signature_updated_at?: string;
    current_template_version?: string;
  };
  ready: boolean;
  signature_url: string | null;
  templates: Template[];
  placeholder: { version: string; title: string; public_url: string };
  consent_text_version: string;
  portal: { slack_invite_url: string; env_fallback: boolean };
}

function readAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Couldn't read the file"));
    r.readAsDataURL(file);
  });
}

export default function CreatorSettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => {
    api<Settings>("/api/admin/creators/settings").then(setS, (e) => setErr(String(e.message ?? e)));
  }, []);
  useEffect(load, [load]);

  return (
    <div>
      <PageHeader title="Contract signing & settings" subtitle="Contract versions, your countersignature, and creator portal settings" />
      <SubNav />
      <ErrorText>{err}</ErrorText>
      {!s ? (
        !err && <Loading />
      ) : (
        <>
          <div style={{ ...card, borderColor: s.ready ? "rgba(74,222,128,0.35)" : "rgba(251,191,36,0.35)" }}>
            <h3 style={h3}>{s.ready ? "Ready to send contracts" : "Not ready to send contracts yet"}</h3>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
              <li style={{ color: s.contract.current_template_version ? "#4ade80" : "#fbbf24" }}>
                {s.contract.current_template_version
                  ? `Contract version ${s.contract.current_template_version} is current`
                  : "Upload the final contract PDF (the v0 draft can't be sent)"}
              </li>
              <li style={{ color: s.contract.signature_path ? "#4ade80" : "#fbbf24" }}>
                {s.contract.signature_path ? "Your signature is on file" : "Add your signature"}
              </li>
            </ul>
            <p style={{ ...muted, marginTop: 10, marginBottom: 0 }}>
              Then open a creator and press Send contract. They sign on the first step of their portal, and both of you get the signed PDF by email.
            </p>
          </div>
          <Templates s={s} reload={load} />
          <Countersignature s={s} reload={load} />
          <PortalSettings s={s} reload={load} />
        </>
      )}
    </div>
  );
}

function Templates({ s, reload }: { s: Settings; reload: () => void }) {
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("Content Creator Agreement");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirming, setConfirming] = useState(false);

  async function upload() {
    setErr("");
    if (!version.trim()) return setErr("Give it a version label, e.g. v1.");
    if (!file) return setErr("Choose the PDF.");
    if (file.type && file.type !== "application/pdf") return setErr("That isn't a PDF.");
    if (file.size > 3 * 1024 * 1024) return setErr("PDF is over 3MB.");
    if (!confirming) return setConfirming(true);
    setBusy(true);
    try {
      const pdf_base64 = await readAsDataUrl(file);
      await api("/api/admin/creators/settings/templates", { method: "POST", body: JSON.stringify({ version: version.trim(), title, pdf_base64 }) });
      setVersion("");
      setFile(null);
      setConfirming(false);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  async function makeCurrent(v: string) {
    setErr("");
    try {
      await api("/api/admin/creators/settings/templates", { method: "PATCH", body: JSON.stringify({ current_template_version: v }) });
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div style={card}>
      <h3 style={h3}>Contract versions</h3>
      <p style={{ ...muted, marginTop: -6, marginBottom: 12 }}>
        Each upload is a new, permanent version. Its SHA-256 is recorded and checked again when a creator signs, so a version can never be
        swapped out. To change the contract, upload a new version and send it again.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
          <thead>
            <tr>
              <th style={th}>Version</th>
              <th style={th}>Title</th>
              <th style={th}>Pages</th>
              <th style={th}>Uploaded</th>
              <th style={th}>SHA-256</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {s.templates.map((t) => (
              <tr key={t.version}>
                <td style={td}>
                  {t.version} {s.contract.current_template_version === t.version && <Pill color="#4ade80">current</Pill>}
                </td>
                <td style={td}>{t.title}</td>
                <td style={td}>{t.pages}</td>
                <td style={td}>{t.uploaded_at.slice(0, 10)}</td>
                <td style={{ ...td, fontFamily: "monospace", fontSize: 11 }}>{t.sha256.slice(0, 16)}…</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  <a href={fileUrl(t.storage_path)} target="_blank" rel="noreferrer" style={{ color: "#60a5fa", fontSize: 12, marginRight: 10 }}>
                    View
                  </a>
                  {s.contract.current_template_version !== t.version && <Btn onClick={() => makeCurrent(t.version)}>Make current</Btn>}
                </td>
              </tr>
            ))}
            <tr>
              <td style={td}>
                {s.placeholder.version} <Pill color="#fbbf24">draft</Pill>
              </td>
              <td style={td}>{s.placeholder.title}</td>
              <td style={td}>–</td>
              <td style={td}>–</td>
              <td style={td}>–</td>
              <td style={td}>
                <a href={s.placeholder.public_url} target="_blank" rel="noreferrer" style={{ color: "#60a5fa", fontSize: 12 }}>
                  View
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 14 }}>
        <Field label="Version label" hint="e.g. v1 (can't be reused)">
          <input style={input} value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v1" />
        </Field>
        <Field label="Title" hint="Printed on the signature page">
          <input style={input} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Final contract PDF">
          <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ ...input, padding: 6 }} />
        </Field>
      </div>
      <ErrorText>{err}</ErrorText>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
        <Btn kind="primary" onClick={upload} disabled={busy}>
          {busy ? "Uploading..." : confirming ? `Confirm: upload ${version.trim()} and make it current` : "Upload version"}
        </Btn>
        {confirming && (
          <>
            <Btn onClick={() => setConfirming(false)}>Cancel</Btn>
            <span style={muted}>Versions are permanent. Check it&apos;s the final PDF.</span>
          </>
        )}
      </div>
    </div>
  );
}

function Countersignature({ s, reload }: { s: Settings; reload: () => void }) {
  const [f, setF] = useState({ founder_name: s.contract.founder_name, founder_title: s.contract.founder_title, entity_name: s.contract.entity_name });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0b1a4a";
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = e.currentTarget.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setDrawn(true);
  }
  function clear() {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setDrawn(false);
  }

  async function saveSignature(dataUrl: string) {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await api("/api/admin/creators/settings/signature", { method: "POST", body: JSON.stringify({ data_url: dataUrl }) });
      setMsg("Signature saved");
      clear();
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveDetails() {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await api("/api/admin/creators/settings", { method: "PUT", body: JSON.stringify(f) });
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
      <h3 style={h3}>Your countersignature</h3>
      <p style={{ ...muted, marginTop: -6, marginBottom: 12 }}>
        Added automatically to the signature page when a creator signs. Changing it only affects contracts signed after the change.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <Field label="Your name">
          <input style={input} value={f.founder_name} onChange={(e) => setF({ ...f, founder_name: e.target.value })} />
        </Field>
        <Field label="Title">
          <input style={input} value={f.founder_title} onChange={(e) => setF({ ...f, founder_title: e.target.value })} />
        </Field>
        <Field label="Legal entity">
          <input style={input} value={f.entity_name} onChange={(e) => setF({ ...f, entity_name: e.target.value })} />
        </Field>
      </div>
      <div style={{ marginTop: 10 }}>
        <Btn onClick={saveDetails} disabled={busy}>
          Save details
        </Btn>
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 18, alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 320px" }}>
          <div style={{ ...muted, marginBottom: 6 }}>Draw your signature</div>
          <canvas
            ref={canvas}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={() => (drawing.current = false)}
            onPointerLeave={() => (drawing.current = false)}
            style={{ width: "100%", maxWidth: 460, height: 150, background: "#fff", borderRadius: 8, touchAction: "none", cursor: "crosshair", display: "block" }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Btn kind="primary" disabled={!drawn || busy} onClick={() => saveSignature(canvas.current!.toDataURL("image/png"))}>
              Save drawn signature
            </Btn>
            <Btn onClick={clear} disabled={busy}>
              Clear
            </Btn>
            <label style={{ ...muted, cursor: "pointer" }}>
              or upload a PNG{" "}
              <input
                type="file"
                accept="image/png"
                style={{ fontSize: 12 }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) saveSignature(await readAsDataUrl(file));
                }}
              />
            </label>
          </div>
        </div>
        <div style={{ flex: "0 1 260px" }}>
          <div style={{ ...muted, marginBottom: 6 }}>On file</div>
          {s.signature_url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.signature_url} alt="Your signature" style={{ maxWidth: 240, maxHeight: 90, background: "#fff", borderRadius: 8, padding: 6 }} />
              <div style={{ ...muted, fontSize: 11, marginTop: 4 }}>updated {s.contract.signature_updated_at?.slice(0, 10)}</div>
            </>
          ) : (
            <span style={{ color: "#fbbf24", fontSize: 13 }}>No signature yet</span>
          )}
        </div>
      </div>
      <ErrorText>{err}</ErrorText>
      {msg && <p style={{ color: "#4ade80", fontSize: 13 }}>{msg}</p>}
    </div>
  );
}

function PortalSettings({ s, reload }: { s: Settings; reload: () => void }) {
  const [slack, setSlack] = useState(s.portal.slack_invite_url);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  async function save() {
    setErr("");
    setMsg("");
    try {
      await api("/api/admin/creators/settings", { method: "PUT", body: JSON.stringify({ slack_invite_url: slack }) });
      setMsg("Saved");
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <div style={card}>
      <h3 style={h3}>Creator portal</h3>
      <Field
        label="Slack invite link"
        hint={s.portal.env_fallback ? "Empty here, so the portal uses the SLACK_INVITE_URL env var." : "Shown on the Join Slack step. Leave empty to hide it."}
      >
        <input style={input} value={slack} onChange={(e) => setSlack(e.target.value)} placeholder="https://join.slack.com/..." />
      </Field>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
        <Btn kind="primary" onClick={save}>
          Save
        </Btn>
        {msg && <span style={{ color: "#4ade80", fontSize: 13 }}>{msg}</span>}
      </div>
      <ErrorText>{err}</ErrorText>
    </div>
  );
}
