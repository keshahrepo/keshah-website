"use client";

/**
 * KeshahTextField — text input styled to match the mobile onboarding
 * form fields (FirstName / PhoneNumber pages). Mobile uses a
 * transparent field with a hairline underline in the standard flow,
 * so we mirror that: no boxed background, focused underline in white.
 *
 * Also supports a variant="filled" for the search/settings surfaces
 * (subtle white/6% pill) — kept optional so step agents can opt in.
 */

import { forwardRef, type InputHTMLAttributes } from "react";
import { colors } from "../../lib/tokens";

export interface KeshahTextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  errorText?: string;
  hintText?: string;
  variant?: "underline" | "filled";
}

export const KeshahTextField = forwardRef<HTMLInputElement, KeshahTextFieldProps>(
  function KeshahTextField(
    { label, errorText, hintText, variant = "underline", style, className, ...rest },
    ref
  ) {
    const hasError = Boolean(errorText);
    const isFilled = variant === "filled";

    return (
      <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
        {label && (
          <label
            style={{
              fontFamily: "Poppins, -apple-system, sans-serif",
              fontSize: 12,
              fontWeight: 500,
              color: "rgba(255,255,255,0.6)",
              letterSpacing: "1.2px",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          {...rest}
          className={className}
          style={{
            width: "100%",
            fontFamily: "Poppins, -apple-system, sans-serif",
            fontSize: 18,
            fontWeight: 500,
            color: colors.white,
            letterSpacing: "-0.4px",
            padding: isFilled ? "14px 18px" : "12px 0",
            background: isFilled ? "rgba(255,255,255,0.06)" : "transparent",
            border: "none",
            borderRadius: isFilled ? 10 : 0,
            borderBottom: isFilled
              ? "none"
              : `1px solid ${hasError ? colors.error : "rgba(255,255,255,0.25)"}`,
            outline: "none",
            transition: "border-color 180ms ease",
            caretColor: colors.white,
            ...style,
          }}
          onFocus={(e) => {
            if (!isFilled && !hasError) {
              e.currentTarget.style.borderBottom = `1px solid ${colors.white}`;
            }
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            if (!isFilled && !hasError) {
              e.currentTarget.style.borderBottom = "1px solid rgba(255,255,255,0.25)";
            }
            rest.onBlur?.(e);
          }}
        />
        {(errorText || hintText) && (
          <p
            style={{
              fontFamily: "Poppins, -apple-system, sans-serif",
              fontSize: 12,
              fontWeight: 400,
              color: hasError ? colors.error : "rgba(255,255,255,0.5)",
              marginTop: 8,
              lineHeight: 1.4,
            }}
          >
            {errorText || hintText}
          </p>
        )}
      </div>
    );
  }
);
