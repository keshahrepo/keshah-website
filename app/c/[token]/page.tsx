"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Hook {
  id: string;
  title: string;
  category: string;
  talking_points: string[];
  core_message: string;
  reference_video_url: string;
}

interface Assignment {
  id: string;
  hook_id: string;
  hook_title: string;
  hook_category: string;
  onscreen_text?: string;
  date: string;
  status: string;
  tiktok_link: string;
  manager_feedback: string;
  hook: Hook | null;
}

interface HistoryItem {
  id: string;
  hook_title: string;
  hook_category: string;
  date: string;
  status: string;
  tiktok_link: string;
  manager_feedback: string;
}

interface CreatorData {
  creator: {
    id: string;
    name: string;
    videos_per_day: number;
    streak: number;
    status: string;
  };
  assignments: Assignment[];
  history: HistoryItem[];
  today: string;
}

export default function CreatorPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<CreatorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [tiktokLinks, setTiktokLinks] = useState<Record<string, string>>({});
  const [showGuide, setShowGuide] = useState<string | null>(null);

  async function fetchData() {
    try {
      const res = await fetch(`/api/c/${token}`);
      if (!res.ok) {
        setError("Invalid or expired link");
        setLoading(false);
        return;
      }
      const json = await res.json();
      setData(json);
    } catch {
      setError("Failed to load");
    }
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, [token]);

  async function handleComplete(assignmentId: string) {
    setCompletingId(assignmentId);
    const res = await fetch("/api/assignments/complete", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignment_id: assignmentId,
        tiktok_link: tiktokLinks[assignmentId] || "",
        access_token: token,
      }),
    });

    if (res.ok) {
      fetchData();
    }
    setCompletingId(null);
  }

  if (loading) {
    return (
      <div style={containerStyle}>
        <p style={{ color: "rgba(255,255,255,0.4)", textAlign: "center", paddingTop: 100 }}>Loading...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: "center", paddingTop: 100 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "#fff", marginBottom: 8 }}>KESHAH</h1>
          <p style={{ color: "#f87171", fontSize: 14 }}>{error || "Not found"}</p>
        </div>
      </div>
    );
  }

  const { creator, assignments, history } = data;
  const completedToday = assignments.filter((a) => a.status === "completed").length;
  const totalToday = assignments.length;
  const hasAssignments = assignments.length > 0;

  return (
    <div style={containerStyle}>
      <div style={{ maxWidth: 500, margin: "0 auto", padding: "24px 16px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 4 }}>
            KESHAH
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 4 }}>
            Hey {creator.name.split(" ")[0]}
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>

        {/* Streak & progress */}
        <div style={{
          display: "flex",
          gap: 12,
          marginBottom: 24,
        }}>
          <div style={statCardStyle}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#4ade80" }}>{creator.streak}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>day streak</div>
          </div>
          <div style={statCardStyle}>
            <div style={{ fontSize: 28, fontWeight: 700, color: hasAssignments ? "#818cf8" : "rgba(255,255,255,0.2)" }}>
              {hasAssignments ? `${completedToday}/${totalToday}` : "--"}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>today</div>
          </div>
        </div>

        {/* Today's assignments */}
        {!hasAssignments ? (
          <div style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14,
            padding: "40px 20px",
            textAlign: "center",
          }}>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>
              No assignments yet for today
            </p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>
              Your manager will generate them soon
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {assignments.map((assignment, index) => {
              const hook = assignment.hook;
              const isCompleted = assignment.status === "completed";
              const isCompleting = completingId === assignment.id;

              return (
                <div key={assignment.id} style={{
                  background: isCompleted ? "rgba(74,222,128,0.06)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${isCompleted ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: 14,
                  padding: 20,
                }}>
                  {/* Assignment header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        background: isCompleted ? "#4ade80" : "rgba(255,255,255,0.1)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 600,
                        color: isCompleted ? "#000" : "rgba(255,255,255,0.5)",
                      }}>
                        {isCompleted ? "\u2713" : index + 1}
                      </span>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: "#818cf8",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        background: "rgba(129,140,248,0.1)",
                        padding: "3px 8px",
                        borderRadius: 6,
                      }}>
                        {hook?.category || assignment.hook_category || "Hook"}
                      </span>
                    </div>
                    {isCompleted && (
                      <span style={{ fontSize: 11, color: "#4ade80", fontWeight: 500 }}>Done</span>
                    )}
                  </div>

                  {/* Hook title */}
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 12, lineHeight: 1.4 }}>
                    {hook?.title || assignment.hook_title || "Untitled hook"}
                  </h3>

                  {/* On-screen text */}
                  {assignment.onscreen_text && (
                    <div style={{
                      background: "rgba(250,204,21,0.08)",
                      border: "1px solid rgba(250,204,21,0.2)",
                      borderRadius: 10,
                      padding: "10px 14px",
                      marginBottom: 12,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <p style={{
                          fontSize: 11, fontWeight: 600, color: "rgba(250,204,21,0.8)",
                          textTransform: "uppercase", letterSpacing: "0.5px",
                        }}>
                          On-screen text
                        </p>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(assignment.onscreen_text || "");
                          }}
                          style={{
                            padding: "2px 8px",
                            background: "rgba(250,204,21,0.15)",
                            border: "none",
                            borderRadius: 4,
                            color: "rgba(250,204,21,0.9)",
                            fontSize: 10,
                            fontWeight: 500,
                            cursor: "pointer",
                          }}
                        >
                          Copy
                        </button>
                      </div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: "#fde047", lineHeight: 1.5 }}>
                        {assignment.onscreen_text}
                      </p>
                    </div>
                  )}

                  {/* Talking points */}
                  {hook?.talking_points && hook.talking_points.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <p style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.4)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Key talking points
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {hook.talking_points.map((point, i) => (
                          <div key={i} style={{
                            display: "flex", gap: 10, alignItems: "flex-start",
                            background: "rgba(255,255,255,0.04)",
                            borderRadius: 8,
                            padding: "10px 12px",
                          }}>
                            <span style={{
                              minWidth: 22, height: 22, borderRadius: 11,
                              background: "rgba(129,140,248,0.15)",
                              color: "#818cf8",
                              fontSize: 11, fontWeight: 700,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              flexShrink: 0,
                            }}>
                              {i + 1}
                            </span>
                            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", lineHeight: 1.5, margin: 0 }}>{point}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Core message */}
                  {hook?.core_message && (
                    <div style={{
                      background: "rgba(129,140,248,0.08)",
                      borderRadius: 8,
                      padding: "10px 14px",
                      marginBottom: 12,
                    }}>
                      <p style={{ fontSize: 11, fontWeight: 500, color: "rgba(129,140,248,0.7)", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Core message
                      </p>
                      <p style={{ fontSize: 13, color: "#fff", lineHeight: 1.5 }}>
                        {hook.core_message}
                      </p>
                    </div>
                  )}

                  {/* Reference video */}
                  {hook?.reference_video_url && (
                    <a
                      href={hook.reference_video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 12,
                        color: "#818cf8",
                        textDecoration: "none",
                        marginBottom: 16,
                      }}
                    >
                      Watch reference video &rarr;
                    </a>
                  )}

                  {/* Complete section */}
                  {!isCompleted && (
                    <div style={{ marginTop: 8 }}>
                      <input
                        type="url"
                        placeholder="Paste your TikTok link..."
                        value={tiktokLinks[assignment.id] || ""}
                        onChange={(e) => setTiktokLinks((prev) => ({ ...prev, [assignment.id]: e.target.value }))}
                        style={{
                          width: "100%",
                          padding: "10px 14px",
                          background: "rgba(255,255,255,0.06)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 10,
                          color: "#fff",
                          fontSize: 13,
                          outline: "none",
                          marginBottom: 10,
                          boxSizing: "border-box",
                        }}
                      />
                      <button
                        onClick={() => handleComplete(assignment.id)}
                        disabled={isCompleting || !tiktokLinks[assignment.id]}
                        style={{
                          width: "100%",
                          padding: "12px 0",
                          background: !tiktokLinks[assignment.id] ? "rgba(255,255,255,0.06)" : "#4ade80",
                          color: !tiktokLinks[assignment.id] ? "rgba(255,255,255,0.3)" : "#000",
                          fontSize: 14,
                          fontWeight: 600,
                          borderRadius: 10,
                          border: "none",
                          cursor: !tiktokLinks[assignment.id] ? "default" : "pointer",
                        }}
                      >
                        {isCompleting ? "Submitting..." : "Mark Complete"}
                      </button>
                    </div>
                  )}

                  {/* Manager feedback */}
                  {assignment.manager_feedback && (
                    <div style={{
                      marginTop: 12,
                      background: "rgba(74,222,128,0.08)",
                      borderRadius: 8,
                      padding: "10px 14px",
                    }}>
                      <p style={{ fontSize: 11, fontWeight: 500, color: "rgba(74,222,128,0.7)", marginBottom: 2 }}>
                        Manager feedback
                      </p>
                      <p style={{ fontSize: 13, color: "#fff", lineHeight: 1.5 }}>
                        {assignment.manager_feedback}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Getting Started Resources */}
        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 12 }}>Getting Started</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { title: "Setting Up TikTok + Instagram", href: "#setup" },
              { title: "Posting Step-by-Step", href: "#posting" },
            ].map((item) => (
              <button
                key={item.href}
                onClick={() => {
                  const el = document.getElementById(item.href.slice(1));
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                  else {
                    setShowGuide(showGuide === item.href ? null : item.href);
                  }
                }}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  width: "100%",
                  padding: "14px 16px",
                  background: "rgba(129,140,248,0.06)",
                  border: "1px solid rgba(129,140,248,0.12)",
                  borderRadius: 10,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 500, color: "#fff" }}>{item.title}</span>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth={2}
                  style={{ transform: showGuide === item.href ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            ))}
          </div>

          {showGuide === "#setup" && (
            <div style={{ marginTop: 12, background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: "16px 18px" }}>
              <pre style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, fontFamily: "inherit" }}>
{`SETTING UP YOUR TIKTOK ACCOUNT

1. Open the TikTok app and tap "Sign up for TikTok"
2. Tap "Continue with Google" — sign in with your KESHAH Google account
3. Tap "Edit" on your profile
4. Set Name: [your first name]
5. Set Username: [firstname].[lastname]1
6. Set Pronouns
7. Update your profile photo

IMPORTANT: Spend 5-10 minutes each day scrolling TikTok, liking, commenting etc. This helps the algorithm push your videos better when we start posting.

---

SETTING UP YOUR INSTAGRAM ACCOUNT

1. Create a new Instagram account
2. Set Username: [firstname].[lastname]1
3. Use your KESHAH email address
4. Update your profile photo

IMPORTANT: Spend 5-10 minutes each day scrolling Insta reels, liking, commenting etc. This helps the algorithm push your videos better when we start posting.`}
              </pre>
            </div>
          )}

          {showGuide === "#posting" && (
            <div style={{ marginTop: 12, background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: "16px 18px" }}>
              <pre style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, fontFamily: "inherit" }}>
{`TIKTOK POSTING STEP-BY-STEP

1. Record in your camera app. Settings: HD, 30FPS
2. Open TikTok and hit the '+' icon
3. Select your video and hit "Captions"
4. TikTok will auto-generate captions. Click "Text"
5. Type, position, and select style for your header text
6. Insert bio, add hashtags, set your location, and post!

Hashtags: #hairlosssolutions #hairlossremedy #minoxidil #naturalhair

---

INSTAGRAM POSTING STEP-BY-STEP

1. Reuse the same video you just recorded for TikTok
2. Open Instagram and hit the '+' icon
3. Select "Reel" (IMPORTANT — not Post or Story!)
4. Select your video
5. Click "CC" — Instagram will auto-generate captions
6. Type, position, and select style for your header text (Aa)
7. Insert bio, add hashtags, set your location, and share!

Hashtags: #hairlosssolutions #hairlossremedy #minoxidil #naturalhair`}
              </pre>
            </div>
          )}
        </div>

        {/* History */}
        {history.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 12 }}>Recent History</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {history.map((item) => (
                <div key={item.id} style={{
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: 10,
                  padding: "12px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}>
                  <div>
                    <p style={{ fontSize: 13, color: "#fff", marginBottom: 2 }}>
                      {item.hook_title || "Hook"}
                    </p>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{item.date}</p>
                  </div>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: item.status === "completed" ? "#4ade80" : "#f87171",
                    textTransform: "uppercase",
                  }}>
                    {item.status === "completed" ? "Done" : "Missed"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#000",
  color: "#fff",
};

const statCardStyle: React.CSSProperties = {
  flex: 1,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  padding: "16px 20px",
  textAlign: "center",
};
