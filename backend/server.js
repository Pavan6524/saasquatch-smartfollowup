
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import Lead from "./src/models/Lead.js";
import { startFollowUpWorker } from "./src/services/followUpWorker.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb://127.0.0.1:27017/saasquatch";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRecipientEmail(value) {
  if (typeof value !== "string") return null;

  const email = value.trim().toLowerCase();

  return email.length <= 254 && EMAIL_RE.test(email)
    ? email
    : null;
}
// ----------------------------------------------------
// DEMO DATA
// ----------------------------------------------------

const demoLeads = [
  {
    company: "ABC Corporation",
    contact: "John Smith",
    title: "CEO",
    email: "john@abccorp.example",
    industry: "SaaS",
    status: "FOLLOW_UP_DUE",
    lastContacted: "2026-10-03T10:00:00Z",
    nextFollowUp: "2026-10-07T10:00:00Z",
    history: [
      {
        type: "INITIAL",
        subject: "Introduction",
        body:
          "Hi John, I wanted to introduce myself and explore whether there may be an opportunity to work together.",
        date: "2026-10-03T10:00:00Z",
        status: "SENT",
      },
    ],
  },
  {
    company: "Northstar Analytics",
    contact: "Sarah Lee",
    title: "Founder",
    email: "sarah@northstar.example",
    industry: "Data & Analytics",
    status: "CONTACTED",
    lastContacted: "2026-10-06T09:30:00Z",
    nextFollowUp: "2026-10-10T09:30:00Z",
    history: [
      {
        type: "INITIAL",
        subject: "Quick introduction",
        body:
          "Hi Sarah, I came across Northstar Analytics and wanted to connect regarding a potential opportunity.",
        date: "2026-10-06T09:30:00Z",
        status: "SENT",
      },
    ],
  },
  {
    company: "Delta Health",
    contact: "Mike Jones",
    title: "VP Operations",
    email: "mike@deltahealth.example",
    industry: "Healthcare",
    status: "REPLIED",
    lastContacted: "2026-10-02T11:00:00Z",
    nextFollowUp: null,
    history: [
      {
        type: "INITIAL",
        subject: "Introduction",
        body: "Hi Mike, I wanted to connect about a potential opportunity.",
        date: "2026-09-29T11:00:00Z",
        status: "SENT",
      },
      {
        type: "FOLLOW_UP",
        subject: "Following up",
        body: "Hi Mike, just following up on my previous note.",
        date: "2026-10-02T11:00:00Z",
        status: "SENT",
      },
    ],
  },
  {
    company: "Vertex Manufacturing",
    contact: "David Kumar",
    title: "Managing Director",
    email: "david@vertex.example",
    industry: "Manufacturing",
    status: "NOT_CONTACTED",
    lastContacted: null,
    nextFollowUp: null,
    history: [],
  },
];

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

function syncNextFollowUp(lead) {
  const scheduled = getScheduledFollowUps(lead);

  lead.nextFollowUp =
    scheduled.length > 0
      ? scheduled[0].scheduledAt || scheduled[0].date
      : null;
}

function validText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// ----------------------------------------------------
// SEED DEMO DATA
// ----------------------------------------------------

async function seedDemoData() {
  const count = await Lead.countDocuments();

  if (count === 0) {
    await Lead.insertMany(demoLeads);
    console.log("Demo leads inserted into MongoDB.");
  }
}

// ----------------------------------------------------
// HEALTH
// ----------------------------------------------------

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    database:
      mongoose.connection.readyState === 1
        ? "connected"
        : "disconnected",
  });
});

// ----------------------------------------------------
// GET LEADS
// ----------------------------------------------------

app.get("/api/leads", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const filter = {};

    if (q) {
      const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      filter.$or = [
        { company: { $regex: escapedQuery, $options: "i" } },
        { contact: { $regex: escapedQuery, $options: "i" } },
        { email: { $regex: escapedQuery, $options: "i" } },
        { industry: { $regex: escapedQuery, $options: "i" } },
      ];
    }

    const leads = await Lead.find(filter).sort({ createdAt: 1 });

    res.json(
      leads.map((lead) => {
        const data = lead.toObject();
        const scheduledFollowUps = getScheduledFollowUps(lead);

        return {
          ...data,
          id: lead._id.toString(),
          nextFollowUps: scheduledFollowUps.map((item) => ({
            date: item.scheduledAt || item.date,
            subject: item.subject,
          })),
        };
      })
    );
  } catch (error) {
    console.error("Failed to fetch leads:", error);

    res.status(500).json({
      message: "Failed to fetch leads",
    });
  }
});

// ----------------------------------------------------
// GENERATE FOLLOW-UP
// ----------------------------------------------------

app.post("/api/leads/:id/follow-up/generate", async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({
        message: "Lead not found",
      });
    }

    const firstName = lead.contact.split(" ")[0];

    res.json({
      subject: `Following up — ${lead.company}`,
      body:
        `Hi ${firstName},\n\n` +
        `I wanted to follow up on my previous email regarding ${lead.company}. ` +
        "I know you may be busy, so I wanted to check whether this is something " +
        "you would be open to discussing.\n\n" +
        "If it is relevant, I would be happy to find a convenient time for a quick conversation.\n\n" +
        "Best,\nPavan",
    });
  } catch (error) {
    console.error("Failed to generate follow-up:", error);

    res.status(500).json({
      message: "Failed to generate follow-up",
    });
  }
});

// ----------------------------------------------------
// SEND FOLLOW-UP NOW
// ----------------------------------------------------

app.post("/api/leads/:id/follow-up/send", async (req, res) => {
  try {
    const { subject, body } = req.body;
    const recipientEmail = validateRecipientEmail(req.body.recipientEmail);

    if (!recipientEmail) {
      return res.status(400).json({
        message: "Please provide a valid recipient email address.",
      });
    }

    if (!validText(subject) || !validText(body)) {
      return res.status(400).json({
        message: "Subject and body are required.",
      });
    }
if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
  return res.status(503).json({
    message: "Resend email service is not configured on the server.",
  });
}


    const lead = await Lead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({
        message: "Lead not found",
      });
    }

if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
  throw new Error("Resend email service is not configured.");
}

const response = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from: process.env.RESEND_FROM_EMAIL,
    to: [recipientEmail],
    subject: subject.trim(),
    text: body.trim(),
  }),
});

const result = await response.json();

if (!response.ok) {
  throw new Error(result.message || "Resend failed to send the email.");
}

const info = result;


    const now = new Date();

    lead.history.push({
      type: "FOLLOW_UP",
      subject: subject.trim(),
      body: body.trim(),
      recipientEmail,
      date: now,
      status: "SENT",
      scheduledAt: null,
    });

    lead.lastContacted = now;

    const scheduled = getScheduledFollowUps(lead);

    if (scheduled.length > 0) {
      lead.status = "FOLLOW_UP_DUE";
      lead.nextFollowUp = scheduled[0].scheduledAt || scheduled[0].date;
    } else {
      lead.status = "CONTACTED";
      lead.nextFollowUp = null;
    }

    await lead.save();
   res.json({
  message: `Email accepted by Resend for ${recipientEmail}.`,
  emailId: info.id || null,
  lead: {
    ...lead.toObject(),
    id: lead._id.toString(),
  },
});

  } catch (error) {
    console.error("Email sending failed:", error);

    res.status(500).json({
      message: "Failed to send follow-up email.",
    });
  }
});

// ----------------------------------------------------
// SCHEDULE FOLLOW-UP
// ----------------------------------------------------

app.post("/api/leads/:id/follow-up/schedule", async (req, res) => {
  try {
    const { subject, body, scheduledAt } = req.body;
    const recipientEmail = validateRecipientEmail(req.body.recipientEmail);

    if (!recipientEmail) {
      return res.status(400).json({
        message: "Please provide a valid recipient email address.",
      });
    }

    if (!validText(subject) || !validText(body) || !scheduledAt) {
      return res.status(400).json({
        message: "Subject, body and scheduledAt are required.",
      });
    }

    const scheduledDate = new Date(scheduledAt);

    if (
      Number.isNaN(scheduledDate.getTime()) ||
      scheduledDate.getTime() <= Date.now()
    ) {
      return res.status(400).json({
        message: "Please choose a valid future date and time.",
      });
    }

    const lead = await Lead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({
        message: "Lead not found",
      });
    }

    lead.history.push({
      type: "FOLLOW_UP",
      subject: subject.trim(),
      body: body.trim(),
      recipientEmail,
      date: scheduledDate,
      scheduledAt: scheduledDate,
      status: "SCHEDULED",
    });

    syncNextFollowUp(lead);
    lead.status = "FOLLOW_UP_DUE";

    await lead.save();

    res.json({
      message: `Follow-up scheduled for ${recipientEmail}.`,
      lead: {
        ...lead.toObject(),
        id: lead._id.toString(),
      },
    });
  } catch (error) {
    console.error("Failed to schedule follow-up:", error);

    res.status(500).json({
      message: "Failed to schedule follow-up",
    });
  }
});

// ----------------------------------------------------
// EDIT SCHEDULED FOLLOW-UP
// ----------------------------------------------------

app.patch("/api/leads/:id/follow-up/scheduled", async (req, res) => {
  try {
    const {
      historyId,
      subject,
      body,
      scheduledAt,
    } = req.body;

    const recipientEmail = validateRecipientEmail(req.body.recipientEmail);

    if (!historyId || !validText(subject) || !validText(body) || !scheduledAt) {
      return res.status(400).json({
        message: "historyId, recipientEmail, subject, body and scheduledAt are required.",
      });
    }

    if (!recipientEmail) {
      return res.status(400).json({
        message: "Please provide a valid recipient email address.",
      });
    }

    const scheduledDate = new Date(scheduledAt);

    if (
      Number.isNaN(scheduledDate.getTime()) ||
      scheduledDate.getTime() <= Date.now()
    ) {
      return res.status(400).json({
        message: "Please choose a valid future date and time.",
      });
    }

    const lead = await Lead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({
        message: "Lead not found",
      });
    }

    const scheduledFollowUp = lead.history.id(historyId);

    if (!scheduledFollowUp) {
      return res.status(404).json({
        message: "Scheduled follow-up not found",
      });
    }

    if (
      scheduledFollowUp.type !== "FOLLOW_UP" ||
      scheduledFollowUp.status !== "SCHEDULED"
    ) {
      return res.status(400).json({
        message: "Only scheduled follow-ups can be updated.",
      });
    }

    scheduledFollowUp.recipientEmail = recipientEmail;
    scheduledFollowUp.subject = subject.trim();
    scheduledFollowUp.body = body.trim();
    scheduledFollowUp.date = scheduledDate;
    scheduledFollowUp.scheduledAt = scheduledDate;

    syncNextFollowUp(lead);
    lead.status = "FOLLOW_UP_DUE";

    await lead.save();

    res.json({
      message: "Scheduled follow-up updated.",
      lead: {
        ...lead.toObject(),
        id: lead._id.toString(),
      },
    });
  } catch (error) {
    console.error("Failed to update scheduled follow-up:", error);

    res.status(500).json({
      message: "Failed to update scheduled follow-up",
    });
  }
});

// ----------------------------------------------------
// CANCEL SCHEDULED FOLLOW-UP
// ----------------------------------------------------

app.delete("/api/leads/:id/follow-up/scheduled", async (req, res) => {
  try {
    const { historyId } = req.body;

    if (!historyId) {
      return res.status(400).json({
        message: "historyId is required",
      });
    }

    const lead = await Lead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({
        message: "Lead not found",
      });
    }

    const scheduledFollowUp = lead.history.id(historyId);

    if (!scheduledFollowUp) {
      return res.status(404).json({
        message: "Scheduled follow-up not found",
      });
    }

    if (
      scheduledFollowUp.type !== "FOLLOW_UP" ||
      scheduledFollowUp.status !== "SCHEDULED"
    ) {
      return res.status(400).json({
        message: "Only scheduled follow-ups can be cancelled.",
      });
    }

    scheduledFollowUp.status = "CANCELLED";
scheduledFollowUp.lastError = "Cancelled by user.";

    syncNextFollowUp(lead);

    const remainingScheduled = getScheduledFollowUps(lead);

    if (remainingScheduled.length > 0) {
      lead.status = "FOLLOW_UP_DUE";
    } else {
      lead.status = lead.history.length > 0
        ? "CONTACTED"
        : "NOT_CONTACTED";
      lead.nextFollowUp = null;
    }

    await lead.save();

    res.json({
      message: "Scheduled follow-up cancelled.",
      lead: {
        ...lead.toObject(),
        id: lead._id.toString(),
      },
    });
  } catch (error) {
    console.error("Failed to cancel scheduled follow-up:", error);

    res.status(500).json({
      message: "Failed to cancel scheduled follow-up",
    });
  }
});

// ----------------------------------------------------
// CONNECT DATABASE AND START SERVER
// ----------------------------------------------------

async function startServer() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("MongoDB connected successfully.");

    await seedDemoData();

    startFollowUpWorker();

    app.listen(PORT, () => {
      console.log(`API running on port ${PORT}`);
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
}

startServer();