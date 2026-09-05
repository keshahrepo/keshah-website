"use client";

// Client component for /dashboard/pipeline — renders the kanban board
// + edit side panel + "+ new idea" affordance. Talks to server
// actions in actions.ts for writes.
//
// Design language: matches the rest of the KESHAH admin dashboards —
// panel style (rgba(255,255,255,0.04) bg, rgba(255,255,255,0.08)
// border, borderRadius 10-12), pill-shaped filter tabs above the
// board, tabular numerics, uppercase 10-11px eyebrow labels.
//
// Two view modes:
//   1. All versions (default) — full kanban across every status.
//   2. Single version selected via `?version=<slug>` — release-notes
//      view. For a shipped version: "what did this release contain",
//      grouped by status with shipped at the top. For the in-flight
//      version: only ideas currently building or assigned.

import { useMemo, useState, useTransition } from "react";
import { KANBAN_COLUMNS, type Idea, type IdeaStatus } from "@/lib/pipeline/types";
import { createIdea, updateIdea } from "./actions";
import { PipelineVersionTabs } from "../_lib/PipelineVersionTabs";

interface MetricOption {
  key: string;
  label: string;
  group: string;
}
interface VersionOption {
  slug: string;
  label: string;
  isInFlight: boolean;
}

export default function PipelineClient({
  initialIdeas,
  metricOptions,
  versionOptions,
  selectedVersionSlug,
}: {
  initialIdeas: Idea[];
  metricOptions: MetricOption[];
  versionOptions: VersionOption[];
  selectedVersionSlug: string | null;
}) {
  const [ideas, setIdeas] = useState(initialIdeas);
  const [openIdeaId, setOpenIdeaId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selectedVersion = useMemo(
    () =>
      selectedVersionSlug
        ? versionOptions.find((v) => v.slug === selectedVersionSlug) ?? null
        : null,
    [selectedVersionSlug, versionOptions],
  );

  // Counts per version for the tab pills — computed off the live
  // `ideas` state so an edit that reassigns an idea updates the count
  // without a refresh.
  const versionTabOptions = useMemo(
    () =>
      versionOptions.map((v) => ({
        ...v,
        count: ideas.filter((i) => i.assigned_version === v.slug).length,
      })),
    [ideas, versionOptions],
  );

  const byColumn = useMemo(() => {
    const groups: Record<IdeaStatus, Idea[]> = {
      bank: [],
      assigned: [],
      building: [],
      shipped: [],
      parked: [],
    };
    for (const i of ideas) groups[i.status].push(i);
    return groups;
  }, [ideas]);

  const openIdea = ideas.find((i) => i.id === openIdeaId) ?? null;

  const metricLabelFor = (key: string | null): string | null => {
    if (!key) return null;
    return metricOptions.find((m) => m.key === key)?.label ?? key;
  };
  const versionLabelFor = (slug: string | null): string | null => {
    if (!slug) return null;
    return versionOptions.find((v) => v.slug === slug)?.label ?? slug;
  };

  return (
    <div>
      <PipelineVersionTabs
        selectedSlug={selectedVersionSlug}
        options={versionTabOptions}
        allCount={ideas.length}
      />

      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 16,
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          style={btnStyle()}
        >
          + New idea
        </button>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
          Adds to Ideas bank. Move through columns via card side panel.
        </span>
      </div>

      {selectedVersion ? (
        <VersionSummary
          version={selectedVersion}
          ideas={ideas.filter(
            (i) => i.assigned_version === selectedVersion.slug,
          )}
          onOpen={(id) => setOpenIdeaId(id)}
          metricLabelFor={metricLabelFor}
          versionLabelFor={versionLabelFor}
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${KANBAN_COLUMNS.length}, minmax(260px, 1fr))`,
            gap: 12,
            overflowX: "auto",
            paddingBottom: 8,
          }}
        >
          {KANBAN_COLUMNS.map((col) => (
            <div key={col.id} style={columnStyle()}>
              <div style={columnHeaderStyle()}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.55)",
                  }}
                >
                  {col.label}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.4)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {byColumn[col.id].length}
                </span>
              </div>
              <p style={columnHintStyle()}>{col.hint}</p>
              <div style={{ display: "grid", gap: 8 }}>
                {byColumn[col.id].map((idea) => (
                  <IdeaCard
                    key={idea.id}
                    idea={idea}
                    onOpen={() => setOpenIdeaId(idea.id)}
                    metricLabel={metricLabelFor(idea.target_metric)}
                    versionLabel={versionLabelFor(idea.assigned_version)}
                  />
                ))}
                {byColumn[col.id].length === 0 && (
                  <div style={emptyColStyle()}>Nothing here yet.</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {openIdea && (
        <SidePanel
          idea={openIdea}
          metricOptions={metricOptions}
          versionOptions={versionOptions}
          onClose={() => setOpenIdeaId(null)}
          onSave={(id, updates) => {
            startTransition(async () => {
              const r = await updateIdea(id, updates);
              if (r.ok) {
                // Optimistic-ish update: patch local state so the
                // page reflects changes without a hard refresh.
                setIdeas((prev) =>
                  prev.map((i) =>
                    i.id === id
                      ? {
                          ...i,
                          ...updates,
                          updated_at: new Date().toISOString(),
                        }
                      : i,
                  ),
                );
              } else {
                alert(r.error);
              }
            });
          }}
          isSaving={isPending}
        />
      )}

      {addOpen && (
        <AddIdeaModal
          metricOptions={metricOptions}
          onClose={() => setAddOpen(false)}
          onCreate={(input) => {
            startTransition(async () => {
              const r = await createIdea(input);
              if (r.ok) {
                setAddOpen(false);
                // Reload from server so the new doc appears — could
                // optimistically add it locally but easier to just
                // refresh state on next server-component pass.
                if (typeof window !== "undefined") window.location.reload();
              } else {
                alert(r.error);
              }
            });
          }}
          isSaving={isPending}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Version-filtered "release notes" view.
//
// Shipped version → show every idea assigned to it, grouped by status
// with shipped ideas first. Non-shipped ideas surface consciously
// (e.g. a "shipped-in-5.18" idea that ended up parked mid-release) so
// the reader isn't surprised by silent omissions.
//
// In-flight version → narrow to ideas currently being worked on
// (status = building | assigned). Bank / parked / previously-shipped
// items assigned to the in-flight slug are excluded intentionally —
// that view answers "what's landing next", not "everything ever
// tagged".

interface StatusGroupSpec {
  status: IdeaStatus;
  label: string;
  checkmark: boolean;
}

const SHIPPED_VIEW_GROUPS: StatusGroupSpec[] = [
  { status: "shipped", label: "Shipped", checkmark: true },
  { status: "building", label: "Still building", checkmark: false },
  { status: "assigned", label: "Assigned but not shipped", checkmark: false },
  { status: "bank", label: "Back in the bank", checkmark: false },
  { status: "parked", label: "Parked mid-release", checkmark: false },
];

const IN_FLIGHT_VIEW_GROUPS: StatusGroupSpec[] = [
  { status: "building", label: "Building now", checkmark: false },
  { status: "assigned", label: "Assigned", checkmark: false },
];

function VersionSummary({
  version,
  ideas,
  onOpen,
  metricLabelFor,
  versionLabelFor,
}: {
  version: VersionOption;
  ideas: Idea[];
  onOpen: (id: string) => void;
  metricLabelFor: (key: string | null) => string | null;
  versionLabelFor: (slug: string | null) => string | null;
}) {
  // Strip " (in flight)" suffix so the header reads "Next release: 5.19"
  // rather than the redundant "Next release: 5.19 (in flight)".
  const shortLabel = version.label.replace(/\s*\(in flight\)\s*$/i, "");
  const title = version.isInFlight
    ? `Next release: ${shortLabel}`
    : `Shipped in ${version.label}`;
  const subtitle = version.isInFlight
    ? "Ideas currently building or queued for this release."
    : "Every idea that was tagged to this release, grouped by outcome.";

  const groupSpecs = version.isInFlight
    ? IN_FLIGHT_VIEW_GROUPS
    : SHIPPED_VIEW_GROUPS;
  const groups = groupSpecs
    .map((g) => ({ ...g, ideas: ideas.filter((i) => i.status === g.status) }))
    .filter((g) => g.ideas.length > 0);

  return (
    <div>
      <div
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          padding: "16px 18px",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: version.isInFlight ? "#DAA520" : "#5AB758",
            marginBottom: 6,
          }}
        >
          {version.isInFlight ? "In flight" : "Shipped"}
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "#fff",
            marginBottom: 4,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
          {subtitle}
        </div>
      </div>

      {groups.length === 0 ? (
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            padding: "24px 18px",
            fontSize: 13,
            color: "rgba(255,255,255,0.5)",
            textAlign: "center",
          }}
        >
          {version.isInFlight
            ? "No ideas are actively building or assigned to this release yet. Assign one via any idea's side panel."
            : "No ideas were tagged to this release."}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 20 }}>
          {groups.map((g) => (
            <section key={g.status}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.55)",
                  }}
                >
                  {g.label}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.4)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {g.ideas.length}
                </div>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {g.ideas.map((idea) => (
                  <IdeaRow
                    key={idea.id}
                    idea={idea}
                    onOpen={() => onOpen(idea.id)}
                    metricLabel={metricLabelFor(idea.target_metric)}
                    versionLabel={versionLabelFor(idea.assigned_version)}
                    checkmark={g.checkmark}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// Wider variant of IdeaCard, tuned for the single-column release-notes
// layout. Same click behaviour + chip set — just laid out horizontally
// so scanning a long list feels like reading release notes rather than
// a kanban column.
function IdeaRow({
  idea,
  onOpen,
  metricLabel,
  versionLabel,
  checkmark,
}: {
  idea: Idea;
  onOpen: () => void;
  metricLabel: string | null;
  versionLabel: string | null;
  checkmark: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        padding: "12px 14px",
        display: "grid",
        gap: 6,
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
        color: "inherit",
        transition: "border-color 0.15s, background 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor =
          "rgba(255,255,255,0.18)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor =
          "rgba(255,255,255,0.08)";
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        {checkmark && (
          <span
            aria-hidden
            style={{
              flexShrink: 0,
              width: 18,
              height: 18,
              borderRadius: 999,
              background: "rgba(90,183,88,0.18)",
              border: "1px solid rgba(90,183,88,0.4)",
              color: "#5AB758",
              fontSize: 11,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
              marginTop: 1,
            }}
          >
            ✓
          </span>
        )}
        <span style={pNumStyle()}>{idea.id.toUpperCase()}</span>
        <span
          style={{
            fontFamily: 'ui-serif, "New York", Georgia, serif',
            fontSize: 15,
            fontWeight: 400,
            color: "#f4f2ec",
            letterSpacing: "-0.01em",
            lineHeight: 1.3,
            flex: 1,
          }}
        >
          {idea.title}
        </span>
      </div>
      {idea.eli5 && (
        <p
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.55)",
            margin: 0,
            lineHeight: 1.5,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {idea.eli5}
        </p>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
        {metricLabel && <span style={chipStyle("metric")}>{metricLabel}</span>}
        {versionLabel && (
          <span style={chipStyle("version")}>{versionLabel}</span>
        )}
        {idea.dependencies.length > 0 && (
          <span style={chipStyle("dep")}>
            deps: {idea.dependencies.map((d) => d.toUpperCase()).join(", ")}
          </span>
        )}
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════

function IdeaCard({
  idea,
  onOpen,
  metricLabel,
  versionLabel,
}: {
  idea: Idea;
  onOpen: () => void;
  metricLabel: string | null;
  versionLabel: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={cardStyle()}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor =
          "rgba(255,255,255,0.16)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor =
          "rgba(255,255,255,0.08)";
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <span style={pNumStyle()}>{idea.id.toUpperCase()}</span>
        <span
          style={{
            fontFamily: 'ui-serif, "New York", Georgia, serif',
            fontSize: 15,
            fontWeight: 400,
            color: "#f4f2ec",
            letterSpacing: "-0.01em",
            lineHeight: 1.25,
            textAlign: "left",
            flex: 1,
          }}
        >
          {idea.title}
        </span>
      </div>
      <p
        style={{
          fontSize: 12,
          color: "rgba(255,255,255,0.55)",
          margin: 0,
          lineHeight: 1.5,
          textAlign: "left",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {idea.eli5}
      </p>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginTop: 4,
        }}
      >
        {metricLabel && <span style={chipStyle("metric")}>{metricLabel}</span>}
        {versionLabel && (
          <span style={chipStyle("version")}>{versionLabel}</span>
        )}
        {idea.dependencies.length > 0 && (
          <span style={chipStyle("dep")}>
            deps: {idea.dependencies.map((d) => d.toUpperCase()).join(", ")}
          </span>
        )}
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════

function SidePanel({
  idea,
  metricOptions,
  versionOptions,
  onClose,
  onSave,
  isSaving,
}: {
  idea: Idea;
  metricOptions: MetricOption[];
  versionOptions: VersionOption[];
  onClose: () => void;
  onSave: (id: string, updates: Partial<Idea>) => void;
  isSaving: boolean;
}) {
  const [draft, setDraft] = useState({
    title: idea.title,
    eli5: idea.eli5,
    description: idea.description,
    status: idea.status,
    target_metric: idea.target_metric ?? "",
    assigned_version: idea.assigned_version ?? "",
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 100,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(540px, 100vw)",
          background: "#111",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          padding: "28px 28px 40px",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <span style={pNumStyle()}>{idea.id.toUpperCase()}</span>
          <button
            type="button"
            onClick={onClose}
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.5)",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        <FieldLabel>Title</FieldLabel>
        <input
          type="text"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          style={inputStyle()}
        />

        <FieldLabel>ELI5</FieldLabel>
        <textarea
          value={draft.eli5}
          onChange={(e) => setDraft((d) => ({ ...d, eli5: e.target.value }))}
          rows={4}
          style={{ ...inputStyle(), resize: "vertical", fontFamily: "inherit" }}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <FieldLabel>Status</FieldLabel>
            <select
              value={draft.status}
              onChange={(e) =>
                setDraft((d) => ({ ...d, status: e.target.value as IdeaStatus }))
              }
              style={inputStyle()}
            >
              <option value="bank">Ideas bank</option>
              <option value="assigned">Next release</option>
              <option value="building">Building</option>
              <option value="shipped">Done</option>
              <option value="parked">Parked</option>
            </select>
          </div>
          <div>
            <FieldLabel>Assigned version</FieldLabel>
            <select
              value={draft.assigned_version}
              onChange={(e) =>
                setDraft((d) => ({ ...d, assigned_version: e.target.value }))
              }
              style={inputStyle()}
            >
              <option value="">— none —</option>
              {versionOptions.map((v) => (
                <option key={v.slug} value={v.slug}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <FieldLabel>Target metric</FieldLabel>
        <select
          value={draft.target_metric}
          onChange={(e) =>
            setDraft((d) => ({ ...d, target_metric: e.target.value }))
          }
          style={inputStyle()}
        >
          <option value="">— none —</option>
          {metricOptions.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>

        <FieldLabel>Long-form description (markdown)</FieldLabel>
        <textarea
          value={draft.description}
          onChange={(e) =>
            setDraft((d) => ({ ...d, description: e.target.value }))
          }
          rows={12}
          style={{
            ...inputStyle(),
            resize: "vertical",
            fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
            fontSize: 12,
          }}
          placeholder="Goal / Idea / Why / Implementation choices / Files that would change…"
        />

        {idea.parked_reason && (
          <>
            <FieldLabel>Parked reason</FieldLabel>
            <p style={{ ...readonlyStyle() }}>{idea.parked_reason}</p>
          </>
        )}
        {idea.parked_unpark_trigger && (
          <>
            <FieldLabel>Unpark trigger</FieldLabel>
            <p style={{ ...readonlyStyle() }}>{idea.parked_unpark_trigger}</p>
          </>
        )}

        <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
          <button
            type="button"
            disabled={isSaving}
            onClick={() =>
              onSave(idea.id, {
                title: draft.title,
                eli5: draft.eli5,
                description: draft.description,
                status: draft.status,
                target_metric: draft.target_metric || null,
                assigned_version: draft.assigned_version || null,
              })
            }
            style={{
              ...btnStyle(),
              background: "#DAA520",
              color: "#000",
              borderColor: "#DAA520",
              opacity: isSaving ? 0.6 : 1,
            }}
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onClose} style={btnStyle()}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════

function AddIdeaModal({
  metricOptions,
  onClose,
  onCreate,
  isSaving,
}: {
  metricOptions: MetricOption[];
  onClose: () => void;
  onCreate: (input: {
    title: string;
    eli5: string;
    target_metric: string | null;
    ship_cluster: string | null;
  }) => void;
  isSaving: boolean;
}) {
  const [draft, setDraft] = useState({
    title: "",
    eli5: "",
    target_metric: "",
    ship_cluster: "",
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#111",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          padding: 28,
          width: "min(480px, 100vw)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <h2
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "#fff",
            margin: "0 0 8px",
          }}
        >
          New idea
        </h2>
        <p
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.5)",
            margin: "0 0 20px",
          }}
        >
          Lands in Ideas bank. Move to Next Release later once it earns a
          target metric.
        </p>

        <FieldLabel>Title</FieldLabel>
        <input
          type="text"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          style={inputStyle()}
          placeholder="Short, verb-first"
        />

        <FieldLabel>ELI5 (optional)</FieldLabel>
        <textarea
          value={draft.eli5}
          onChange={(e) => setDraft((d) => ({ ...d, eli5: e.target.value }))}
          rows={3}
          style={{ ...inputStyle(), resize: "vertical", fontFamily: "inherit" }}
          placeholder="One-liner — what does it do?"
        />

        <FieldLabel>Target metric (optional)</FieldLabel>
        <select
          value={draft.target_metric}
          onChange={(e) =>
            setDraft((d) => ({ ...d, target_metric: e.target.value }))
          }
          style={inputStyle()}
        >
          <option value="">— pick later —</option>
          {metricOptions.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>

        <FieldLabel>Ship cluster (optional)</FieldLabel>
        <input
          type="text"
          value={draft.ship_cluster}
          onChange={(e) =>
            setDraft((d) => ({ ...d, ship_cluster: e.target.value }))
          }
          style={inputStyle()}
          placeholder="e.g. Day 1 activation, Habit loop"
        />

        <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
          <button
            type="button"
            disabled={isSaving || !draft.title.trim()}
            onClick={() =>
              onCreate({
                title: draft.title,
                eli5: draft.eli5,
                target_metric: draft.target_metric || null,
                ship_cluster: draft.ship_cluster || null,
              })
            }
            style={{
              ...btnStyle(),
              background: "#DAA520",
              color: "#000",
              borderColor: "#DAA520",
              opacity: isSaving || !draft.title.trim() ? 0.6 : 1,
            }}
          >
            {isSaving ? "Creating…" : "Create"}
          </button>
          <button type="button" onClick={onClose} style={btnStyle()}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Styles

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.45)",
        marginTop: 16,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

const columnStyle = (): React.CSSProperties => ({
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  padding: 12,
  minHeight: 300,
});
const columnHeaderStyle = (): React.CSSProperties => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  padding: "4px 4px 8px",
});
const columnHintStyle = (): React.CSSProperties => ({
  fontSize: 11,
  color: "rgba(255,255,255,0.35)",
  margin: "0 4px 12px",
  lineHeight: 1.5,
});
const emptyColStyle = (): React.CSSProperties => ({
  fontSize: 11,
  color: "rgba(255,255,255,0.25)",
  padding: "12px 4px",
  fontStyle: "italic",
});
const cardStyle = (): React.CSSProperties => ({
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
  padding: 12,
  display: "grid",
  gap: 8,
  cursor: "pointer",
  width: "100%",
  textAlign: "left",
  color: "inherit",
  transition: "border-color 0.15s",
});
const pNumStyle = (): React.CSSProperties => ({
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  fontSize: 10,
  letterSpacing: 0.6,
  color: "#DAA520",
  background: "rgba(218,165,32,0.12)",
  border: "1px solid rgba(218,165,32,0.28)",
  borderRadius: 4,
  padding: "2px 6px",
  textTransform: "uppercase",
  flexShrink: 0,
});
const chipStyle = (
  kind: "metric" | "version" | "dep",
): React.CSSProperties => ({
  fontSize: 10,
  fontWeight: 500,
  padding: "2px 6px",
  borderRadius: 4,
  background:
    kind === "metric"
      ? "rgba(90,183,88,0.12)"
      : kind === "version"
        ? "rgba(218,165,32,0.12)"
        : "rgba(255,255,255,0.06)",
  color:
    kind === "metric"
      ? "#5AB758"
      : kind === "version"
        ? "#DAA520"
        : "rgba(255,255,255,0.55)",
  border: `1px solid ${
    kind === "metric"
      ? "rgba(90,183,88,0.25)"
      : kind === "version"
        ? "rgba(218,165,32,0.25)"
        : "rgba(255,255,255,0.08)"
  }`,
});
const inputStyle = (): React.CSSProperties => ({
  width: "100%",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  padding: "10px 12px",
  color: "#fff",
  fontSize: 13,
  fontFamily: "inherit",
  boxSizing: "border-box",
});
const readonlyStyle = (): React.CSSProperties => ({
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.05)",
  borderRadius: 6,
  padding: 10,
  fontSize: 12,
  color: "rgba(255,255,255,0.65)",
  margin: "0 0 4px",
  lineHeight: 1.55,
});
const btnStyle = (): React.CSSProperties => ({
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  padding: "8px 14px",
  color: "#fff",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
});
