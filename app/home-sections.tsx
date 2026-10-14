// keshah.com below the first screen: why hair falls out, how KESHAH works,
// Aadi's story, member messages, download, and the KESHAH, Inc. footer.
// Copy follows the in-app proof page ("Will this actually work for me?").

import Image from "next/image";
import Link from "next/link";
import styles from "./home-sections.module.css";

const CHAIN = [
  {
    title: "Your scalp gets tight.",
    body: "The hairline and crown are generally the tightest parts of the scalp. That's also where most people lose hair first.",
  },
  {
    title: "The tightness squeezes your blood vessels.",
    body: "A tight scalp presses on the small blood vessels that feed every hair on your head.",
  },
  {
    title: "Blood can't reach your hair.",
    body: "Blood flow in balding areas has been measured at 2.6 times lower than in areas with full hair.",
  },
  {
    title: "Without blood, the hair dies.",
    body: "Hair can't grow without what blood brings it, so it gets thinner and falls out.",
  },
];

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

const QUOTES = [
  { who: "B.", day: 17, text: "I'm seeing good results with looser scalp and less hair fall. Thank you!" },
  { who: "A.", day: 35, text: "My hair fall got significantly reduced and getting thick when i touch my hair i can feel it" },
  { who: "A.", day: 38, text: "I am seeing the results including a lot of baby hairs including my front hairline" },
  { who: "A.", day: 45, text: "My hair shedding has reduced a decent bit.. I could tell bc there's a progression of less shedding" },
];

export default function HomeSections({ appStoreUrl, playStoreUrl }: { appStoreUrl: string; playStoreUrl: string }) {
  return (
    <div className={styles.wrap}>
      <section className={styles.section}>
        <p className={styles.eyebrow}>Why hair falls out</p>
        <h2 className={styles.h2}>It usually starts with a tight scalp.</h2>
        <ol className={styles.chain}>
          {CHAIN.map((c, k) => (
            <li key={c.title} className={styles.chainItem}>
              <span className={styles.chainNum}>{k + 1}</span>
              <div>
                <h3 className={styles.h3}>{c.title}</h3>
                <p className={styles.body}>{c.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className={styles.source}>Scalp tension research: Byun et al., 2015.</p>
      </section>

      <section className={styles.section}>
        <p className={styles.eyebrow}>How KESHAH works</p>
        <h2 className={styles.h2}>A few minutes of scalp massage a day, guided step by step.</h2>
        <p className={styles.lead}>
          KESHAH is an app that walks you through scalp and neck massage techniques that loosen a tight scalp, so blood
          can reach your hair again.
        </p>
        <div className={styles.steps}>
          {STEPS.map((s) => (
            <div key={s.title} className={styles.step}>
              <Image src={s.img} alt={s.alt} width={600} height={600} className={styles.stepImg} />
              <h3 className={styles.h3}>{s.title}</h3>
              <p className={styles.body}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.story}`}>
        <Image src="/images/aadi.png" alt="Aadi, founder of KESHAH" width={1263} height={1772} className={styles.storyImg} />
        <div className={styles.storyCopy}>
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
          <p className={styles.sign}>Aadi, founder</p>
        </div>
      </section>

      <section className={styles.section}>
        <p className={styles.eyebrow}>From KESHAH members</p>
        <h2 className={styles.h2}>What people tell us.</h2>
        <div className={styles.quotes}>
          {QUOTES.map((q) => (
            <figure key={q.day} className={styles.quote}>
              <blockquote className={styles.quoteText}>&ldquo;{q.text}&rdquo;</blockquote>
              <figcaption className={styles.quoteWho}>
                {q.who} · Day {q.day}
              </figcaption>
            </figure>
          ))}
        </div>
        <p className={styles.source}>Results vary. Everyone&apos;s scalp is different.</p>
      </section>

      <section className={`${styles.section} ${styles.cta}`}>
        <h2 className={styles.h2}>Start your first session today.</h2>
        <div className={styles.ctaButtons}>
          <a href={appStoreUrl} target="_blank" rel="noopener noreferrer" className={styles.btnPrimary}>
            App Store
          </a>
          <a href={playStoreUrl} target="_blank" rel="noopener noreferrer" className={styles.btnSecondary}>
            Google Play
          </a>
        </div>
      </section>

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
