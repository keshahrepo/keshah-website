// Generate styled PDFs from the guide markdown files.
//
// Uses `marked` (markdown → HTML) + headless Chrome (HTML → PDF) so we
// don't need to install Puppeteer. Output styled to match the cover
// aesthetic — cream background, serif typography, "A KESHAH PUBLICATION"
// footer. Bundles result into Flutter assets/guides/{men,women}/*.pdf.
//
// Usage: node scripts/_generate_guide_pdfs.mjs

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { marked } from "marked";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const BUNDLES = [
  {
    label: "men",
    src: "/Users/aadityaagrawal/keshah-website/content/guides-men",
    dest: "/Users/aadityaagrawal/KESHAH-Mobile-App/assets/guides/men",
  },
  {
    label: "women",
    src: "/Users/aadityaagrawal/keshah-website/content/guides-women",
    dest: "/Users/aadityaagrawal/KESHAH-Mobile-App/assets/guides/women",
  },
];

// Style sheet matches the printed cover aesthetic: cream paper, serif
// headlines, sans body. Numbered guide label at the top, "A KESHAH
// PUBLICATION" footer.
function htmlTemplate(title, guideNumber, contentHtml) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  @page {
    size: 8.5in 11in;
    margin: 0.9in 0.9in 1in 0.9in;
    background: #F4EDE3;
    @top-left {
      content: "N° ${guideNumber.padStart(2, "0")}";
      font-family: 'Helvetica Neue', sans-serif;
      font-size: 9pt;
      color: #8c6e4f;
      letter-spacing: 1pt;
    }
    @top-right {
      content: "KESHAH — THE GUIDES";
      font-family: 'Helvetica Neue', sans-serif;
      font-size: 9pt;
      color: #8c6e4f;
      letter-spacing: 1pt;
    }
    @bottom-left {
      content: "A KESHAH PUBLICATION";
      font-family: 'Helvetica Neue', sans-serif;
      font-size: 8pt;
      color: #8c6e4f;
      letter-spacing: 1.2pt;
    }
    @bottom-right {
      content: counter(page);
      font-family: 'Helvetica Neue', sans-serif;
      font-size: 8pt;
      color: #8c6e4f;
    }
  }
  html, body {
    background: #F4EDE3;
    color: #1a1a1a;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.55;
    margin: 0;
    padding: 0;
  }
  h1 {
    font-family: 'Times New Roman', 'Georgia', serif;
    font-weight: 400;
    font-size: 30pt;
    line-height: 1.15;
    margin: 0 0 6pt;
    color: #1a1a1a;
  }
  h1 + em, p:first-of-type em {
    color: #8c6e4f;
    font-style: normal;
    letter-spacing: 1pt;
    font-size: 9pt;
  }
  h2 {
    font-family: 'Times New Roman', 'Georgia', serif;
    font-weight: 400;
    font-size: 18pt;
    line-height: 1.25;
    margin: 28pt 0 8pt;
    color: #1a1a1a;
    page-break-after: avoid;
  }
  h3 {
    font-family: 'Helvetica Neue', sans-serif;
    font-weight: 600;
    font-size: 12pt;
    margin: 18pt 0 6pt;
    color: #1a1a1a;
    page-break-after: avoid;
  }
  p {
    margin: 0 0 10pt;
    color: #2a2a2a;
  }
  strong { font-weight: 600; color: #1a1a1a; }
  em { font-style: italic; color: #4a4a4a; }
  ul, ol { margin: 0 0 12pt; padding-left: 22pt; }
  li { margin-bottom: 6pt; color: #2a2a2a; }
  hr {
    border: none;
    border-top: 0.5pt solid rgba(26,26,26,0.18);
    margin: 18pt 0;
  }
  blockquote {
    border-left: 2pt solid #8c6e4f;
    padding-left: 14pt;
    margin: 14pt 0;
    color: #4a4a4a;
    font-style: italic;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 14pt 0;
    font-size: 10pt;
  }
  th, td {
    border-bottom: 0.5pt solid rgba(26,26,26,0.18);
    padding: 7pt 9pt;
    text-align: left;
    vertical-align: top;
  }
  th {
    border-bottom: 1pt solid rgba(26,26,26,0.5);
    font-weight: 600;
  }
  code {
    background: rgba(26,26,26,0.06);
    padding: 1pt 3pt;
    border-radius: 2pt;
    font-family: 'Menlo', monospace;
    font-size: 9.5pt;
  }
  /* First page styling — the title block from the markdown becomes a
     centered hero. The cover image itself sits in another asset; this
     is the interior title that opens the body. */
  .cover-title { text-align: left; }
</style>
</head>
<body>
${contentHtml}
</body>
</html>`;
}

function generatePdf(srcMd, destPdf, guideNumber) {
  const markdown = readFileSync(srcMd, "utf8");
  const html = marked.parse(markdown);
  const fullHtml = htmlTemplate("", guideNumber, html);

  // Write HTML to a temp file (Chrome needs a file:// URL or http://)
  const tmpDir = mkdtempSync(join(tmpdir(), "keshah-guide-"));
  const htmlPath = join(tmpDir, "guide.html");
  writeFileSync(htmlPath, fullHtml);

  // Use Chrome headless to print to PDF
  execSync(
    `"${CHROME}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${destPdf}" --print-to-pdf-no-header "file://${htmlPath}"`,
    { stdio: "pipe" }
  );
}

let total = 0;
for (const bundle of BUNDLES) {
  mkdirSync(bundle.dest, { recursive: true });
  const files = readdirSync(bundle.src).filter((f) => f.endsWith(".md")).sort();
  console.log(`\n${bundle.label.toUpperCase()} (${files.length} guides):`);
  for (const file of files) {
    const guideNumber = file.split("_")[0]; // "01", "02", etc.
    const srcMd = join(bundle.src, file);
    const destPdf = join(bundle.dest, file.replace(".md", ".pdf"));
    generatePdf(srcMd, destPdf, guideNumber);
    total++;
    console.log(`  ✓ ${file} → ${file.replace(".md", ".pdf")}`);
  }
}

console.log(`\nGenerated ${total} PDFs total.`);
