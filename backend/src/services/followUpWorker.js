
import Lead from "../models/Lead.js";

const WORKER_INTERVAL = 10 * 1000;
const MAX_RETRIES = 3;

let workerRunning = false;

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

async function sendEmailWithResend({ recipient, subject, body }) {
  const { RESEND_API_KEY, RESEND_FROM_EMAIL } = process.env;

  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    throw new Error(
      "Resend email service is not configured."
    );
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [recipient],
      subject,
      text: body,
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result.message || `Resend request failed with status ${response.status}.`
    );
  }

  if (!result.id) {
    throw new Error("Resend did not return an email ID.");
  }

  return result;
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
          followUp.lastError =
            "No recipient email address was saved.";
          continue;
        }

        if ((followUp.attempts || 0) >= MAX_RETRIES) {
          followUp.status = "FAILED";
          followUp.lastError =
            followUp.lastError ||
            "Maximum sending attempts reached.";
          continue;
        }

        followUp.attempts = (followUp.attempts || 0) + 1;

        try {
          const info = await sendEmailWithResend({
            recipient,
            subject: followUp.subject,
            body: followUp.body,
          });

          followUp.status = "SENT";
          followUp.sentAt = new Date();
          followUp.lastError = null;

          lead.lastContacted = new Date();

          console.log(
            `Email accepted by Resend for ${recipient}. Email ID: ${info.id}`
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
    console.error(
      "Scheduled follow-up worker error:",
      error
    );
  } finally {
    workerRunning = false;
  }
}

export function startFollowUpWorker() {
  console.log(
    "Resend follow-up worker started. Checking every 10 seconds."
  );

  processScheduledFollowUps();

  setInterval(processScheduledFollowUps, WORKER_INTERVAL);
}
