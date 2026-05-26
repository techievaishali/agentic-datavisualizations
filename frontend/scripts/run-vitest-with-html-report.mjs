import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const reportDir = resolve(projectRoot, "src", "test", "Report");
const jsonReportPath = resolve(reportDir, "vitest-report.json");
const htmlReportPath = resolve(reportDir, "vitest-report.html");

mkdirSync(reportDir, { recursive: true });
rmSync(jsonReportPath, { force: true });
rmSync(resolve(reportDir, "assets"), { recursive: true, force: true });
rmSync(resolve(reportDir, "bg.png"), { force: true });
rmSync(resolve(reportDir, "favicon.ico"), { force: true });
rmSync(resolve(reportDir, "favicon.svg"), { force: true });
rmSync(resolve(reportDir, "html.meta.json.gz"), { force: true });

const vitestArgs = [
  "vitest",
  "run",
  "--reporter=default",
  "--reporter=json",
  `--outputFile=${jsonReportPath}`,
  ...process.argv.slice(2),
];

const vitestCommand = process.platform === "win32" ? "cmd.exe" : "npx";
const vitestCommandArgs = process.platform === "win32" ? ["/c", "npx", ...vitestArgs] : vitestArgs;

const vitestProcess = spawn(vitestCommand, vitestCommandArgs, {
  cwd: projectRoot,
  stdio: "inherit",
  shell: false,
});

vitestProcess.on("close", (exitCode) => {
  try {
    const report = JSON.parse(readFileSync(jsonReportPath, "utf8"));
    writeFileSync(htmlReportPath, buildHtmlReport(report), "utf8");
    rmSync(jsonReportPath, { force: true });
  } catch (error) {
    writeFileSync(htmlReportPath, buildFailureHtml(error), "utf8");
  }

  process.exit(exitCode ?? 1);
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDuration(milliseconds) {
  if (typeof milliseconds !== "number") {
    return "-";
  }

  if (milliseconds < 1000) {
    return `${milliseconds} ms`;
  }

  return `${(milliseconds / 1000).toFixed(2)} s`;
}

function badgeClass(status) {
  if (status === "passed") return "passed";
  if (status === "failed") return "failed";
  if (status === "pending") return "pending";
  return "other";
}

function buildHtmlReport(report) {
  const summaryCards = [
    ["Files", `${report.numPassedTestSuites}/${report.numTotalTestSuites} passed`],
    ["Tests", `${report.numPassedTests}/${report.numTotalTests} passed`],
    ["Failed", `${report.numFailedTests ?? 0}`],
    ["Pending", `${report.numPendingTests ?? 0}`],
    ["Started", new Date(report.startTime).toLocaleString()],
    ["Success", report.success ? "Yes" : "No"],
  ]
    .map(
      ([label, value]) => `
        <div class="summary-card">
          <div class="summary-label">${escapeHtml(label)}</div>
          <div class="summary-value">${escapeHtml(value)}</div>
        </div>`
    )
    .join("");

  const files = (report.testResults ?? [])
    .map((fileResult) => {
      const assertions = (fileResult.assertionResults ?? [])
        .map((assertion) => {
          const location = assertion.location
            ? `${assertion.location.line}:${assertion.location.column}`
            : "";
          const failureMessages = (assertion.failureMessages ?? [])
            .map((message) => `<pre>${escapeHtml(message)}</pre>`)
            .join("");

          return `
            <div class="test-case ${badgeClass(assertion.status)}">
              <div class="test-case-header">
                <span class="badge ${badgeClass(assertion.status)}">${escapeHtml(assertion.status)}</span>
                <span class="test-title">${escapeHtml(assertion.fullName || assertion.title)}</span>
                <span class="test-duration">${escapeHtml(formatDuration(assertion.duration))}</span>
              </div>
              ${location ? `<div class="test-location">${escapeHtml(location)}</div>` : ""}
              ${failureMessages}
            </div>`;
        })
        .join("");

      return `
        <section class="file-block">
          <div class="file-header">
            <div>
              <h2>${escapeHtml(fileResult.name)}</h2>
              <div class="file-meta">Status: <span class="badge ${badgeClass(fileResult.status)}">${escapeHtml(fileResult.status)}</span></div>
            </div>
            <div class="file-duration">${escapeHtml(formatDuration((fileResult.endTime ?? 0) - (fileResult.startTime ?? 0)))}</div>
          </div>
          <div class="test-list">${assertions || '<div class="empty">No test cases recorded.</div>'}</div>
        </section>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Frontend Test Report</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f1ea;
        --panel: #fffdf8;
        --ink: #1f2933;
        --muted: #667085;
        --line: #ded6c8;
        --passed: #1f7a4d;
        --failed: #b42318;
        --pending: #b54708;
        --other: #475467;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", Tahoma, sans-serif;
        background: linear-gradient(180deg, #f4f1ea 0%, #efe7d8 100%);
        color: var(--ink);
      }
      main {
        max-width: 1200px;
        margin: 0 auto;
        padding: 32px 20px 48px;
      }
      h1, h2 { margin: 0; }
      .hero {
        background: rgba(255, 253, 248, 0.92);
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 24px;
        box-shadow: 0 18px 50px rgba(31, 41, 51, 0.08);
      }
      .hero p {
        margin: 10px 0 0;
        color: var(--muted);
      }
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 12px;
        margin-top: 20px;
      }
      .summary-card, .file-block {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 18px;
      }
      .summary-card {
        padding: 16px;
      }
      .summary-label {
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--muted);
      }
      .summary-value {
        margin-top: 6px;
        font-size: 1.2rem;
        font-weight: 700;
      }
      .files {
        display: grid;
        gap: 16px;
        margin-top: 24px;
      }
      .file-block {
        padding: 18px;
      }
      .file-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 14px;
      }
      .file-meta, .file-duration, .test-location {
        color: var(--muted);
        font-size: 0.92rem;
      }
      .test-list {
        display: grid;
        gap: 10px;
      }
      .test-case {
        border: 1px solid var(--line);
        border-left-width: 5px;
        border-radius: 14px;
        padding: 12px 14px;
        background: #fff;
      }
      .test-case.passed { border-left-color: var(--passed); }
      .test-case.failed { border-left-color: var(--failed); }
      .test-case.pending { border-left-color: var(--pending); }
      .test-case.other { border-left-color: var(--other); }
      .test-case-header {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .test-title {
        font-weight: 600;
        flex: 1 1 280px;
      }
      .test-duration {
        color: var(--muted);
      }
      .badge {
        display: inline-flex;
        align-items: center;
        padding: 4px 8px;
        border-radius: 999px;
        font-size: 0.78rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: white;
      }
      .badge.passed { background: var(--passed); }
      .badge.failed { background: var(--failed); }
      .badge.pending { background: var(--pending); }
      .badge.other { background: var(--other); }
      pre {
        margin: 10px 0 0;
        padding: 12px;
        overflow: auto;
        white-space: pre-wrap;
        background: #2b1f1f;
        color: #fff4ef;
        border-radius: 12px;
      }
      .empty {
        color: var(--muted);
        font-style: italic;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <h1>Frontend Test Report</h1>
        <p>Self-contained HTML report generated from Vitest JSON output.</p>
        <div class="summary-grid">${summaryCards}</div>
      </section>
      <section class="files">${files}</section>
    </main>
  </body>
</html>`;
}

function buildFailureHtml(error) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Frontend Test Report Error</title>
    <style>
      body { font-family: "Segoe UI", Tahoma, sans-serif; padding: 32px; background: #fff7ed; color: #7a271a; }
      pre { white-space: pre-wrap; background: #2b1f1f; color: #fff4ef; padding: 16px; border-radius: 12px; }
    </style>
  </head>
  <body>
    <h1>Frontend Test Report Generation Failed</h1>
    <pre>${escapeHtml(error?.stack || error?.message || String(error))}</pre>
  </body>
</html>`;
}