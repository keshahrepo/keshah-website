import type { ReactNode } from "react";

// Section-wide styles for Creator Pay. Lives only while these pages are
// mounted, so nothing here leaks into other dashboard pages.
//  - .dash-main is a flex child; without min-width: 0 a wide table stretches
//    the whole page past the phone screen instead of scrolling in its box.
//  - On phones, inputs go to 16px (smaller makes iOS Safari zoom on focus)
//    and buttons get a finger-sized height.
const CSS = `
.dash-main { min-width: 0; }
.cp-admin .cp-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.cp-admin .cp-sticky-col { position: sticky; left: 0; z-index: 1; background: #080808; }
@media (max-width: 768px) {
  .cp-admin input:not([type=checkbox]):not([type=radio]):not([type=file]),
  .cp-admin select,
  .cp-admin textarea { font-size: 16px !important; min-height: 44px; }
  .cp-admin button { min-height: 40px; }
  .cp-admin input[type=checkbox] { width: 20px; height: 20px; }
  .cp-admin .cp-stack { grid-template-columns: 1fr !important; }
}
`;

export default function CreatorsPayLayout({ children }: { children: ReactNode }) {
  return (
    <div className="cp-admin">
      <style>{CSS}</style>
      {children}
    </div>
  );
}
