import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import Lead from "./src/models/Lead.js";
import { Resend } from "resend";
import { startFollowUpWorker } from "./src/services/followUpWorker.js";

dotenv.config();
const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/saasquatch";


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
        body:
          "Hi Mike, I wanted to connect about a potential opportunity.",
        date: "2026-09-29T11:00:00Z",
        status: "SENT",
      },
      {
        type: "FOLLOW_UP",
        subject: "Following up",
        body:
          "Hi Mike, just following up on my previous note.",
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
    database: mongoose.connection.readyState === 1
      ? "connected"
      : "disconnected",
  });
});


// ----------------------------------------------------
// GET LEADS
// ----------------------------------------------------

app.get("/api/leads", async (req, res) => {
  try {
    const q = (req.query.q || "").toLowerCase();

    let leads;

    if (q) {
      leads = await Lead.find({
        $or: [
          { company: { $regex: q, $options: "i" } },
          { contact: { $regex: q, $options: "i" } },
          { email: { $regex: q, $options: "i" } },
          { industry: { $regex: q, $options: "i" } },
        ],
      }).sort({ createdAt: 1 });
    } else {
      leads = await Lead.find().sort({ createdAt: 1 });
    }

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
    console.error(error);

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
        `I know you may be busy, so I wanted to check whether this is something ` +
        `you would be open to discussing.\n\n` +
        `If it is relevant, I would be happy to find a convenient time for a quick conversation.\n\n` +
        `Best,\nPavan`,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to generate follow-up",
    });
  }
});


// ----------------------------------------------------
// SEND FOLLOW-UP
// ----------------------------------------------------

app.post("/api/leads/:id/follow-up/send", async (req, res) => {
  try {
    const { subject, body } = req.body;

    if (!subject || !body) {
      return res.status(400).json({
        message: "Subject and body are required",
      });
    }

    const lead = await Lead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({
        message: "Lead not found",
      });
    }

    // Send the actual email through Resend
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: [lead.email],
      subject,
      text: body,
    });

    // Resend rejected the email
    if (error) {
      console.error("Resend error:", error);

      return res.status(502).json({
        message: "Email could not be sent",
        error: error.message || "Resend rejected the request",
      });
    }

    // Only record SENT after Resend accepted the email
    const now = new Date();

    lead.history.push({
      type: "FOLLOW_UP",
      subject,
      body,
      date: now,
      status: "SENT",
      scheduledAt: null,
    });

   lead.lastContacted = now;

const scheduledFollowUps = lead.history
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

if (scheduledFollowUps.length > 0) {
  lead.status = "FOLLOW_UP_DUE";
  lead.nextFollowUp =
    scheduledFollowUps[0].scheduledAt ||
    scheduledFollowUps[0].date;
} else {
  lead.status = "CONTACTED";
  lead.nextFollowUp = null;
}

    await lead.save();

    res.json({
      message: "Follow-up email sent successfully",
      emailId: data?.id || null,
      lead: {
        ...lead.toObject(),
        id: lead._id.toString(),
      },
    });
  } catch (error) {
    console.error("Email sending failed:", error);

    res.status(500).json({
      message: "Failed to send follow-up email",
    });
  }
});


// ----------------------------------------------------
// SCHEDULE FOLLOW-UP
// ----------------------------------------------------

app.post("/api/leads/:id/follow-up/schedule", async (req, res) => {
  try {
    const { subject, body, scheduledAt } = req.body;

    if (!subject || !body || !scheduledAt) {
      return res.status(400).json({
        message: "Subject, body and scheduledAt are required",
      });
    }

    const scheduledDate = new Date(scheduledAt);

    if (Number.isNaN(scheduledDate.getTime())) {
      return res.status(400).json({
        message: "Invalid scheduledAt date",
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
      subject,
      body,
      date: scheduledDate,
      scheduledAt: scheduledDate,
      status: "SCHEDULED",
    });

    lead.status = "FOLLOW_UP_DUE";
    lead.nextFollowUp = scheduledDate;

    await lead.save();

    res.json({
      message: "Follow-up scheduled",
      lead: {
        ...lead.toObject(),
        id: lead._id.toString(),
      },
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to schedule follow-up",
    });
  }
});


// ----------------------------------------------------
// EDIT SCHEDULED FOLLOW-UP
// ----------------------------------------------------

app.patch(
  "/api/leads/:id/follow-up/scheduled",
  async (req, res) => {
    try {
      const {
        historyId,
        subject,
        body,
        scheduledAt,
      } = req.body;

      if (
        !historyId ||
        !subject ||
        !body ||
        !scheduledAt
      ) {
        return res.status(400).json({
          message:
            "historyId, subject, body and scheduledAt are required",
        });
      }

      const scheduledDate = new Date(scheduledAt);

      if (Number.isNaN(scheduledDate.getTime())) {
        return res.status(400).json({
          message: "Invalid scheduledAt date",
        });
      }

      const lead = await Lead.findById(req.params.id);

      if (!lead) {
        return res.status(404).json({
          message: "Lead not found",
        });
      }

      // Find the EXACT scheduled follow-up
      // using its MongoDB history subdocument ID.
      const scheduledFollowUp =
        lead.history.id(historyId);

      if (!scheduledFollowUp) {
        return res.status(404).json({
          message:
            "Scheduled follow-up not found",
        });
      }

      if (
        scheduledFollowUp.type !==
          "FOLLOW_UP" ||
        scheduledFollowUp.status !==
          "SCHEDULED"
      ) {
        return res.status(400).json({
          message:
            "Only scheduled follow-ups can be updated",
        });
      }

      // Update only this specific follow-up.
      scheduledFollowUp.subject = subject;
      scheduledFollowUp.body = body;
      scheduledFollowUp.date = scheduledDate;
      scheduledFollowUp.scheduledAt =
        scheduledDate;

      // Recalculate the next follow-up
      // based on all remaining scheduled follow-ups.
      syncNextFollowUp(lead);

      lead.status = "FOLLOW_UP_DUE";

      await lead.save();

      return res.json({
        message:
          "Scheduled follow-up updated",
        lead: {
          ...lead.toObject(),
          id: lead._id.toString(),
        },
      });
    } catch (error) {
      console.error(
        "Failed to update scheduled follow-up:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to update scheduled follow-up",
      });
    }
  }
);


// ----------------------------------------------------
// CANCEL SCHEDULED FOLLOW-UP
// ----------------------------------------------------

// ----------------------------------------------------
// CANCEL SCHEDULED FOLLOW-UP
// ----------------------------------------------------

app.delete(
  "/api/leads/:id/follow-up/scheduled",
  async (req, res) => {
    try {
      const { historyId } = req.body;

      if (!historyId) {
        return res.status(400).json({
          message: "historyId is required",
        });
      }

      const lead = await Lead.findById(
        req.params.id
      );

      if (!lead) {
        return res.status(404).json({
          message: "Lead not found",
        });
      }

      // Find the EXACT history item.
      const scheduledFollowUp =
        lead.history.id(historyId);

      if (!scheduledFollowUp) {
        return res.status(404).json({
          message:
            "Scheduled follow-up not found",
        });
      }

      if (
        scheduledFollowUp.type !==
          "FOLLOW_UP" ||
        scheduledFollowUp.status !==
          "SCHEDULED"
      ) {
        return res.status(400).json({
          message:
            "Only scheduled follow-ups can be cancelled",
        });
      }

      // Remove only the selected follow-up.
      scheduledFollowUp.deleteOne();

      // Recalculate the next scheduled follow-up.
      syncNextFollowUp(lead);

      const remainingScheduled =
        lead.history.filter(
          (item) =>
            item.type === "FOLLOW_UP" &&
            item.status === "SCHEDULED"
        );

      if (remainingScheduled.length > 0) {
        lead.status = "FOLLOW_UP_DUE";
      } else {
        /*
          If there are no scheduled follow-ups left,
          keep the lead as CONTACTED if there is
          previous outreach.
        */
        const hasPreviousOutreach =
          lead.history.length > 0;

        lead.status = hasPreviousOutreach
          ? "CONTACTED"
          : "NOT_CONTACTED";

        lead.nextFollowUp = null;
      }

      await lead.save();

      return res.json({
        message:
          "Scheduled follow-up cancelled",
        lead: {
          ...lead.toObject(),
          id: lead._id.toString(),
        },
      });
    } catch (error) {
      console.error(
        "Failed to cancel scheduled follow-up:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to cancel scheduled follow-up",
      });
    }
  }
);

// ----------------------------------------------------
// CONNECT DATABASE + START SERVER
// ----------------------------------------------------

async function startServer() {
  try {
   await mongoose.connect(MONGODB_URI);

console.log("MongoDB connected successfully.");

await seedDemoData();

startFollowUpWorker();

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
  } catch (error) {
    console.error("MongoDB connection failed:");
    console.error(error);
    process.exit(1);
  }
}

startServer();