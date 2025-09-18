---
<p align="center">
  <img src="./banner.png" alt="Deterministic Test Plan Generator" width="100%">
</p>

## 🏆 Deterministic Test Plan Generator
* **TestAutothon 2025 — Non-AI Challenge**  
* Theme: *AI-Powered Testing — Orchestrating Automation, Agents & Generative AI for the Future*  
* This solution does **not** use GenAI — it is fully deterministic.

---

## 📌 Overview

This tool takes a list of failing test incidents (`Failures.jsonl`) and a `Policy.yaml` file and:

- Computes `base_minutes`, `final_minutes`, and `priority_score` for each incident
- Produces a **time-boxed, deterministic test plan** (`plan.json` / `plan.csv`)
- Generates a **sortable dashboard** (`dashboard.html`)
- Sends the results to:
  - 📣 **:contentReference[oaicite:0]{index=0}** (with top tables, file uploads, and links)
  - 📎 **:contentReference[oaicite:1]{index=1}** (attachments + comment on a fixed issue)
  - 📧 **Email distribution list** (HTML tables, embedded download links)

---

## ⚙️ Prerequisites

- :contentReference[oaicite:2]{index=2} v18+  
- npm packages:
  ```bash
  npm install js-yaml nodemailer

📁 Input Files
| File             | Purpose                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| `Policy.yaml`    | Defines module priorities, multipliers, caps, and layer minutes                                      |
| `Failures.jsonl` | Incident list (JSON Lines). Only uses:<br>`module`, `environment`, `failure_type`, `impacted_layers` |

⚡ Usage
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/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"
node planner.js --policy Policy.yaml --failures Failures.jsonl --out plan.json --dashboard dashboard.html

Generates:
plan.json — machine-readable plan (use .csv if preferred)
dashboard.html — interactive summary table

⚡ Output Fields
| Field            | Description                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `base_minutes`   | Sum of minutes per impacted layer (from policy)                                              |
| `final_minutes`  | `base_minutes × environment_multiplier × failure_type_multiplier`, capped and **rounded up** |
| `priority_score` | `module_priority × environment_multiplier × failure_type_multiplier` (rounded to 3 decimals) |

Unknown values:
Unknown module → priority = 1
Unknown environment/failure_type → multiplier = 1.0
Unknown layers → ignored (0 minutes)

📣 Slack Integration
export SLACK_BOT_TOKEN="xoxb-..."
export SLACK_CHANNEL_ID="C0123456789"
export DASHBOARD_URL="https://your-server/dashboard.html"

Configure:

export SLACK_BOT_TOKEN="xoxb-..."
export SLACK_CHANNEL_ID="C0123456789"
export DASHBOARD_URL="https://your-server/dashboard.html"


When run, it will:

Upload plan.json and dashboard.html to Slack

Post a message like:

✅ Deterministic Test Plan generated
• Incidents: 53
• Total minutes: 1278

Top 5 by priority:
#  Module                          Env      Mins   Priority
 1. ⚠️ Order Management                 PreProd     58m    7.20
 ...


Also shows a second table: Top 5 by Final Minutes.

📎 Jira Integration

Configure:

export JIRA_EMAIL="you@company.com"
export JIRA_TOKEN="your_api_token"
export JIRA_BASE="https://your-domain.atlassian.net"
export JIRA_ISSUE_KEY="QAP-123"


Each run will:

Attach plan.json and dashboard.html to that Jira issue

Add a new comment with both tables

📧 Email Integration

Configure SMTP:

export SMTP_HOST="smtp.yourcompany.com"
export SMTP_PORT="587"
export SMTP_USER="automation@yourcompany.com"
export SMTP_PASS="your_password"
export EMAIL_TO="qa-team@yourcompany.com,lead@yourcompany.com"


Each run will:

Email plan.json and dashboard.html as attachments

Include rich HTML with:

Summary counts

Two styled tables (Top 5 by Priority & Final Minutes)

⚡ Download links at the top for both files

📌 Policy Calculation Logic

base_minutes = sum of each layer's minutes

final_minutes = base_minutes × env_mult × failtype_mult (capped and rounded up)

priority_score = module_priority × env_mult × failtype_mult

Sorting:

Primary: priority_score descending

Secondary: module ascending

📌 Notes

No network calls for calculations — fully deterministic

All integrations (Slack, Jira, Email) are optional and auto-skip if credentials are not set

⚠️ marker highlights incidents with final_minutes > 45 (near cap)

📁 Folder Structure
project-root/
  planner.js
  Policy.yaml
  Failures.jsonl
  plan.json
  dashboard.html
  /screenshots
    cli.png
    slack.png
    slack-files.png
    jira-comment.png
    jira-attachments.png
    email.png
    email-attachments.png

📸 Sample Run Screenshots
🖥️ CLI Run
📊 Slack Message (Slack)
📎 Jira Comment (Jira)
📧 Email Report (Nodemailer)

⚠️ These screenshots are for presentation/demo. Actual visuals may vary depending on your Slack theme, Jira configuration, and email client.

## 📸 Sample Run Screenshots

### 🖥️ CLI Run

::contentReference[oaicite:0]{index=0}


---

### 📊 Slack Message (:contentReference[oaicite:1]{index=1})

::contentReference[oaicite:2]{index=2}


---

### 📎 Jira Comment (:contentReference[oaicite:3]{index=3})

::contentReference[oaicite:4]{index=4}


---

### 📧 Email Report (:contentReference[oaicite:5]{index=5})

::contentReference[oaicite:6]{index=6}


---

> ⚠️ These screenshots are for presentation/demo. Your actual visuals may vary depending on your Slack theme, Jira configuration, and email client.
