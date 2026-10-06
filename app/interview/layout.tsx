import type { ReactNode } from "react";
import type { Viewport } from "next";
import NativeRoot from "../_native/NativeRoot";

// Pinch zoom stays allowed; viewport-fit=cover lets the pages use the safe-area insets.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function Layout({ children }: { children: ReactNode }) {
  return <NativeRoot>{children}</NativeRoot>;
}
