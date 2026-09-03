"use client";

import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from "react";
import styles from "../start.module.css";
import { mediumHaptic } from "../lib/haptics";

type Variant = "primary" | "outline";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

export default function Button({
  variant = "primary",
  children,
  className = "",
  onClick,
  ...rest
}: ButtonProps) {
  const variantClass = variant === "outline" ? styles.buttonOutline : "";

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    mediumHaptic();
    onClick?.(e);
  };

  return (
    <button
      {...rest}
      onClick={handleClick}
      className={`${styles.button} ${variantClass} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
