import { Resend } from "resend";
import Lead from "../models/Lead.js";

const WORKER_INTERVAL = 10 * 1000; // 10 seconds
const MAX_RETRIES = 3;

// ----------------------------------------------------
// GET SCHEDULED FOLLOW-UPS
// ----------------------------------------------------

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

// ----------------------------------------------------
// SYNC LEAD STATE
// ----------------------------------------------------

function syncLeadState(lead) {
  const scheduled = getScheduledFollowUps(lead);

  if (scheduled.length > 0) {
    lead.status = "FOLLOW_UP_DUE";

    lead.nextFollowUp =
      scheduled[0].scheduledAt ||
      scheduled[0].date;
  } else {
    lead.nextFollowUp = null;

    const hasOutreach =
      lead.history.length > 0;

    lead.status = hasOutreach
      ? "CONTACTED"
      : "NOT_CONTACTED";
  }
}

// ----------------------------------------------------
// PROCESS SCHEDULED FOLLOW-UPS
// ----------------------------------------------------

async function processScheduledFollowUps() {
  const resend = new Resend(
    process.env.RESEND_API_KEY
  );

  try {
    const now = new Date();

    const leads = await Lead.find({
      history: {
        $elemMatch: {
          type: "FOLLOW_UP",
          status: "SCHEDULED",
          scheduledAt: {
            $lte: now,
          },
        },
      },
    });

    if (leads.length === 0) {
      return;
    }

    for (const lead of leads) {
      const dueFollowUps =
        lead.history.filter(
          (item) =>
            item.type === "FOLLOW_UP" &&
            item.status === "SCHEDULED" &&
            item.scheduledAt &&
            new Date(item.scheduledAt) <= now
        );

      for (const followUp of dueFollowUps) {
        try {
          /*
            Make sure the retry counter exists.
          */
          if (
            typeof followUp.attempts !==
            "number"
          ) {
            followUp.attempts = 0;
          }

          /*
            Stop retrying after the maximum number
            of attempts.
          */
          if (
            followUp.attempts >= MAX_RETRIES
          ) {
            followUp.status = "FAILED";

            followUp.lastError =
              "Maximum email delivery attempts reached.";

            console.error(
              `Maximum retries reached for ${lead.company}`
            );

            continue;
          }

          followUp.attempts += 1;

          console.log(
            `Sending scheduled follow-up to ${lead.email}...`
          );

          console.log(
            `Attempt ${followUp.attempts}/${MAX_RETRIES}`
          );

          const { data, error } =
            await resend.emails.send({
              from: process.env.RESEND_FROM_EMAIL,
              to: [lead.email],
              subject: followUp.subject,
              text: followUp.body,
            });

          // ------------------------------------------------
          // RESEND RETURNED AN ERROR
          // ------------------------------------------------

          if (error) {
            console.error(
              `Failed to send scheduled follow-up for ${lead.company}:`,
              error
            );

            followUp.lastError =
              error.message ||
              JSON.stringify(error);

            /*
              If this was the final attempt,
              mark the follow-up as FAILED.
            */
            if (
              followUp.attempts >= MAX_RETRIES
            ) {
              followUp.status = "FAILED";

              console.error(
                `Follow-up permanently failed for ${lead.company}`
              );
            }

            continue;
          }

          // ------------------------------------------------
          // SUCCESS
          // ------------------------------------------------

          followUp.status = "SENT";
          followUp.sentAt = new Date();

          followUp.lastError = null;

          lead.lastContacted =
            new Date();

          console.log(
            `Scheduled follow-up sent successfully to ${lead.email}`
          );

          console.log(
            `Resend email ID: ${
              data?.id || "unknown"
            }`
          );
        } catch (error) {
          console.error(
            `Error sending scheduled follow-up for ${lead.company}:`,
            error
          );

          if (
            typeof followUp.attempts !==
            "number"
          ) {
            followUp.attempts = 0;
          }

          followUp.lastError =
            error.message ||
            "Unknown email sending error";

          if (
            followUp.attempts >= MAX_RETRIES
          ) {
            followUp.status = "FAILED";
          }
        }
      }

      // Keep lead status and nextFollowUp synchronized.
      syncLeadState(lead);

      await lead.save();
    }
  } catch (error) {
    console.error(
      "Scheduled follow-up worker error:",
      error
    );
  }
}

// ----------------------------------------------------
// START WORKER
// ----------------------------------------------------

export function startFollowUpWorker() {
  console.log(
    "Follow-up worker started. Checking every 10 seconds."
  );

  // Run immediately when the server starts.
  processScheduledFollowUps();

  // Continue checking every 10 seconds.
  setInterval(
    processScheduledFollowUps,
    WORKER_INTERVAL
  );
}