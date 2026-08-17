import styles from "../legal.module.css";

export const metadata = {
  title: "Privacy Policy — KESHAH",
};

export default function Privacy() {
  return (
    <main className={styles.page}>
      <article className={styles.container}>
        <h1 className={styles.title}>Privacy Policy</h1>
        <p className={styles.updated}>Last updated: August 16, 2026</p>

        <section className={styles.section}>
          <p>
            <strong>KESHAH Inc.</strong> (&quot;KESHAH&quot;, &quot;we&quot;,
            &quot;us&quot;, or &quot;our&quot;) respects your privacy. This
            Privacy Policy explains what information we collect, how we use it,
            and the choices you have. It applies to the KESHAH mobile
            application, keshah.com, and related services (the
            &quot;Service&quot;).
          </p>
          <p>
            By using the Service, you agree to the collection and use of
            information as described in this Policy. If you don&apos;t agree,
            please don&apos;t use the Service.
          </p>
        </section>

        <section className={styles.section}>
          <h2>1. Information We Collect</h2>
          <p>
            <strong>Information you provide directly:</strong>
          </p>
          <ul>
            <li>Account info: name, email, phone number, password</li>
            <li>
              Authentication provider (Apple ID, Google account) if you sign in
              through them
            </li>
            <li>
              Quiz answers (hair loss location, goals, medication use, stress
              level, family history, hormonal changes, etc.)
            </li>
            <li>
              Progress data: daily exercise completions, streaks, feel-check
              answers, scalp check-in answers
            </li>
            <li>Photos (optional): starter photos, progress photos you upload</li>
            <li>Chat messages you send through in-app support</li>
            <li>
              Purchase / shipping information for physical products (if
              applicable)
            </li>
            <li>Any information you send us at contact@keshah.com</li>
          </ul>
          <p>
            <strong>Information collected automatically:</strong>
          </p>
          <ul>
            <li>
              Device info: model, operating system, app version, language,
              timezone
            </li>
            <li>
              Usage data: features used, time spent, buttons tapped, screens
              viewed
            </li>
            <li>Approximate location (from IP address; not precise GPS)</li>
            <li>Crash logs and diagnostic data</li>
            <li>
              Marketing attribution (which ad or channel brought you to the app)
            </li>
          </ul>
          <p>
            <strong>Information from third parties:</strong>
          </p>
          <ul>
            <li>Subscription status from RevenueCat</li>
            <li>
              Payment status from Apple / Google / Stripe (we do NOT receive or
              store your credit card number)
            </li>
            <li>Attribution data from Appstack</li>
            <li>Anonymous analytics from Amplitude</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>2. How We Use Your Information</h2>
          <p>We use your information to:</p>
          <ul>
            <li>Create and manage your account</li>
            <li>
              Provide the Service, including personalizing your daily routine
              based on quiz answers, gender, and progress
            </li>
            <li>
              Send transactional communications (e.g., password resets,
              subscription receipts, trial reminders)
            </li>
            <li>
              Send optional educational, promotional, or nurture communications
              (you can opt out)
            </li>
            <li>Process purchases and manage subscriptions</li>
            <li>Improve, debug, and secure the Service</li>
            <li>Analyze usage patterns to build better features</li>
            <li>Prevent fraud and enforce our Terms</li>
            <li>Comply with legal obligations</li>
          </ul>
          <p>We do not sell your personal information.</p>
        </section>

        <section className={styles.section}>
          <h2>3. How We Share Your Information</h2>
          <p>
            <strong>Service providers who help us operate the Service:</strong>
          </p>
          <ul>
            <li>
              <strong>Firebase / Google Cloud</strong> — authentication,
              database, notifications, crash reporting, storage
            </li>
            <li>
              <strong>RevenueCat</strong> — subscription management
            </li>
            <li>
              <strong>Apple / Google</strong> — payment processing for in-app
              subscriptions
            </li>
            <li>
              <strong>Stripe</strong> — payment processing for physical products
            </li>
            <li>
              <strong>Amplitude</strong> — product analytics
            </li>
            <li>
              <strong>Appstack</strong> — attribution
            </li>
            <li>
              <strong>AWS End User Messaging, Twilio</strong> — SMS delivery
            </li>
            <li>
              <strong>Nodemailer / SES</strong> — transactional email delivery
            </li>
            <li>
              <strong>Calendly</strong> — appointment scheduling
            </li>
          </ul>
          <p>
            Each of these providers has its own privacy practices. We share
            only what&apos;s necessary for them to perform their function.
          </p>
          <p>
            <strong>Business transfers.</strong> If KESHAH is acquired, merges,
            or transfers substantially all of its assets, your information may
            be transferred to the acquiring entity.
          </p>
          <p>
            <strong>Legal compliance.</strong> We may disclose information if
            required by law, subpoena, or governmental request, or to protect
            our rights, users, or the public.
          </p>
          <p>
            <strong>With your consent.</strong> In any other case, we ask you
            first.
          </p>
        </section>

        <section className={styles.section}>
          <h2>4. Data Retention</h2>
          <p>
            We retain your information for as long as your account is active
            and for a reasonable period afterward to comply with legal
            obligations, resolve disputes, and enforce agreements.
          </p>
          <p>
            If you delete your account, we will delete or anonymize your
            personal information within a reasonable period, except where
            we&apos;re required to retain it (e.g., for tax, accounting, or
            fraud-prevention purposes).
          </p>
        </section>

        <section className={styles.section}>
          <h2>5. Your Rights</h2>
          <p>
            Depending on where you live, you may have the following rights
            regarding your personal information:
          </p>
          <ul>
            <li>
              <strong>Access</strong> — request a copy of the information we
              hold about you
            </li>
            <li>
              <strong>Correction</strong> — ask us to correct inaccurate
              information
            </li>
            <li>
              <strong>Deletion</strong> — ask us to delete your account and
              associated data
            </li>
            <li>
              <strong>Objection / Restriction</strong> — object to or restrict
              certain uses of your information
            </li>
            <li>
              <strong>Data Portability</strong> — receive your information in a
              portable format
            </li>
            <li>
              <strong>Withdrawal of consent</strong> — withdraw consent for
              processing (where applicable)
            </li>
            <li>
              <strong>Opt out of marketing</strong> — unsubscribe from
              promotional emails or SMS at any time
            </li>
          </ul>
          <p>
            To exercise these rights, contact us at contact@keshah.com. We will
            respond within a reasonable timeframe as required by law.
          </p>
        </section>

        <section className={styles.section}>
          <h2>6. Children&apos;s Privacy</h2>
          <p>
            The Service is intended for users aged <strong>13 and older</strong>.
            We do not knowingly collect personal information from children under
            13. If you believe a child under 13 has provided information to us,
            please contact contact@keshah.com and we will delete it.
          </p>
          <p>
            If you are between 13 and 18, please review this Policy and our{" "}
            <a href="/terms">Terms of Service</a> with a parent or legal
            guardian.
          </p>
        </section>

        <section className={styles.section}>
          <h2>7. International Users</h2>
          <p>
            KESHAH is based in the United States. If you use the Service from
            outside the U.S., your information will be transferred to,
            processed, and stored in the U.S. and other countries where our
            service providers operate. By using the Service, you consent to
            this transfer.
          </p>
          <p>
            <strong>
              If you are in the European Economic Area, United Kingdom, or
              Switzerland:
            </strong>{" "}
            you may have additional rights under GDPR, including the right to
            lodge a complaint with your local supervisory authority. The lawful
            basis for our processing is (a) performance of our contract with
            you, (b) our legitimate interests in operating and improving the
            Service, (c) your consent where applicable, and (d) compliance with
            legal obligations.
          </p>
          <p>
            <strong>If you are a California resident:</strong> you may have
            additional rights under the California Consumer Privacy Act (CCPA),
            including the right to know what personal information we collect,
            the right to delete it, and the right to opt out of the sale of
            personal information (we do not sell personal information).
          </p>
        </section>

        <section className={styles.section}>
          <h2>8. Security</h2>
          <p>
            We use reasonable technical and organizational measures to protect
            your information from unauthorized access, alteration, disclosure,
            or destruction. Payment information is handled by PCI-DSS-compliant
            third-party processors (Apple, Google, Stripe). We do not store
            credit card numbers on our systems.
          </p>
          <p>
            No method of transmission or storage is 100% secure. We cannot
            guarantee absolute security, and you use the Service at your own
            risk.
          </p>
        </section>

        <section className={styles.section}>
          <h2>9. Cookies and Similar Technologies</h2>
          <p>
            The keshah.com website may use cookies and similar tracking
            technologies to remember your preferences, understand how you use
            the site, and support advertising. You can control cookies through
            your browser settings. The mobile app does not use cookies but uses
            device identifiers for similar purposes.
          </p>
        </section>

        <section className={styles.section}>
          <h2>10. Third-Party Links</h2>
          <p>
            The Service may contain links to third-party websites, apps, or
            services (e.g., research studies, YouTube videos). We are not
            responsible for the privacy practices of those third parties.
            Please review their policies separately.
          </p>
        </section>

        <section className={styles.section}>
          <h2>11. Changes to This Policy</h2>
          <p>
            We may update this Policy from time to time. We will notify you of
            material changes by posting the updated Policy in the Service,
            updating the &quot;Last Updated&quot; date, and, where practical,
            sending a notification. Continued use of the Service after changes
            take effect constitutes acceptance of the updated Policy.
          </p>
        </section>

        <section className={styles.section}>
          <h2>12. Contact</h2>
          <p>Questions or requests? Contact us at:</p>
          <p>
            <strong>KESHAH Inc.</strong>
            <br />
            Email: contact@keshah.com
          </p>
        </section>
      </article>
    </main>
  );
}
