"use client";

// Personalized response based on where the user is losing hair.
// Each variant follows the pattern: personal acknowledgment + sensory detail
// + specific technique + timeline. Builds credibility through specificity
// rather than generic validation.
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import { mediumHaptic } from "../lib/haptics";
import styles from "./response.module.css";

export default function HairLossLocationResponse() {
  const { answers, next } = useFlow();
  const config = useFunnelConfig();
  const location = answers.hairLossLocation;
  // Female-coded voice on women's funnels (and whenever the quiz selects
  // female). The original male-coded narrative still ships for everyone
  // else — Aadi's voice remains the founder voice on /startus3.
  const isWomenVoice = config.audience === "women" || answers.gender === "female";

  const text = (() => {
    if (isWomenVoice) {
      switch (location) {
        case "part":
        case "crown":
          return (
            <>
              Thinning in that area is one of the most common patterns in women. Scalp massages like scalp pressing target it directly. Most women see hair thinning start to reduce around day 45.
            </>
          );
        case "hairline":
          return (
            <>
              Receding temples are one of the most visible early signs. Scalp massages like scalp pinching target the hairline. Most women see hair thinning start to reduce around day 45.
            </>
          );
        case "all_over":
          return (
            <>
              Diffuse thinning across the whole scalp is the most common pattern in women. Scalp massages like scalp sliding work the entire top of the head. Most women see hair thinning start to reduce around day 45.
            </>
          );
        default:
          return <>This has worked for thousands of women like you.</>;
      }
    }
    switch (location) {
      case "part":
      case "crown":
        return (
          <>
            I was also thinning in the crown. Scalp exercises like scalp pressing work on that area. Took about 45 days before hair fall started to reduce.
          </>
        );
      case "hairline":
        return (
          <>
            My hairline was going back too. Scalp exercises like scalp pinching work on the hairline. Took about 45 days before hair fall started to reduce.
          </>
        );
      case "all_over":
        return (
          <>
            I was thinning all over too. Scalp exercises like scalp sliding work the whole top of your head. Took about 45 days before hair fall started to reduce.
          </>
        );
      default:
        return <>This has worked for thousands of members like you.</>;
    }
  })();

  const handleContinue = () => {
    mediumHaptic();
    next();
  };

  return (
    <div className={styles.root}>
      <div className={styles.body}>
        <p className={styles.text}>{text}</p>
      </div>
      <div className={styles.footer}>
        <button type="button" className={styles.button} onClick={handleContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}
