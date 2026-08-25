"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { STEP_ORDER, type QuizAnswers, type StartStep } from "./types";

interface FlowState {
  step: StartStep;
  stepIndex: number;
  totalSteps: number;
  answers: QuizAnswers;
  next: () => void;
  back: () => void;
  goTo: (step: StartStep) => void;
  updateAnswers: (patch: Partial<QuizAnswers>) => void;
}

const FlowContext = createContext<FlowState | null>(null);

// Bump this whenever the step order or shape of saved state changes — old
// localStorage entries under the previous key become orphaned and the user
// starts fresh at the new first step. Otherwise users mid-funnel resume at a
// step that's no longer where they think it should be (e.g. founderStory when
// pinchTest is now the opening step).
const DEFAULT_STORAGE_KEY = "keshah_start_state_v20";

interface PersistedState {
  step: StartStep;
  answers: QuizAnswers;
}

function loadPersisted(storageKey: string, order: StartStep[]): PersistedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (!parsed.step || !order.includes(parsed.step)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePersisted(storageKey: string, state: PersistedState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Ignore quota / privacy mode failures.
  }
}

interface FlowProviderProps {
  children: ReactNode;
  /** Override the step order. Defaults to STEP_ORDER from types.ts. */
  stepOrder?: StartStep[];
  /** Override the localStorage key. Different funnels use different keys
   *  so resuming one doesn't accidentally drop you into another. */
  storageKey?: string;
}

export function FlowProvider({ children, stepOrder: stepOrderProp, storageKey }: FlowProviderProps) {
  // Always start at the first step in the runtime step order. Don't hardcode
  // a step name here — when the order changes, the default would silently
  // desync from the intended opening step.
  const stepOrder = useMemo(() => stepOrderProp ?? STEP_ORDER, [stepOrderProp]);
  const persistKey = storageKey ?? DEFAULT_STORAGE_KEY;
  const [step, setStep] = useState<StartStep>(stepOrder[0]);
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount so users can resume mid-funnel.
  useEffect(() => {
    const persisted = loadPersisted(persistKey, stepOrder);
    if (persisted) {
      setStep(persisted.step);
      setAnswers(persisted.answers);
    }
    setHydrated(true);
  }, [persistKey, stepOrder]);

  // Persist on every change after hydration.
  useEffect(() => {
    if (!hydrated) return;
    savePersisted(persistKey, { step, answers });
  }, [hydrated, step, answers, persistKey]);

  // Track step views for funnel analytics. Fire-and-forget POST to
  // /api/funnel/track on every step transition. Uses a session ID so
  // we can count unique users per step, not just total views.
  useEffect(() => {
    if (!hydrated) return;
    try {
      let sessionId = sessionStorage.getItem("keshah_funnel_session");
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        sessionStorage.setItem("keshah_funnel_session", sessionId);
      }
      const source = (() => {
        if (typeof window === "undefined") return "us";
        const p = window.location.pathname;
        // Check more-specific paths first — they all match /startindia prefix.
        if (p.startsWith("/startindiafree2")) return "india_premium_trial";
        if (p.startsWith("/startindia2")) return "india2";
        if (p.startsWith("/startindia3")) return "india3";
        if (p.startsWith("/startindia")) return "india";
        // /f/{slug} — config-driven creator funnel routes. Look up
        // attribution from the creator config; falls back to
        // "us_creator_{slug}" if the slug isn't registered yet.
        if (p.startsWith("/f/")) {
          const slug = p.split("/")[2];
          // Creator-config lookup moved out — funnel-config module was
          // deleted. Fall back to the slug-tagged attribution so the
          // funnel-track endpoint still records per-creator segmentation.
          return slug ? `us_creator_${slug}` : "us_creator_unknown";
        }
        if (p.startsWith("/mandy")) return "us_women_mandy";
        if (p.startsWith("/startus3")) return "us_weekly_trial";
        if (p.startsWith("/startus2")) return "us_kit";
        if (p.startsWith("/startfree")) return "us_trial";
        return "us";
      })();
      fetch("/api/funnel/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, sessionId, source }),
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }, [hydrated, step]);

  const stepIndex = stepOrder.indexOf(step);

  const next = useCallback(() => {
    setStep((current) => {
      const i = stepOrder.indexOf(current);
      if (i < 0 || i >= stepOrder.length - 1) return current;
      return stepOrder[i + 1];
    });
  }, [stepOrder]);

  const back = useCallback(() => {
    setStep((current) => {
      const i = stepOrder.indexOf(current);
      if (i <= 0) return current;
      return stepOrder[i - 1];
    });
  }, [stepOrder]);

  const goTo = useCallback((target: StartStep) => {
    setStep(target);
  }, []);

  const updateAnswers = useCallback((patch: Partial<QuizAnswers>) => {
    setAnswers((current) => ({ ...current, ...patch }));
  }, []);

  const value = useMemo<FlowState>(
    () => ({
      step,
      stepIndex,
      totalSteps: stepOrder.length,
      answers,
      next,
      back,
      goTo,
      updateAnswers,
    }),
    [step, stepIndex, stepOrder, answers, next, back, goTo, updateAnswers]
  );

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function useFlow(): FlowState {
  const ctx = useContext(FlowContext);
  if (!ctx) throw new Error("useFlow must be used inside FlowProvider");
  return ctx;
}
