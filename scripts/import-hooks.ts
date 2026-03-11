import { readFileSync } from "fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// Load env manually
const envFile = readFileSync(".env.production.local", "utf-8");
for (const line of envFile.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
}

const hooks = JSON.parse(readFileSync("scripts/hooks.json", "utf-8"));

const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
);

const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

async function main() {
  console.log(`Importing ${hooks.length} hooks to Firestore...`);

  let count = 0;
  for (const hook of hooks) {
    await db.collection("Hooks").add({
      title: hook.title,
      category: hook.category,
      talking_points: hook.talking_points,
      core_message: hook.core_message,
      reference_video_url: hook.reference_video_url,
      views: hook.views,
      is_active: true,
      created_at: FieldValue.serverTimestamp(),
    });
    count++;
    console.log(`  [${count}/${hooks.length}] ${hook.category}: ${hook.title.slice(0, 50)}...`);
  }

  console.log(`\nDone! ${count} hooks imported.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
