"use client";

/**
 * DisqualificationScreen — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/disqualification_screen.dart
 *
 * Full-screen kBlack, centered message + subtext, sticky white "Go back"
 * pill at the bottom. Enters with a synced fade + 8%-upward slide over
 * 800ms (matches the mobile SingleTickerProviderStateMixin controller).
 */

import { motion } from "framer-motion";
import { mediumHaptic } from "../../lib/haptics";
import { colors } from "../../lib/tokens";
import { KeshahButton } from "./KeshahButton";

export interface DisqualificationScreenProps {
  message: string;
  subtext?: string;
  onGoBack: () => void;
  /** Button label override. Defaults to "Go back". */
  goBackLabel?: string;
}

export function DisqualificationScreen({
  message,
  subtext,
  onGoBack,
  goBackLabel = "Go back",
}: DisqualificationScreenProps) {
  const handle = () => {
    mediumHaptic();
    onGoBack();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.33, 1, 0.68, 1], delay: 0.1 }}
      style={{
        position: "absolute",
        inset: 0,
        background: colors.black,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          flex: 1,
          padding: "0 36px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
        }}
      >
        <h1
          style={{
            fontFamily: "Poppins, -apple-system, sans-serif",
            fontSize: 24,
            fontWeight: 600,
            color: colors.white,
            letterSpacing: "-0.8px",
            lineHeight: 1.35,
            margin: 0,
          }}
        >
          {message}
        </h1>
        {subtext && (
          <p
            style={{
              fontFamily: "Poppins, -apple-system, sans-serif",
              fontSize: 15,
              fontWeight: 400,
              color: "rgba(255, 255, 255, 0.5)",
              lineHeight: 1.5,
              marginTop: 16,
            }}
          >
            {subtext}
          </p>
        )}
      </div>
      <div style={{ padding: "0 25px 35px" }}>
        <KeshahButton
          expanded
          title={goBackLabel}
          onTap={handle}
          backgroundColor={colors.white}
          color={colors.black}
        />
      </div>
    </motion.div>
  );
}
