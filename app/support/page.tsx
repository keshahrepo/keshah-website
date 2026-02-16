import styles from "../legal.module.css";

export const metadata = {
  title: "Support — KESHAH",
};

export default function Support() {
  return (
    <main className={styles.page}>
      <article className={styles.container}>
        <h1 className={styles.title}>Support</h1>

        <section className={styles.section}>
          <p>
            Have a question, issue, or feedback? We&apos;d love to hear from
            you.
          </p>
          <p>
            Contact us at{" "}
            <a href="mailto:contact@keshah.com" className={styles.link}>
              contact@keshah.com
            </a>
          </p>
          <p>We typically respond within 24 hours.</p>
        </section>
      </article>
    </main>
  );
}
