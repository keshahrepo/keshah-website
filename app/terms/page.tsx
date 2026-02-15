import styles from "../legal.module.css";

export const metadata = {
  title: "Terms of Service — KESHAH",
};

export default function Terms() {
  return (
    <main className={styles.page}>
      <article className={styles.container}>
        <h1 className={styles.title}>Terms of Service</h1>
        <p className={styles.updated}>Last updated: February 15, 2026</p>

        <section className={styles.section}>
          <p>
            These Terms of Service govern your use of the KESHAH mobile
            application operated by KESHAH (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;). By using the
            app, you agree to these terms.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Use of the App</h2>
          <p>
            KESHAH provides video-guided scalp mechanotherapy exercises designed
            to support hair health. The app is for personal, non-commercial use
            only. You must be at least 13 years old to use KESHAH.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Medical Disclaimer</h2>
          <p>
            KESHAH is not a medical device and does not provide medical advice.
            The exercises and content in the app are for informational and
            wellness purposes only. They are not intended to diagnose, treat,
            cure, or prevent any disease or medical condition. Consult a
            healthcare professional before starting any new health routine,
            especially if you have a medical condition affecting your scalp or
            hair.
          </p>
          <p>
            Individual results may vary. We do not guarantee specific outcomes
            from using the app.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Subscriptions &amp; Payments</h2>
          <p>
            KESHAH offers a free trial period followed by a paid subscription.
            Subscriptions are billed annually through the Apple App Store or
            Google Play Store.
          </p>
          <ul>
            <li>
              Payment is charged to your App Store or Play Store account at
              confirmation of purchase
            </li>
            <li>
              Subscriptions automatically renew unless cancelled at least 24
              hours before the end of the current period
            </li>
            <li>
              You can manage and cancel your subscription in your device&apos;s
              account settings
            </li>
            <li>
              Refunds are handled by Apple or Google per their respective
              refund policies
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Your Account</h2>
          <p>
            You are responsible for maintaining the security of your account. Do
            not share your login credentials. You are responsible for all
            activity under your account.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Intellectual Property</h2>
          <p>
            All content in the KESHAH app — including videos, images, text, and
            design — is owned by KESHAH and protected by copyright. You may not
            copy, reproduce, distribute, or create derivative works from our
            content without written permission.
          </p>
        </section>

        <section className={styles.section}>
          <h2>User Content</h2>
          <p>
            If you submit any content through the app (such as messages or
            feedback), you grant us a non-exclusive right to use that content to
            improve our services. You retain ownership of your content.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Termination</h2>
          <p>
            We may suspend or terminate your access to the app if you violate
            these terms. You can delete your account at any time through the
            app.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, KESHAH is not liable for any
            indirect, incidental, or consequential damages arising from your use
            of the app. Our total liability is limited to the amount you paid
            for the app in the 12 months preceding the claim.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Changes to These Terms</h2>
          <p>
            We may update these terms from time to time. Continued use of the
            app after changes constitutes acceptance of the updated terms.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Contact Us</h2>
          <p>
            If you have questions about these Terms, contact us at{" "}
            <a href="mailto:contact@keshah.com" className={styles.link}>
              contact@keshah.com
            </a>
          </p>
        </section>
      </article>
    </main>
  );
}
