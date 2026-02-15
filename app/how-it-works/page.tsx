"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import styles from "./page.module.css";

const IOS_LINK = "https://apps.apple.com/app/id6450676544";
const ANDROID_LINK =
  "https://play.google.com/store/apps/details?id=com.keshahapp.hair";

const TECHNIQUES = [
  { name: "Scalp Pinching", image: "/images/techniques/technique_scalp_pinching.png" },
  { name: "Acupressure", image: "/images/techniques/technique_acupressure.png" },
  { name: "Scalp Pressing", image: "/images/techniques/technique_scalp_pressing.png" },
  { name: "Neck Presses", image: "/images/techniques/technique_neck_presses.png" },
  { name: "Scalp Stretches", image: "/images/techniques/technique_scalp_stretches.png" },
  { name: "Neck Stretches", image: "/images/techniques/technique_neck_stretches.png" },
];

const TESTIMONIALS = [
  "proof_tiktok_growing_back.jpeg",
  "proof_reddit_30_days.jpeg",
  "proof_tiktok_it_works.jpeg",
  "proof_reddit_worth_every_penny.jpeg",
  "proof_tiktok_stops_hair_loss.jpeg",
  "proof_imessage_grateful.jpeg",
  "proof_reddit_105_days.jpeg",
  "proof_tiktok_tension_reduced.jpeg",
  "proof_tiktok_3_months.jpeg",
  "proof_whatsapp_hairline.jpeg",
  "proof_reddit_5_month.jpeg",
  "proof_tiktok_almost_working.jpeg",
];

const FAQ_ITEMS = [
  {
    q: "Does this actually work?",
    a: "Yes. Scalp mechanotherapy is backed by research showing that scalp tension restricts blood flow to hair follicles. By releasing that tension through specific techniques, blood flow is restored and hair fall stops. Our members typically see results between day 30 and 60.",
  },
  {
    q: "Is this just scalp massage?",
    a: "No. It\u2019s mechanotherapy \u2014 6 specific techniques designed to release scalp tension and restore blood flow. This isn\u2019t gentle rubbing. It\u2019s targeted, forceful work that feels like a workout for your scalp.",
  },
  {
    q: "How long does it take?",
    a: "Most members feel their scalp loosening in the first 3 days. Hair fall typically stops between day 30 and 60. The daily sessions take about 20 minutes.",
  },
  {
    q: "Will I have to do this forever?",
    a: "The initial treatment is 60 days. After that, maintenance takes just 10 minutes, 3x per week to keep your results.",
  },
  {
    q: "What if it doesn\u2019t work for me?",
    a: "Try it free for 3 days. If you don\u2019t feel your scalp getting looser, cancel before the trial ends. No charge.",
  },
  {
    q: "Is $49/year really all it costs?",
    a: "Yes. That\u2019s less than $1/week. No hidden fees. The app includes all 6 techniques, video-guided sessions, and progress tracking. Physical products for regrowth are optional add-ons later.",
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.faqItem}>
      <button className={styles.faqQuestion} onClick={() => setOpen(!open)}>
        <span>{q}</span>
        <span className={`${styles.faqArrow} ${open ? styles.faqArrowOpen : ""}`}>
          &#9662;
        </span>
      </button>
      {open && <div className={styles.faqAnswer}>{a}</div>}
    </div>
  );
}

export default function HowItWorks() {
  const [showAllTestimonials, setShowAllTestimonials] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const visibleTestimonials = showAllTestimonials
    ? TESTIMONIALS
    : TESTIMONIALS.slice(0, 6);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.visible);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );

    mainRef.current
      ?.querySelectorAll(`.${styles.reveal}`)
      .forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={mainRef}>
      {/* ── Sticky Header ── */}
      <header className={styles.header}>
        <Image
          src="/images/logo.png"
          alt="KESHAH"
          width={80}
          height={28}
          className={styles.headerLogo}
        />
        <a href={IOS_LINK} className={styles.headerCta}>
          Try Free
        </a>
      </header>

      {/* ── 1. Hero ── */}
      <section className={styles.hero}>
        <video
          className={styles.heroVideo}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        >
          <source src="/videos/landing_video.mp4" type="video/mp4" />
        </video>
        <div className={styles.heroContent}>
          <h1 className={styles.heroHeadline}>
            Stop your hair loss in 60 days
          </h1>
          <p className={styles.heroSub}>
            Without drugs. Without surgery. Just 20 minutes a day.
          </p>
          <a href={IOS_LINK} className="cta-button">
            Try free for 3 days
          </a>
          <p className={styles.heroPricing}>
            Then $49/year. Cancel anytime.
          </p>
          <p className={styles.heroProof}>
            <span className={styles.heroStars}>&#9733;&#9733;&#9733;&#9733;&#9733;</span>{" "}
            4.8 on App Store &middot; 6,000+ members
          </p>
        </div>
      </section>

      <div className="container">
        {/* ── 2. Founder Card ── */}
        <section className={`section-gap ${styles.reveal}`}>
          <div className={styles.founderCard}>
            <Image
              src="/images/aadi.png"
              alt="Aadi"
              width={48}
              height={48}
              className={styles.founderPhoto}
            />
            <div>
              <p className={styles.founderQuote}>
                &ldquo;The exact routine I used to fix my hair loss.&rdquo;
              </p>
              <p className={styles.founderAttribution}>
                Aadi, Founder &amp; fellow hair loss sufferer
              </p>
            </div>
          </div>
        </section>

        {/* ── 3. Founder Story ── */}
        <section className={`section-gap ${styles.reveal}`}>
          <p className="section-label">My Story</p>

          <div className={styles.storyBeat}>
            <p className={styles.storyText}>
              4 years ago, I was losing my hair. I tried everything &mdash;
              rosemary oil, saw palmetto, every supplement and shampoo.
              Nothing worked.
            </p>
          </div>

          <div className={styles.storyBeat}>
            <p className={styles.storyText}>
              My dermatologist told me: &ldquo;Take finasteride or go
              bald.&rdquo; I didn&apos;t want to mess with my hormones for
              the rest of my life.
            </p>
          </div>

          <div className={styles.storyBeat}>
            <p className={styles.storyText}>
              I found real case studies on Reddit from people who stopped
              hair loss with scalp massage. Then I found the science behind
              it.
            </p>
            <div className={styles.storyImages}>
              {[1, 2, 3].map((i) => (
                <div key={i} className={styles.storyImage}>
                  <Image
                    src={`/images/story/reddit_${i}.png`}
                    alt={`Reddit case study ${i}`}
                    width={400}
                    height={200}
                    style={{ width: "100%", height: "auto" }}
                  />
                </div>
              ))}
            </div>
            <p className={styles.storyCaption}>
              These are the exact comments I read 4 years ago. They&apos;re
              still up.
            </p>
          </div>

          <div className={styles.storyBeat}>
            <p className={styles.storyText}>
              I built a routine &mdash; 6 techniques, every day. After 30 days my
              scalp got flexible. After 45 days, less hair in the shower. By
              day 60, my hair fall stopped.
            </p>
            <div className={styles.beforeAfterRow}>
              <div className={styles.beforeAfterItem}>
                <Image
                  src="/images/story/before_hairline.jpg"
                  alt="Before"
                  width={200}
                  height={250}
                  style={{ width: "100%", height: "auto" }}
                />
                <span className={styles.beforeAfterLabel}>Before</span>
              </div>
              <div className={styles.beforeAfterItem}>
                <Image
                  src="/images/story/after_hairline.jpg"
                  alt="After"
                  width={200}
                  height={250}
                  style={{ width: "100%", height: "auto" }}
                />
                <span className={styles.beforeAfterLabel}>After</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── 4. The Science ── */}
        <section className={`section-gap ${styles.reveal}`}>
          <p className="section-label">The Science</p>
          <div className={styles.scienceDiagram}>
            <Image
              src="/images/story/scalp_tension_study.jpg"
              alt="Scalp tension study showing hair loss zones"
              width={400}
              height={300}
              style={{ width: "100%", height: "auto" }}
            />
          </div>
          <p className={styles.scienceCaption}>
            Light blue = high tension. Dark blue = low tension.
          </p>
          <p className={styles.scienceText}>
            The parts of your scalp where you lose hair first are the
            tightest. Tight scalp restricts blood flow. Hair follicles
            starve. Hair falls out. Loosen the scalp, restore blood flow,
            and hair fall stops.
          </p>
        </section>

        {/* ── 5. Pinch Test ── */}
        <section className={`section-gap ${styles.reveal}`}>
          <p className={styles.pinchInstruction}>Try this right now.</p>
          <p className={styles.pinchBody}>
            Pinch the top of your scalp where you&apos;re losing hair. Now
            pinch the sides. Notice the difference?
          </p>
          <div className={styles.pinchImage}>
            <Image
              src="/images/pinch_test_illustration.png"
              alt="Scalp pinch test"
              width={400}
              height={300}
              style={{ width: "100%", height: "auto" }}
            />
          </div>
          <p className={styles.pinchPayoff}>
            Where it&apos;s tight, you&apos;re losing hair. Where it&apos;s
            loose, you&apos;re not. KESHAH loosens the tight areas.
          </p>
        </section>

        {/* ── 6. The 6 Techniques ── */}
        <section className={`section-gap ${styles.reveal}`}>
          <p className="section-label">Your Treatment</p>
          <div className={styles.techniquesGrid}>
            {TECHNIQUES.map((t) => (
              <div key={t.name} className={styles.techniqueCard}>
                <Image
                  src={t.image}
                  alt={t.name}
                  fill
                  className={styles.techniqueImage}
                />
                <span className={styles.techniqueLabel}>{t.name}</span>
              </div>
            ))}
          </div>
          <p className={styles.techniquesSub}>
            Video-guided sessions. Just follow along.
          </p>
        </section>

        {/* ── 7. Timeline ── */}
        <section className={`section-gap ${styles.reveal}`}>
          <p className="section-label">Your Journey</p>
          <div className={styles.timeline}>
            <div className={styles.timelineItem}>
              <div className={`${styles.timelineDot} ${styles.timelineDotFree}`} />
              <p className={styles.timelineDays}>Day 1&ndash;3</p>
              <p className={styles.timelineText}>
                Feel your scalp get looser
                <span className={styles.timelineBadge}>FREE</span>
              </p>
            </div>
            <div className={styles.timelineItem}>
              <div className={styles.timelineDot} />
              <p className={styles.timelineDays}>Day 4&ndash;30</p>
              <p className={styles.timelineText}>Blood flow improves</p>
            </div>
            <div className={styles.timelineItem}>
              <div className={styles.timelineDot} />
              <p className={styles.timelineDays}>Day 30&ndash;60</p>
              <p className={styles.timelineText}>Hair fall stops</p>
            </div>
            <div className={styles.timelineItem}>
              <div className={styles.timelineDot} />
              <p className={styles.timelineDays}>Day 60+</p>
              <p className={styles.timelineText}>
                Maintain results or regrow
              </p>
            </div>
          </div>
        </section>

        {/* ── 8. Mid-Page CTA ── */}
        <section className={`section-gap ${styles.reveal}`}>
          <div className={styles.ctaBreak}>
            <Image
              src="/images/story/after_selfie_2.jpg"
              alt="Aadi"
              fill
              className={styles.ctaBreakBg}
            />
            <div className={styles.ctaBreakContent}>
              <p className={styles.ctaBreakQuote}>
                &ldquo;I want you to try this for free. It took me about 3
                days to realize how my scalp was getting looser. I want you
                to feel that too.&rdquo;
              </p>
              <p className={styles.ctaBreakAttribution}>&mdash; Aadi</p>
              <a href={IOS_LINK} className="cta-button">
                Try free for 3 days
              </a>
            </div>
          </div>
        </section>

        {/* ── 9. Before/After Gallery ── */}
        <section className={`section-gap ${styles.reveal}`}>
          <p className="section-label">Real Results</p>
        </section>
      </div>

      <div className={`${styles.gallery} ${styles.reveal}`}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className={styles.galleryItem}>
            <Image
              src={`/images/comparisons/c${i + 1}.jpeg`}
              alt={`Before and after comparison ${i + 1}`}
              width={240}
              height={320}
              style={{ width: 240, height: "auto" }}
            />
          </div>
        ))}
      </div>

      <div className="container">
        {/* ── 10. Testimonials ── */}
        <section className={`section-gap ${styles.reveal}`}>
          <p className="section-label">What People Are Saying</p>
          <div className={styles.testimonialGrid}>
            {visibleTestimonials.map((filename) => (
              <div key={filename} className={styles.testimonialItem}>
                <Image
                  src={`/images/results/${filename}`}
                  alt="User testimonial"
                  width={400}
                  height={200}
                  style={{ width: "100%", height: "auto" }}
                />
              </div>
            ))}
          </div>
          {!showAllTestimonials && (
            <button
              className={styles.showMoreBtn}
              onClick={() => setShowAllTestimonials(true)}
            >
              See more
            </button>
          )}
        </section>

        {/* ── 11. 6,000+ Members ── */}
        <section className={`${styles.proofSection} ${styles.reveal}`}>
          <div className={styles.proofGrid}>
            {Array.from({ length: 32 }, (_, i) => (
              <div key={i} className={styles.proofPhoto}>
                <Image
                  src={`/images/members/photo${(i % 16) + 1}.jpg`}
                  alt=""
                  width={72}
                  height={72}
                  style={{ objectFit: "cover", width: 72, height: 72 }}
                />
              </div>
            ))}
          </div>
          <div className={`${styles.proofGrid} ${styles.proofGridReverse}`}>
            {Array.from({ length: 32 }, (_, i) => (
              <div key={i} className={styles.proofPhoto}>
                <Image
                  src={`/images/members/photo${((i + 8) % 16) + 1}.jpg`}
                  alt=""
                  width={72}
                  height={72}
                  style={{ objectFit: "cover", width: 72, height: 72 }}
                />
              </div>
            ))}
          </div>
          <p className={styles.proofNumber}>6,000+</p>
          <p className={styles.proofText}>people have started KESHAH</p>
        </section>

        {/* ── 12. FAQ ── */}
        <section className={`section-gap ${styles.reveal}`}>
          <p className="section-label">FAQ</p>
          <div className={styles.faqList}>
            {FAQ_ITEMS.map((item) => (
              <FAQItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </section>

        {/* ── 13. Final CTA ── */}
        <section className={`section-gap ${styles.finalCta} ${styles.reveal}`}>
          <h2 className={styles.finalHeadline}>Your routine is ready.</h2>
          <ul className={styles.finalBullets}>
            <li>6 daily techniques, video-guided</li>
            <li>Progress tracking with photos</li>
            <li>Direct support from Aadi</li>
            <li>Science-backed treatment plan</li>
          </ul>
          <a href={IOS_LINK} className="cta-button">
            Try free for 3 days
          </a>
          <p className={styles.finalPricing}>
            Then $49/year. We&apos;ll remind you before your trial ends.
          </p>
          <div className={styles.storeButtons}>
            <a href={IOS_LINK} className={styles.storeBadge}>
              <Image
                src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83"
                alt="Download on the App Store"
                width={125}
                height={42}
                unoptimized
              />
            </a>
            <a href={ANDROID_LINK} className={styles.storeBadge}>
              <Image
                src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
                alt="Get it on Google Play"
                width={141}
                height={42}
                unoptimized
              />
            </a>
          </div>
        </section>
      </div>

      {/* ── 14. Footer ── */}
      <footer className={styles.footer}>
        <Image
          src="/images/logo.png"
          alt="KESHAH"
          width={80}
          height={28}
          style={{ margin: "0 auto" }}
        />
        <div className={styles.footerLinks}>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="mailto:support@keshah.com">Contact</a>
        </div>
        <p className={styles.footerTagline}>
          Built by a fellow hair loss sufferer.
        </p>
        <p className={styles.footerTagline}>
          &copy; {new Date().getFullYear()} KESHAH
        </p>
      </footer>
    </div>
  );
}
