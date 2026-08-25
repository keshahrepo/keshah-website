"use client";

/**
 * QuizSinglePick — port of `QuizSinglePick` in
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/_quiz_widgets.dart:125
 *
 * Layout matches mobile:
 *   BackArrowWithAppLogo (logoScale 0.85, no back button)
 *   ── flex spacer
 *   PageHeader (title + optional subtitle)
 *   32px gap
 *   Vertical stack of OptionTile — single-select
 *   ── flex spacer
 *   Continue button (white pill) — enabled once a selection is made
 *
 * Staggered entrance (title → list → button) via AnimatedPage variants.
 */

import { useState } from "react";
import { AnimatedPage, AnimatedPageItem } from "./AnimatedPage";
import { BackArrowWithAppLogo } from "./BackArrowWithAppLogo";
import { KeshahButton } from "./KeshahButton";
import { OptionTile } from "./OptionTile";
import { PageHeader } from "./PageHeader";

export interface QuizSinglePickProps {
  title: string;
  subtitle?: string;
  options: string[];
  onComplete: (value: string) => void;
  /** Mobile keeps this for backwards compatibility — hidden by default. */
  onBack?: () => void;
  /** Continue button label. Defaults to "Continue". */
  continueLabel?: string;
  /** Hide the top BackArrowWithAppLogo (useful when the parent already
   *  supplies a header). Defaults to false. */
  hideHeader?: boolean;
}

export function QuizSinglePick({
  title,
  subtitle,
  options,
  onComplete,
  onBack,
  continueLabel = "Continue",
  hideHeader = false,
}: QuizSinglePickProps) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, width: "100%" }}>
      {!hideHeader && (
        <BackArrowWithAppLogo
          logoScale={0.85}
          isShowBack={Boolean(onBack)}
          onBack={onBack}
        />
      )}
      <AnimatedPage style={{ flex: 1, minHeight: 0 }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            padding: "0 32px",
            minHeight: 0,
            overflowY: "auto",
          }}
        >
          <div style={{ flex: 1 }} />
          <PageHeader title={title} subtitle={subtitle} />
          <AnimatedPageItem style={{ marginTop: 32 }}>
            {options.map((label) => (
              <OptionTile
                key={label}
                label={label}
                isSelected={selected === label}
                onTap={() => setSelected(label)}
              />
            ))}
          </AnimatedPageItem>
          <div style={{ flex: 2 }} />
        </div>
        <AnimatedPageItem style={{ padding: "0 25px 20px" }}>
          <KeshahButton
            expanded
            title={continueLabel}
            disabled={!selected}
            onTap={() => selected && onComplete(selected)}
          />
        </AnimatedPageItem>
      </AnimatedPage>
    </div>
  );
}
