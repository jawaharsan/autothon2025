#!/usr/bin/env node

/**
 * TestAutothon 2025 - Deterministic Planner (JS)
 * -----------------------------------------------
 * Usage:
 *   node planner.js --policy Policy.yaml --failures Failures.jsonl --out plan.json --dashboard dashboard.html
 *
 * No network calls, fully deterministic.
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { envConfig } from "./config/env.js"

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);

if (!args.policy || !args.failures) {
  console.error("Usage: node planner.js --policy Policy.yaml --failures Failures.jsonl");
  process.exit(1);
}

// ---------- Load Policy ----------
const policy = yaml.load(fs.readFileSync(args.policy, "utf-8"));

const envMult = policy.multipliers.by_environment || {};
const ftMult = policy.multipliers.by_failure_type || {};
const layerMinutes = policy.minutes_per_impacted_layer || {};
const modulePriority = policy.module_priority_score || {};
const cap = policy.caps.per_incident_minutes_max || 60;

// ---------- Helpers ----------
function normalizeLayers(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === "string")
    return val.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

function computeIncident(inc) {
  const module = inc.module?.trim() || "";
  const env = inc.environment?.trim() || "";
  const ft = inc.failure_type?.trim() || "";
  const layers = normalizeLayers(inc.impacted_layers);

  const eMult = envMult[env] ?? 1.0;
  const fMult = ftMult[ft] ?? 1.0;
  const modPr = modulePriority[module] ?? 1;

  const base = layers.reduce((sum, l) => sum + (layerMinutes[l] ?? 0), 0);
  const rawFinal = base * eMult * fMult;
  const finalMin = Math.ceil(Math.min(cap, rawFinal));
  const score = +(modPr * eMult * fMult).toFixed(3);

  return {
    test_id: inc.test_id ?? null,
    module, environment: env, failure_type: ft,
    impacted_layers: layers,
    base_minutes: base,
    final_minutes: finalMin,
    priority_score: score
  };
}

// ---------- Load failures ----------
const failures = fs.readFileSync(args.failures, "utf-8")
  .split(/\r?\n/).filter(Boolean)
  .map((l, i) => {
    try {
      return JSON.parse(l);
    } catch (e) {
      // Try fallback: wrap if not starting with '{'
      const s = l.trim();
      if (!s.startsWith("{") && s.includes(":")) {
        try {
          return JSON.parse("{" + s.replace(/,+\s*$/, "") + "}");
        } catch (e2) {
          console.warn(`⚠️ Skipping bad JSON on line ${i+1}`);
          return null;
        }
      } else {
        console.warn(`⚠️ Skipping bad JSON on line ${i+1}`);
        return null;
      }
    }
  })
  .filter(Boolean);

// ---------- Compute ----------
let results = failures.map((f) => computeIncident(f));
results.sort((a,b) =>
  b.priority_score - a.priority_score ||
  a.module.localeCompare(b.module) ||
  String(a.test_id).localeCompare(String(b.test_id))
);

// ---------- Output plan ----------
if (!args.out) args.out = "plan.json";
if (args.out.endsWith(".csv")) {
  const csv = [
    ["test_id","module","environment","failure_type","impacted_layers","base_minutes","final_minutes","priority_score"],
    ...results.map(r => [
      r.test_id, r.module, r.environment, r.failure_type,
      r.impacted_layers.join("; "), r.base_minutes, r.final_minutes, r.priority_score
    ])
  ].map(row => row.join(",")).join("\n");
  fs.writeFileSync(args.out, csv);
} else {
  fs.writeFileSync(args.out, JSON.stringify(results, null, 2));
}

// ---------- Optional HTML dashboard ----------
if (args.dashboard) {
  const totalMin = results.reduce((a,b)=>a+b.final_minutes,0);
  const totalInc = results.length;
  let rowsHTML = "";   // <-- Declare this BEFORE the loop

  results.forEach(r => {
    rowsHTML += `
  <tr data-module="${r.module}" 
      data-environment="${r.environment}" 
      data-failure_type="${r.failure_type}">
    <td>${r.test_id || ""}</td>
    <td>${r.module}</td>
    <td>${r.environment}</td>
    <td>${r.failure_type}</td>
    <td>${r.impacted_layers.join(", ")}</td>
    <td>${r.base_minutes}</td>
    <td>${r.final_minutes}</td>
    <td>${r.priority_score.toFixed(3)}</td>
  </tr>`;
  });
  const rows = results.map(r => `
    <tr>
      <td>${r.test_id||""}</td><td>${r.module}</td><td>${r.environment}</td><td>${r.failure_type}</td>
      <td>${r.impacted_layers.join(", ")}</td>
      <td style="text-align:right">${r.base_minutes}</td>
      <td style="text-align:right">${r.final_minutes}</td>
      <td style="text-align:right">${r.priority_score}</td>
    </tr>`).join("");

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>Deterministic Test Plan</title>
    <style>
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      th { background-color: #f4f4f4; cursor: pointer; }
      tr:nth-child(even) { background-color: #fafafa; }
    </style>
  </head>
  <body>
  <h2>📊 Deterministic Test Plan</h2>

  <!-- Filter controls -->
  <div style="margin-bottom: 15px; display: flex; gap: 15px; align-items: center;">
    <label>Module:
      <select id="moduleFilter"><option value="">All</option></select>
    </label>
    <label>Environment:
      <select id="envFilter"><option value="">All</option></select>
    </label>
    <label>Failure Type:
      <select id="failureFilter"><option value="">All</option></select>
    </label>
  </div>

  <table>
  <thead>
    <tr>
      <th>Test ID</th>
      <th>Module</th>
      <th>Environment</th>
      <th>Failure Type</th>
      <th>Impacted Layers</th>
      <th>Base Minutes</th>
      <th>Final Minutes</th>
      <th>Priority Score</th>
    </tr>
  </thead>
  <tbody>
  ${rowsHTML}
  </tbody>
  </table>

  <script>
    const table = document.querySelector("table");
    const rows = Array.from(table.querySelectorAll("tbody tr"));

    const moduleSet = new Set();
    const envSet = new Set();
    const failSet = new Set();

    rows.forEach(r => {
      moduleSet.add(r.dataset.module);
      envSet.add(r.dataset.environment);
      failSet.add(r.dataset.failure_type);
    });

    const fillOptions = (sel, values) => {
      values.forEach(v => {
        const o = document.createElement("option");
        o.value = v;
        o.textContent = v;
        sel.appendChild(o);
      });
    };

    fillOptions(document.getElementById("moduleFilter"), moduleSet);
    fillOptions(document.getElementById("envFilter"), envSet);
    fillOptions(document.getElementById("failureFilter"), failSet);

    const applyFilters = () => {
      const m = document.getElementById("moduleFilter").value;
      const e = document.getElementById("envFilter").value;
      const f = document.getElementById("failureFilter").value;

      rows.forEach(row => {
        const match =
          (!m || row.dataset.module === m) &&
          (!e || row.dataset.environment === e) &&
          (!f || row.dataset.failure_type === f);
        row.style.display = match ? "" : "none";
      });
    };

    document.getElementById("moduleFilter").addEventListener("change", applyFilters);
    document.getElementById("envFilter").addEventListener("change", applyFilters);
    document.getElementById("failureFilter").addEventListener("change", applyFilters);
  </script>
  <script>
    const getCellValue = (row, index) =>
      row.children[index].innerText || row.children[index].textContent;

    const comparer = (index, asc) => (a, b) => {
      const v1 = getCellValue(asc ? a : b, index);
      const v2 = getCellValue(asc ? b : a, index);

      return !isNaN(parseFloat(v1)) && !isNaN(parseFloat(v2))
        ? parseFloat(v1) - parseFloat(v2)
        : v1.toString().localeCompare(v2);
    };

    const headers = document.querySelectorAll("th");

    headers.forEach((th, i) => {
      // add initial indicator
      th.innerHTML += ' <span class="sort-indicator" style="color:#aaa;font-size:0.8em;">⇅</span>';

      th.addEventListener("click", () => {
        const table = th.closest("table");
        const tbody = table.querySelector("tbody");
        const asc = !(th.asc = !th.asc);

        Array.from(tbody.querySelectorAll("tr"))
          .sort(comparer(i, asc))
          .forEach(tr => tbody.appendChild(tr));

        // update indicators
        headers.forEach(h => h.querySelector(".sort-indicator").textContent = "⇅");
        th.querySelector(".sort-indicator").textContent = asc ? "▲" : "▼";
      });
    });
  </script>

  </body>
  </html>`;

  fs.writeFileSync(args.dashboard, html);
}

console.log(`✅ Plan saved to ${args.out}`);
if (args.dashboard) console.log(`📊 Dashboard saved to ${args.dashboard}`);


/*// ---------- Slack file upload + summary ----------
const botToken = envConfig.slackBotToken;  // xoxb-...
const channel = envConfig.slackChannel;  // e.g. C0123456789

if (botToken && channel) {
  const uploadFile = async (filepath) => {
    const form = new FormData();
    form.append("channels", channel);
    form.append("file", new Blob([fs.readFileSync(filepath)]));
    form.append("filename", path.basename(filepath));
    form.append("title", path.basename(filepath));

    const resp = await fetch("https://slack.com/api/files.upload", {
      method: "POST",
      headers: { "Authorization": `Bearer ${botToken}` },
      body: form
    });

    const data = await resp.json();
    if (!data.ok) throw new Error(data.error);
  };

    const dashboardUrl = process.env.DASHBOARD_URL || "http://localhost/dashboard.html";

    // ---------- Top 5 by Priority ----------
    const top5ByPriority = results
    .slice(0, 5)
    .map((r, i) => {
        const warn = r.final_minutes > 45 ? "⚠️ " : "   ";
        const link = `<${dashboardUrl}|${r.module}>`;
        return `${String(i+1).padStart(2)}. ${warn}${link.padEnd(30)} ${r.environment.padEnd(8)} ${String(r.final_minutes).padStart(4)}m   ${r.priority_score.toFixed(2)}`;
    }).join("\n");

    // ---------- Top 5 by Final Minutes ----------
    const top5ByMinutes = [...results]
    .sort((a, b) => b.final_minutes - a.final_minutes || b.priority_score - a.priority_score)
    .slice(0, 5)
    .map((r, i) => {
        const warn = r.final_minutes > 45 ? "⚠️ " : "   ";
        const link = `<${dashboardUrl}|${r.module}>`;
        return `${String(i+1).padStart(2)}. ${warn}${link.padEnd(30)} ${r.environment.padEnd(8)} ${String(r.final_minutes).padStart(4)}m   ${r.priority_score.toFixed(2)}`;
    }).join("\n");

    const summary =
    `*Top 5 by priority:*\n` +
    "```#  Module                          Env      Mins   Priority\n" +
    `${top5ByPriority}\n` +
    "```\n\n" +
    `*Top 5 by final minutes:*\n` +
    "```#  Module                          Env      Mins   Priority\n" +
    `${top5ByMinutes}\n` +
    "```\n" +
    "_⚠️ indicates incidents with final_minutes > 45 (near the max cap)_";


  try {
    console.log("📤 Uploading plan.json and dashboard.html to Slack…");
    await uploadFile(args.out);
    if (args.dashboard) await uploadFile(args.dashboard);

    // Post the main message
    await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
        "Authorization": `Bearer ${botToken}`,
        "Content-Type": "application/json"
    },
    body: JSON.stringify({
        channel,
        text:
        `✅ *Deterministic Test Plan generated*\n` +
        `• Incidents: ${results.length}\n` +
        `• Total minutes: ${results.reduce((a,b)=>a+b.final_minutes,0)}\n\n` +
        `${summary}`
    })
    });

    console.log("📣 Slack upload + summary message done");
  } catch (err) {
    console.error("Slack upload failed:", err.message);
  }
}*/

// ---------- Slack webhook message ----------
const slackWebhook = envConfig.slackWebhook;
const dashboardUrl = envConfig.dashboardUrl;

const top5ByPriority = results
.slice(0, 5)
.map((r, i) => {
    const warn = r.final_minutes > 45 ? "⚠️ " : "   ";
    const link = `<${dashboardUrl}|${r.module}>`;
    return `${String(i+1).padStart(2)}. ${warn}${link.padEnd(30)} ${r.environment.padEnd(8)} ${String(r.final_minutes).padStart(4)}m   ${r.priority_score.toFixed(2)}`;
}).join("\n");

const top5ByMinutes = [...results]
.sort((a, b) => b.final_minutes - a.final_minutes || b.priority_score - a.priority_score)
.slice(0, 5)
.map((r, i) => {
    const warn = r.final_minutes > 45 ? "⚠️ " : "   ";
    const link = `<${dashboardUrl}|${r.module}>`;
    return `${String(i+1).padStart(2)}. ${warn}${link.padEnd(30)} ${r.environment.padEnd(8)} ${String(r.final_minutes).padStart(4)}m   ${r.priority_score.toFixed(2)}`;
}).join("\n");

if (slackWebhook) {
  const text =
    `✅ *Deterministic Test Plan generated*\n` +
    `• Incidents: ${results.length}\n` +
    `• Total minutes: ${results.reduce((a,b)=>a+b.final_minutes,0)}\n\n` +
    `*Top 5 by priority:*\n` +
    "```#  Module                          Env      Mins   Priority\n" +
    `${top5ByPriority}\n` +
    "```\n\n" +
    `*Top 5 by final minutes:*\n` +
    "```#  Module                          Env      Mins   Priority\n" +
    `${top5ByMinutes}\n` +
    "```\n" +
    "_⚠️ indicates incidents with final_minutes > 45 (near the max cap)_";

  await fetch(slackWebhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  })
    .then(r => {
      if (!r.ok) throw new Error(`Slack webhook error ${r.status}`);
      console.log("📣 Slack message sent via webhook");
    })
    .catch(e => console.error("Slack send failed:", e.message));
}


// ---------- Optional: Attach to Jira ----------
const jiraEmail = envConfig.jiraEmail;
const jiraToken = envConfig.jiraToken;
const jiraBase = envConfig.jiraBase;
const jiraIssue = envConfig.jiraIssue;

if (jiraEmail && jiraToken && jiraBase && jiraIssue) {
  const authHeader = "Basic " + Buffer.from(`${jiraEmail}:${jiraToken}`).toString("base64");

  const attachFile = async (filePath) => {
    const form = new FormData();
    form.append("file", new Blob([fs.readFileSync(filePath)]), path.basename(filePath));
    const resp = await fetch(`${jiraBase}/rest/api/2/issue/${jiraIssue}/attachments`, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "X-Atlassian-Token": "no-check"
      },
      body: form
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.errors || data);
  };

  try {
    console.log(`📎 Attaching plan.json and dashboard.html to Jira issue ${jiraIssue}`);
    await attachFile(args.out);
    if (args.dashboard) await attachFile(args.dashboard);

    // Add comment with summary tables
    const commentBody =
      `✅ *Deterministic Test Plan generated*\n` +
      `*Incidents:* ${results.length} • *Total minutes:* ${results.reduce((a,b)=>a+b.final_minutes,0)}\n\n` +
      `*Top 5 by priority:*\n` +
      "{code}\n#  Module                          Env      Mins   Priority\n" +
      `${top5ByPriority}\n{code}\n\n` +
      `*Top 5 by final minutes:*\n` +
      "{code}\n#  Module                          Env      Mins   Priority\n" +
      `${top5ByMinutes}\n{code}\n` +
      "_⚠️ indicates incidents with final_minutes > 45 (near the max cap)_";

    await fetch(`${jiraBase}/rest/api/2/issue/${jiraIssue}/comment`, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ body: commentBody })
    });

    console.log(`📣 Added comment + attachments to Jira issue ${jiraIssue}`);
  } catch (err) {
    console.error("Jira upload failed:", err.message);
  }
}

/* // ---------- Optional: Email the plan ----------
import nodemailer from "nodemailer";

const smtpHost = envConfig.smptHost;
const smtpPort = envConfig.smtpPort;
const smtpUser = envConfig.smtpUser;
const smtpPass = envConfig.smtpPass;
const emailTo = envConfig.smtpEmailTo; // comma-separated list

if (smtpHost && smtpPort && smtpUser && smtpPass && emailTo) {
  try {
    console.log(`📧 Sending email with plan + dashboard to ${emailTo}`);

    // ---------- Build inline download links for attachments ----------
    const planData = fs.readFileSync(args.out);
    const planBase64 = planData.toString("base64");
    const planDownloadLink = `data:application/json;base64,${planBase64}`;

    const dashLink = args.dashboard ? (() => {
    const dashData = fs.readFileSync(args.dashboard);
    return `data:text/html;base64,${dashData.toString("base64")}`;
    })() : null;

    const downloadLinks = `
    <p style="margin-bottom:20px">
        📎 <a href="${planDownloadLink}" download="${path.basename(args.out)}"
            style="color:#0366d6;text-decoration:none">Download plan.json</a>
        ${dashLink ? 
        ` &nbsp;|&nbsp; 📊 <a href="${dashLink}" download="${path.basename(args.dashboard)}"
            style="color:#0366d6;text-decoration:none">Download dashboard.html</a>` : ""}
    </p>
    `;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(smtpPort),
      secure: false, // true for port 465
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    const attachments = [
      { filename: path.basename(args.out), content: fs.createReadStream(args.out) },
      args.dashboard ? { filename: path.basename(args.dashboard), content: fs.createReadStream(args.dashboard) } : null
    ].filter(Boolean);

    const tableRow = (r, i) => {
    const warn = r.final_minutes > 45 ? "⚠️" : "";
    return `
        <tr>
        <td style="padding:6px;border-bottom:1px solid #eee">${i+1}</td>
        <td style="padding:6px;border-bottom:1px solid #eee">${warn}</td>
        <td style="padding:6px;border-bottom:1px solid #eee">
            <a href="${dashboardUrl}" style="color:#0366d6;text-decoration:none">${r.module}</a>
        </td>
        <td style="padding:6px;border-bottom:1px solid #eee">${r.environment}</td>
        <td style="padding:6px;border-bottom:1px solid #eee;text-align:right">${r.final_minutes}m</td>
        <td style="padding:6px;border-bottom:1px solid #eee;text-align:right">${r.priority_score.toFixed(2)}</td>
        </tr>`;
    };

    const buildTable = (rows) => `
    <table style="border-collapse:collapse;width:100%;margin:10px 0">
        <thead>
        <tr style="background:#f6f8fa">
            <th style="padding:6px;text-align:left">#</th>
            <th style="padding:6px"></th>
            <th style="padding:6px;text-align:left">Module</th>
            <th style="padding:6px;text-align:left">Env</th>
            <th style="padding:6px;text-align:right">Minutes</th>
            <th style="padding:6px;text-align:right">Priority</th>
        </tr>
        </thead>
        <tbody>
        ${rows}
        </tbody>
    </table>`;

    const top5PriorityRows = results.slice(0,5).map(tableRow).join("");
    const top5MinutesRows = [...results]
    .sort((a,b)=>b.final_minutes - a.final_minutes || b.priority_score - a.priority_score)
    .slice(0,5)
    .map(tableRow).join("");

    const htmlBody = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#333">
        ${downloadLinks}
        <h2>✅ Deterministic Test Plan generated</h2>
        <p>• <b>Incidents:</b> ${results.length}<br>
        • <b>Total minutes:</b> ${results.reduce((a,b)=>a+b.final_minutes,0)}</p>

        <h3>Top 5 by Priority</h3>
        ${buildTable(top5PriorityRows)}

        <h3>Top 5 by Final Minutes</h3>
        ${buildTable(top5MinutesRows)}

        <p style="color:#d00;margin-top:15px">
        ⚠️ indicates incidents with final_minutes > 45 (near the max cap)
        </p>
    </div>
    `;

    await transporter.sendMail({
        from: `"Automation Bot" <${smtpUser}>`,
        to: emailTo,
        subject: `Deterministic Test Plan - ${new Date().toLocaleString()}`,
        html: htmlBody,
        attachments
    });

    console.log("📨 Email sent successfully");
  } catch (err) {
    console.error("Email send failed:", err.message);
  }
} */
