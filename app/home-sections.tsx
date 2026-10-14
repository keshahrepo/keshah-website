// keshah.com below the first screen: why hair falls out, how KESHAH works,
// Aadi's story, member messages, download, and the KESHAH, Inc. footer.
// Copy follows the in-app proof page ("Will this actually work for me?").

import Image from "next/image";
import Link from "next/link";
import styles from "./home-sections.module.css";
import { BeforeAfter, Chain, Reveal } from "./home-motion";

const STEPS = [
  {
    img: "/images/techniques/technique_scalp_pinching.png",
    alt: "Scalp pinching technique",
    title: "Follow along with the videos",
    body: "Every day you get a short guided session of scalp and neck massage. You just copy what you see.",
  },
  {
    img: "/images/techniques/technique_scalp_pressing.png",
    alt: "Scalp pressing technique",
    title: "Feel your scalp loosen",
    body: "Most people feel their scalp getting looser within the first few weeks.",
  },
  {
    img: "/images/techniques/technique_neck_presses.png",
    alt: "Neck presses technique",
    title: "Stick with it for 60 days",
    body: "The program runs for 60 days, with a new session waiting for you every day.",
  },
];

// Messages members sent us, with our replies (same threads as the in-app proof page).
const QUOTES = [
  {
    who: "B.",
    day: 17,
    text: "I'm seeing good results with looser scalp and less hair fall. Thank you!",
    reply: "Great to hear the scalp is loosening up and shedding is dropping at 17 days, that's exactly what should be happening!",
  },
  {
    who: "T.",
    day: 27,
    text: "Felt my scalp so relaxed and flexible today suddenly. It's such a great feeling. Deep down in my heart I know my hair will come back now.",
    reply: "It makes me very happy to hear this :)",
  },
  {
    who: "A.",
    day: 35,
    text: "My hair fall got significantly reduced and getting thick when i touch my hair i can feel it",
    reply: "This is exactly what progress looks like at 35 days! Reduced shedding and hair feeling thicker are real signs.",
  },
  {
    who: "A.",
    day: 38,
    text: "I am seeing the results including a lot of baby hairs including my front hairline",
    reply: "Baby hairs on the front hairline at 38 days is genuinely exciting, keep at it!",
  },
  {
    who: "A.",
    day: 45,
    text: "My hair shedding has reduced a decent bit.. I could tell bc there's a progression of less shedding",
    reply: "Reduced shedding at 45 days is a really good sign. Keep at it.",
  },
  {
    who: "R.",
    day: 61,
    text: "I already see baby hairs everyday on my scalp and they are getting longer",
    reply: "61 days in with baby hairs already showing and getting longer is a great sign! Keep at it!",
  },
];

export default function HomeSections({ appStoreUrl, playStoreUrl }: { appStoreUrl: string; playStoreUrl: string }) {
  return (
    <div className={styles.wrap}>
      <section className={styles.section}>
        <Reveal>
          <p className={styles.eyebrow}>Why hair falls out</p>
          <h2 className={styles.h2}>It usually starts with a tight scalp.</h2>
        </Reveal>
        <Chain />
        <p className={styles.source}>Scalp tension research: Byun et al., 2015.</p>
      </section>

      <section className={styles.section}>
        <Reveal>
          <p className={styles.eyebrow}>How KESHAH works</p>
          <h2 className={styles.h2}>A few minutes of scalp massage a day, guided step by step.</h2>
          <p className={styles.lead}>
            KESHAH is an app that walks you through scalp and neck massage techniques that loosen a tight scalp, so
            blood can reach your hair again.
          </p>
        </Reveal>
        <div className={styles.steps}>
          {STEPS.map((s, k) => (
            <Reveal key={s.title} delay={k * 120} className={styles.step}>
              <div className={styles.stepImgWrap}>
                <Image src={s.img} alt={s.alt} width={600} height={600} className={styles.stepImg} />
              </div>
              <h3 className={styles.h3}>{s.title}</h3>
              <p className={styles.body}>{s.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.story}`}>
        <div className={styles.storyMedia}>
          <BeforeAfter before="/images/story/before_hairline.jpg" after="/images/story/after_hairline.jpg" />
          <p className={styles.source}>My hairline, before and after. Drag to compare.</p>
        </div>
        <Reveal className={styles.storyCopy}>
          <p className={styles.eyebrow}>Where it started</p>
          <h2 className={styles.h2}>I built KESHAH because it&apos;s what stopped my own hair loss.</h2>
          <p className={styles.body}>
            My crown was thinning and my hairline was going back. I tried rosemary oil, onion juice, and every shampoo and
            supplement I could find. Nothing worked. I had a bottle of finasteride on my bedside table when I found a study
            showing that the places you lose hair first are the tightest parts of your scalp.
          </p>
          <p className={styles.body}>
            So I made a plan with 6 scalp and neck techniques and did it every day. By day 30 I could pinch and lift almost
            any part of my scalp. By day 60 my hair fall had pretty much stopped. KESHAH is that exact plan, put into an app.
          </p>
          <div className={styles.signRow}>
            <Image src="/images/aadi.png" alt="Aadi" width={96} height={96} className={styles.signImg} />
            <p className={styles.sign}>Aadi, founder</p>
          </div>
        </Reveal>
      </section>

      <section className={styles.section}>
        <Reveal>
          <p className={styles.eyebrow}>Messages to Aadi</p>
          <h2 className={styles.h2}>What members tell us.</h2>
        </Reveal>
        <Reveal delay={120}>
          <div className={styles.quotes}>
            {QUOTES.map((q) => (
              <figure key={q.day} className={styles.quote}>
                <blockquote className={styles.quoteText}>&ldquo;{q.text}&rdquo;</blockquote>
                <figcaption className={styles.quoteWho}>
                  {q.who} · Day {q.day}
                </figcaption>
                <div className={styles.reply}>
                  <p className={styles.replyLabel}>KESHAH team</p>
                  <p className={styles.replyText}>{q.reply}</p>
                </div>
              </figure>
            ))}
          </div>
        </Reveal>
        <p className={styles.source}>From messages members sent us, with our replies. Results vary. Everyone&apos;s scalp is different.</p>
      </section>

      <Reveal className={`${styles.section} ${styles.cta}`}>
        <h2 className={styles.h2}>Start your first session today.</h2>
        <div className={styles.ctaButtons}>
          <a href={appStoreUrl} target="_blank" rel="noopener noreferrer" className={styles.btnPrimary}>
            App Store
          </a>
          <a href={playStoreUrl} target="_blank" rel="noopener noreferrer" className={styles.btnSecondary}>
            Google Play
          </a>
        </div>
      </Reveal>

      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <div>
            <p className={styles.company}>KESHAH, Inc.</p>
            <p className={styles.footerText}>New York, NY</p>
            <p className={styles.footerText}>
              <a href="mailto:contact@keshah.com" className={styles.footerLink}>
                contact@keshah.com
              </a>
            </p>
          </div>
          <nav className={styles.footerNav} aria-label="Company">
            <Link href="/privacy" className={styles.footerLink}>
              Privacy
            </Link>
            <Link href="/terms" className={styles.footerLink}>
              Terms
            </Link>
            <Link href="/refund-policy" className={styles.footerLink}>
              Refund policy
            </Link>
            <Link href="/support" className={styles.footerLink}>
              Support
            </Link>
          </nav>
        </div>
        <p className={styles.copyright}>© {new Date().getFullYear()} KESHAH, Inc. All rights reserved.</p>
      </footer>
    </div>
  );
}
