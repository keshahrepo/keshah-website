import type { ReactNode } from "react";
import "./native-feel.css";

/** Wrap a route's layout in this to get the app-like behaviour in native-feel.css. */
export default function NativeRoot({ children }: { children: ReactNode }) {
  return <div className="native-root">{children}</div>;
}
