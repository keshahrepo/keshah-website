import Image from "next/image";
import styles from "./page.module.css";

export const metadata = {
  title: "Delete Account — KESHAH",
};

export default function DeleteAccount() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title}>Delete your account</h1>
        <p className={styles.subtitle}>
          You can delete your KESHAH account directly from the app. This will permanently remove all your data.
        </p>

        <div className={styles.layout}>
          <div className={styles.phone}>
            <Image
              src="/images/delete-account-screenshot.png"
              alt="KESHAH app — Delete account option in Profile tab"
              width={280}
              height={606}
              className={styles.screenshot}
              priority
            />
          </div>

          <div className={styles.aside}>
            <ol className={styles.steps}>
              <li>Open the KESHAH app</li>
              <li>Tap the <strong>Profile</strong> tab (bottom right)</li>
              <li>Scroll down and tap <strong>Delete account</strong></li>
              <li>Confirm deletion</li>
            </ol>

            <p className={styles.note}>
          If you need help, contact us at{" "}
          <a href="mailto:contact@keshah.com" className={styles.link}>
            contact@keshah.com
          </a>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
