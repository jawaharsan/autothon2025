import dotenv from 'dotenv';
dotenv.config();

export const envConfig = {
    slackBotToken: process.env.SLACK_BOT_TOKEN || "",
    slackChannel: process.env.SLACK_CHANNEL_ID || "",
    slackWebhook: process.env.SLACK_WEBHOOK_URL || "",
    jiraEmail : process.env.JIRA_EMAIL || "",
    jiraToken : process.env.JIRA_TOKEN || "",
    jiraBase : process.env.JIRA_BASE || "",
    jiraIssue : process.env.JIRA_ISSUE_KEY || "",
    dashboardUrl: process.env.DASHBOARD_URL || "",
};