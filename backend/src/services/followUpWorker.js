
import nodemailer from "nodemailer";
import Lead from "../models/Lead.js";

const WORKER_INTERVAL = 10 * 1000;
const MAX_RETRIES = 3;

let workerRunning = false;

function createTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } =
    process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error("Gmail SMTP environment variables are missing.");
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

function getScheduledFollowUps(lead) {
  return lead.history
    .filter(
      (item) =>
        item.type === "FOLLOW_UP" &&
        item.status === "SCHEDULED"
    )
    .sort(
      (a, b) =>
        new Date(a.scheduledAt || a.date) -
        new Date(b.scheduledAt || b.date)
    );
}

function syncLeadState(lead) {
  const scheduled = getScheduledFollowUps(lead);

  if (scheduled.length > 0) {
    lead.status = "FOLLOW_UP_DUE";
    lead.nextFollowUp =
      scheduled[0].scheduledAt || scheduled[0].date;
  } else {
    lead.nextFollowUp = null;

    const hasOutreach = lead.history.length > 0;
    lead.status = hasOutreach ? "CONTACTED" : "NOT_CONTACTED";
  }
}

async function processScheduledFollowUps() {
  if (workerRunning) return;
  workerRunning = true;

  try {
    const now = new Date();

    const leads = await Lead.find({
      history: {
        $elemMatch: {
          type: "FOLLOW_UP",
          status: "SCHEDULED",
          scheduledAt: { $lte: now },
        },
      },
    });

    for (const lead of leads) {
      let changed = false;

      for (const followUp of lead.history) {
        if (
          followUp.type !== "FOLLOW_UP" ||
          followUp.status !== "SCHEDULED" ||
          !followUp.scheduledAt ||
          new Date(followUp.scheduledAt) > now
        ) {
          continue;
        }

        changed = true;

        const recipient =
          followUp.recipientEmail || lead.email;

        if (!recipient) {
          followUp.status = "FAILED";
          followUp.lastError = "No recipient email address was saved.";
          continue;
        }

        if (followUp.attempts >= MAX_RETRIES) {
          followUp.status = "FAILED";
          followUp.lastError =
            followUp.lastError || "Maximum sending attempts reached.";
          continue;
        }

        followUp.attempts += 1;

        try {
          const transporter = createTransporter();

          const info = await transporter.sendMail({
            from: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
            to: recipient,
            subject: followUp.subject,
            text: followUp.body,
          });

          followUp.status = "SENT";
          followUp.sentAt = new Date();
          followUp.lastError = null;

          lead.lastContacted = new Date();

          console.log(
            `Email accepted by Gmail SMTP for ${recipient}. Message ID: ${info.messageId}`
          );
        } catch (error) {
          followUp.lastError =
            error?.message || "Unknown email sending error";

          if (followUp.attempts >= MAX_RETRIES) {
            followUp.status = "FAILED";
          }

          console.error(
            `Email attempt ${followUp.attempts}/${MAX_RETRIES} failed for ${recipient}:`,
            followUp.lastError
          );
        }
      }

      if (changed) {
        syncLeadState(lead);
        await lead.save();
      }
    }
  } catch (error) {
    console.error("Scheduled follow-up worker error:", error);
  } finally {
    workerRunning = false;
  }
}

export function startFollowUpWorker() {
  console.log(
    "Gmail follow-up worker started. Checking every 10 seconds."
  );

  processScheduledFollowUps();

  setInterval(processScheduledFollowUps, WORKER_INTERVAL);
}
