"use client";

/**
 * QuizMultiPick — port of `QuizMultiPick` in
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/_quiz_widgets.dart:254
 *
 * Same shape as QuizSinglePick but backed by a Set — Continue button
 * enables as soon as at least one option is selected, and onComplete
 * receives the ordered array.
 */

import { useState } from "react";
import { AnimatedPage, AnimatedPageItem } from "./AnimatedPage";
import { BackArrowWithAppLogo } from "./BackArrowWithAppLogo";
import { KeshahButton } from "./KeshahButton";
import { OptionTile } from "./OptionTile";
import { PageHeader } from "./PageHeader";

export interface QuizMultiPickProps {
  title: string;
  subtitle?: string;
  options: string[];
  onComplete: (values: string[]) => void;
  onBack?: () => void;
  continueLabel?: string;
  hideHeader?: boolean;
}

export function QuizMultiPick({
  title,
  subtitle,
  options,
  onComplete,
  onBack,
  continueLabel = "Continue",
  hideHeader = false,
}: QuizMultiPickProps) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (label: string) => {
    setSelected((prev) =>
      prev.includes(label) ? prev.filter((v) => v !== label) : [...prev, label]
    );
  };

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
            padding: "24px 32px",
            minHeight: 0,
            overflowY: "auto",
          }}
        >
          <PageHeader title={title} subtitle={subtitle} />
          <AnimatedPageItem style={{ marginTop: 24 }}>
            {options.map((label) => (
              <OptionTile
                key={label}
                label={label}
                isSelected={selected.includes(label)}
                onTap={() => toggle(label)}
              />
            ))}
          </AnimatedPageItem>
        </div>
        <AnimatedPageItem style={{ padding: "0 25px 20px" }}>
          <KeshahButton
            expanded
            title={continueLabel}
            disabled={selected.length === 0}
            onTap={() => onComplete(selected)}
          />
        </AnimatedPageItem>
      </AnimatedPage>
    </div>
  );
}
