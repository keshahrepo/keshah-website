import styles from "../legal.module.css";

export const metadata = {
  title: "Privacy Policy — KESHAH",
};

export default function Privacy() {
  return (
    <main className={styles.page}>
      <article className={styles.container}>
        <h1 className={styles.title}>Privacy Policy</h1>
        <p className={styles.updated}>Last updated: February 15, 2026</p>

        <section className={styles.section}>
          <p>
            KESHAH (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) operates the KESHAH mobile application. This
            Privacy Policy explains how we collect, use, and protect your
            information when you use our app.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Information We Collect</h2>
          <p>
            <strong>Account information:</strong> When you create an account, we
            collect your email address and name.
          </p>
          <p>
            <strong>Usage data:</strong> We collect information about how you use
            the app, including session completions, streaks, and progress data.
            This helps us improve your experience and track your hair care
            routine.
          </p>
          <p>
            <strong>Device information:</strong> We may collect device type,
            operating system version, and app version for troubleshooting and
            analytics.
          </p>
          <p>
            <strong>Payment information:</strong> Payments are processed through
            Apple App Store and Google Play Store. We do not directly collect or
            store your payment card details.
          </p>
        </section>

        <section className={styles.section}>
          <h2>How We Use Your Information</h2>
          <ul>
            <li>To provide and maintain the KESHAH app</li>
            <li>To track your progress and personalize your experience</li>
            <li>To send important updates about your account or the app</li>
            <li>To improve our app and develop new features</li>
            <li>To respond to your support requests</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Data Storage &amp; Security</h2>
          <p>
            Your data is stored securely using industry-standard encryption. We
            use Firebase and other trusted third-party services to store and
            process your data. We take reasonable measures to protect your
            information from unauthorized access.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Third-Party Services</h2>
          <p>We may use the following third-party services:</p>
          <ul>
            <li>Firebase (authentication, database, analytics)</li>
            <li>RevenueCat (subscription management)</li>
            <li>Vercel (website hosting and analytics)</li>
          </ul>
          <p>
            These services have their own privacy policies governing their use
            of your information.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Data Retention</h2>
          <p>
            We retain your data for as long as your account is active. If you
            delete your account, we will delete your personal data within 30
            days. Some anonymized data may be retained for analytics purposes.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Your Rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li>Access the personal data we hold about you</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your account and data</li>
            <li>Opt out of marketing communications</li>
          </ul>
          <p>
            You can delete your account directly in the app under Profile &gt;
            Delete account.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Children&apos;s Privacy</h2>
          <p>
            KESHAH is not intended for children under 13. We do not knowingly
            collect information from children under 13. If you believe we have
            collected such information, please contact us immediately.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify
            you of any significant changes through the app or by email.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy, contact us at{" "}
            <a href="mailto:contact@keshah.com" className={styles.link}>
              contact@keshah.com
            </a>
          </p>
        </section>
      </article>
    </main>
  );
}
