import styles from "../legal.module.css";

export const metadata = {
  title: "Refund Policy — KESHAH",
};

export default function RefundPolicy() {
  return (
    <main className={styles.page}>
      <article className={styles.container}>
        <h1 className={styles.title}>Refund Policy</h1>
        <p className={styles.updated}>Effective date: November 2025</p>

        <section className={styles.section}>
          <p>
            KESHAH provides a refund guarantee for customers who complete
            our 4-month protocol and do not experience the intended results.
            This policy describes who is eligible, the conditions that must
            be met, and the procedure for submitting a refund request.
          </p>
        </section>

        <section className={styles.section}>
          <h2>1. Eligibility</h2>
          <p>This refund guarantee applies to the following:</p>
          <ul>
            <li>KESHAH VIP treatment</li>
            <li>KESHAH app subscriptions (Monthly and 3-Month plans)</li>
          </ul>
          <p>
            Free trials, gifted access, and promotional credits are not
            covered by this guarantee.
          </p>
        </section>

        <section className={styles.section}>
          <h2>2. Requirements</h2>
          <p>
            To be eligible for a refund, the customer must satisfy both of
            the following conditions:
          </p>
          <ul>
            <li>
              <strong>Completion threshold.</strong> Complete at least 96 of
              the 120 days in the program protocol, equivalent to 80%
              completion.
            </li>
            <li>
              <strong>Submission window.</strong> Submit the refund request
              within 60 days following the completion of day 120.
            </li>
          </ul>
          <p>
            The 80% completion threshold reflects the minimum level of
            consistent engagement required for KESHAH&apos;s scalp
            mechanotherapy protocol to produce measurable results. Refund
            requests that do not satisfy both conditions cannot be honored.
          </p>
        </section>

        <section className={styles.section}>
          <h2>3. How to request a refund</h2>
          <p>
            Send an email to{" "}
            <a href="mailto:contact@keshah.com" className={styles.link}>
              contact@keshah.com
            </a>{" "}
            with the subject line &ldquo;Refund Request&rdquo; and the email
            address associated with your KESHAH account. Completion records
            are verified on our end; no additional documentation is
            required.
          </p>
        </section>

        <section className={styles.section}>
          <h2>4. Processing timeline</h2>
          <ul>
            <li>Initial response: within 2 business days of receipt</li>
            <li>
              Approved refunds: processed within 5 business days of approval
            </li>
            <li>
              Bank settlement: typically an additional 5 to 10 business days,
              depending on the issuing institution
            </li>
          </ul>
          <p>
            Refunds are issued exclusively to the original payment method
            used for the purchase.
          </p>
        </section>

        <section className={styles.section}>
          <h2>5. App Store and Google Play purchases</h2>
          <p>
            Subscriptions purchased through the Apple App Store or Google
            Play may also be refunded under the respective platform
            policies. Customers may pursue a refund through either the
            relevant platform or KESHAH directly, but not both.
          </p>
        </section>

        <section className={styles.section}>
          <h2>6. Technical issues</h2>
          <p>
            If a verifiable technical issue with the application prevented
            you from completing the protocol, please contact us with the
            details. Such cases are reviewed on an individual basis and may
            be granted exceptions to the standard requirements.
          </p>
        </section>

        <section className={styles.section}>
          <h2>7. Modifications to this policy</h2>
          <p>
            KESHAH reserves the right to modify this refund policy at any
            time. Changes apply to subscriptions purchased on or after the
            effective date of the revised policy.
          </p>
        </section>

        <section className={styles.section}>
          <h2>8. Contact</h2>
          <p>
            For questions regarding this policy or to submit a refund
            request, contact{" "}
            <a href="mailto:contact@keshah.com" className={styles.link}>
              contact@keshah.com
            </a>
            .
          </p>
        </section>
      </article>
    </main>
  );
}
