import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { createRoot } from "react-dom/client";
import "./style.css";

const API = "https://saasquatch-smartfollowup.onrender.com/api";


const apiRequest = async (
  url,
  options = {}
) => {
  try {
    const response = await fetch(
      url,
      options
    );

    let data = {};

    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(
        data.message ||
          `Request failed with status ${response.status}`
      );
    }

    return data;
  } catch (error) {
    if (
      error instanceof TypeError
    ) {
      throw new Error(
        "Unable to connect to the server. Please make sure the backend is running."
      );
    }

    throw error;
  }
};
const EMAIL_TEMPLATES = [
  {
    id: "gentle-reminder",
    name: "Gentle Reminder",
    description: "A polite and simple follow-up",
    subject: "Following up on our conversation",
    body: (lead) =>
      `Hi ${lead.contact},

I wanted to follow up on my previous message regarding ${lead.company}.

I know things can get busy, so I wanted to check whether this is something you would be open to discussing.

Looking forward to hearing from you.

Best regards`,
  },

  {
    id: "value-follow-up",
    name: "Value Follow-up",
    description: "Focus on the value you can provide",
    subject: (lead) =>
      `A quick idea for ${lead.company}`,
    body: (lead) =>
      `Hi ${lead.contact},

I wanted to follow up because I believe there may be an opportunity to help ${lead.company} improve its current workflow and achieve better results.

I would be happy to share a few ideas based on what we have seen work for similar teams.

Would you be open to a quick conversation?

Best regards`,
  },

  {
    id: "meeting-request",
    name: "Meeting Request",
    description: "Ask for a short meeting",
    subject: "Would you be open to a quick call?",
    body: (lead) =>
      `Hi ${lead.contact},

I wanted to follow up on my previous message.

Would you be available for a quick 15-minute call sometime this week? I would love to understand your current priorities at ${lead.company} and see if there is a good fit.

Please let me know what time works best for you.

Best regards`,
  },

  {
    id: "checking-in",
    name: "Checking In",
    description: "Short and conversational",
    subject: "Just checking in",
    body: (lead) =>
      `Hi ${lead.contact},

Just checking in to see if you had a chance to review my previous message.

Happy to answer any questions or provide additional information if helpful.

Thanks, and I look forward to hearing from you.

Best regards`,
  },

  {
    id: "final-follow-up",
    name: "Final Follow-up",
    description: "A polite final outreach",
    subject: "Closing the loop",
    body: (lead) =>
      `Hi ${lead.contact},

I wanted to send one final follow-up regarding my previous messages.

I completely understand if this is not a priority right now. If the timing becomes better in the future, I would be happy to reconnect.

Thanks for your time, and all the best.

Best regards`,
  },
];

const fmt = (v) =>
  v
    ? new Date(v).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

function App() {
  const [leads, setLeads] = useState([]);
  const [q, setQ] = useState("");

  const [selected, setSelected] = useState(null);

  const [draft, setDraft] = useState(null);

  const [recipientEmail, setRecipientEmail] = useState("");
const [subject, setSubject] = useState("");
const [body, setBody] = useState("");
const [schedule, setSchedule] = useState("");

  const [busy, setBusy] = useState(false);
const [busyAction, setBusyAction] = useState("");
const [loading, setLoading] = useState(true);
const [msg, setMsg] = useState("");
const [msgType, setMsgType] = useState("");
  const applyTemplate = (template) => {
  if (!selected) return;

  const templateSubject =
    typeof template.subject === "function"
      ? template.subject(selected)
      : template.subject;

  const templateBody =
    typeof template.body === "function"
      ? template.body(selected)
      : template.body;

  setSubject(templateSubject);
  setBody(templateBody);

  setDraft({
    subject: templateSubject,
    body: templateBody,
  });

  setEditMode(null);
};

  /*
    editMode:

    null       = normal new follow-up
    "email"    = editing scheduled email
    "schedule" = editing scheduled date/time
  */
  const [editMode, setEditMode] = useState(null);
  const [editingHistoryId, setEditingHistoryId] = useState(null);

  /*
    Refs for automatic scrolling/focus
  */
  const composerRef = useRef(null);
  const subjectInputRef = useRef(null);
  const scheduleInputRef = useRef(null);

  // ----------------------------------------------------
// LOAD LEADS
// ----------------------------------------------------
const load = async () => {
  try {
    const data = await apiRequest(
      `${API}/leads?q=${encodeURIComponent(q)}`
    );

    setLeads(data);
  } catch (error) {
    console.error(
      "Failed to load leads:",
      error
    );

    setMsg(error.message);
    setMsgType("error");
  } finally {
    setLoading(false);
  }
};




useEffect(() => {
  const timer = setTimeout(() => {
    load();
  }, 300);

  return () => clearTimeout(timer);
}, [q]);
// ----------------------------------------------------
// STATS
// ----------------------------------------------------

const stats = useMemo(
  () => ({
    total: leads.length,

    due: leads.filter(
      (x) => x.status === "FOLLOW_UP_DUE"
    ).length,

    contacted: leads.filter(
      (x) => x.status === "CONTACTED"
    ).length,

    replied: leads.filter(
      (x) => x.status === "REPLIED"
    ).length,
  }),
  [leads]
);

// ----------------------------------------------------
// FOLLOW-UP ANALYTICS
// ----------------------------------------------------

const analytics = useMemo(() => {
  const history = leads.flatMap(
    (lead) => lead.history || []
  );

  const followUps = history.filter(
    (item) => item.type === "FOLLOW_UP"
  );

  const sent = followUps.filter(
    (item) => item.status === "SENT"
  ).length;

  const scheduled = followUps.filter(
    (item) => item.status === "SCHEDULED"
  ).length;

  const failed = followUps.filter(
    (item) => item.status === "FAILED"
  ).length;

  const total = followUps.length;

  const average =
    leads.length > 0
      ? (total / leads.length).toFixed(1)
      : "0.0";

  return {
    total,
    sent,
    scheduled,
    failed,
    average,
  };
}, [leads]);

// ----------------------------------------------------
// OPEN LEAD
// ----------------------------------------------------

const open = (lead) => {
  setSelected(lead);
  setRecipientEmail(lead.email || "");
  setDraft(null);
  setSubject("");
  setBody("");
  setSchedule("");
  setEditMode(null);
  setEditingHistoryId(null);
  setMsg("");
};

  // ----------------------------------------------------
  // AUTOMATIC SCROLL WHEN EDITING
  // ----------------------------------------------------

  useEffect(() => {
    if (!editMode) return;

    /*
      Wait until React has rendered the editing state,
      then smoothly move the user to the composer.
    */
    const timer = setTimeout(() => {
      if (composerRef.current) {
        composerRef.current.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }

      /*
        Automatically focus the relevant field.
      */
      if (
        editMode === "email" &&
        subjectInputRef.current
      ) {
        subjectInputRef.current.focus();
      }

      if (
        editMode === "schedule" &&
        scheduleInputRef.current
      ) {
        scheduleInputRef.current.focus();
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [editMode]);

  // ----------------------------------------------------
  // GENERATE FOLLOW-UP
  // ----------------------------------------------------

  const generate = async () => {
  if (!selected) return;

  setBusy(true);
  setBusyAction("generate");
  setMsg("");
  setMsgType("");

  try {
    const d = await apiRequest(
      `${API}/leads/${selected.id}/follow-up/generate`,
      {
        method: "POST",
      }
    );

    setDraft(d);
    setSubject(d.subject || "");
    setBody(d.body || "");
    setSchedule("");

    setEditMode(null);
    setEditingHistoryId(null);

    setMsg(
      "Follow-up generated successfully."
    );
    setMsgType("success");
  } catch (error) {
    console.error(
      "Failed to generate follow-up:",
      error
    );

    setMsg(
      error.message ||
        "Failed to generate follow-up."
    );
    setMsgType("error");
  } finally {
    setBusy(false);
    setBusyAction("");
  }
};

  // ----------------------------------------------------
  // SEND FOLLOW-UP
  // ----------------------------------------------------

  const send = async () => {
if (
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    recipientEmail.trim()
  )
) {
  setMsg("Please enter a valid recipient email address.");
  setMsgType("error");
  return;
}
  if (!selected) return;

  if (!subject.trim() || !body.trim()) {
    setMsg(
      "Please enter a subject and message before sending."
    );
    setMsgType("error");
    return;
  }
setBusy(true);
  setBusyAction("send");
  setMsg("");
  setMsgType("");

  try {
    const r = await apiRequest(
      `${API}/leads/${selected.id}/follow-up/send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
       body: JSON.stringify({
  recipientEmail: recipientEmail.trim(),
  subject,
  body,
}),
      }
    );

    setMsg(
      r.message ||
        "Follow-up sent successfully."
    );
    setMsgType("success");

    setSelected(null);
    setDraft(null);
    setEditMode(null);
    setEditingHistoryId(null);

    await load();
  } catch (error) {
    console.error(
      "Failed to send follow-up:",
      error
    );
setMsg(
      error.message ||
        "Failed to send follow-up."
    );
    setMsgType("error");
  } finally {
    setBusy(false);
    setBusyAction("");
  }
};

  // ----------------------------------------------------
  // SCHEDULE NEW FOLLOW-UP
  // ----------------------------------------------------

  const sched = async () => {
    if (
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    recipientEmail.trim()
  )
) {
  setMsg("Please enter a valid recipient email address.");
  setMsgType("error");
  return;
}
if (!selected) return;

  if (!subject.trim() || !body.trim()) {
    setMsg(
      "Please enter a subject and message before scheduling."
    );
    setMsgType("error");
    return;
  }

  if (!schedule) {
    setMsg(
      "Please select a date and time for the follow-up."
    );
    setMsgType("error");
    return;
  }

  const scheduledDate = new Date(
    schedule
  );

  if (
    Number.isNaN(
      scheduledDate.getTime()
    )
  ) {
    setMsg(
      "Please select a valid schedule date and time."
    );
    setMsgType("error");
    return;
  }

  if (
    scheduledDate.getTime() <=
    Date.now()
  ) {
    setMsg(
      "Please choose a future date and time."
    );
    setMsgType("error");
    return;
  }

  setBusy(true);
  setBusyAction("schedule");
  setMsg("");
  setMsgType("");

  try {
    const r = await apiRequest(
      `${API}/leads/${selected.id}/follow-up/schedule`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
  recipientEmail: recipientEmail.trim(),
  subject,
  body,
  scheduledAt: scheduledDate.toISOString(),
}),
      }
    );

    setMsg(
      r.message ||
        "Follow-up scheduled successfully."
    );
    setMsgType("success");

    setSelected(null);
    setDraft(null);
    setEditMode(null);
    setEditingHistoryId(null);

    await load();
  } catch (error) {
    console.error(
      "Failed to schedule follow-up:",
      error
    );

    setMsg(
      error.message ||
        "Failed to schedule follow-up."
    );
    setMsgType("error");
  } finally {
    setBusy(false);
    setBusyAction("");
  }
};

  // ----------------------------------------------------
  // START EDITING SCHEDULED FOLLOW-UP
  // ----------------------------------------------------

  const editScheduled = (item, mode) => {
    setSubject(item.subject || "");
    setBody(item.body || "");
    setRecipientEmail(
  item.recipientEmail || selected?.email || ""
);

    /*
      Store the exact MongoDB history subdocument ID.
      This allows us to edit the correct scheduled
      follow-up when multiple follow-ups exist.
    */
    setEditingHistoryId(item._id);

    const scheduledDate =
      item.scheduledAt || item.date;

    if (scheduledDate) {
      const date = new Date(scheduledDate);

      const offset = date.getTimezoneOffset();

      const localDate = new Date(
        date.getTime() - offset * 60000
      );

      setSchedule(
        localDate
          .toISOString()
          .slice(0, 16)
      );
    } else {
      setSchedule("");
    }

    setEditMode(mode);
  };

  // ----------------------------------------------------
  // UPDATE SCHEDULED FOLLOW-UP
  // ----------------------------------------------------

  const updateScheduled = async () => {
    if (!selected || !editingHistoryId) {
      return;
    }

    if (!recipientEmail.trim()) {
      setMsg("Recipient email is required.");
      setMsgType("error");
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(recipientEmail.trim())) {
      setMsg("Please enter a valid recipient email address.");
      setMsgType("error");
      return;
    }

    if (!subject.trim()) {
      setMsg("Subject is required.");
      setMsgType("error");
      return;
    }

    if (!body.trim()) {
      setMsg("Message is required.");
      setMsgType("error");
      return;
    }

    if (!schedule) {
      setMsg("Schedule date and time are required.");
      setMsgType("error");
      return;
    }

    const scheduledDate = new Date(schedule);

    if (
      Number.isNaN(scheduledDate.getTime()) ||
      scheduledDate.getTime() <= Date.now()
    ) {
      setMsg("Please choose a valid future date and time.");
      setMsgType("error");
      return;
    }

    setBusy(true);
    setBusyAction("update");
    setMsg("");
    setMsgType("");

    try {
      const r = await apiRequest(
        `${API}/leads/${selected.id}/follow-up/scheduled`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            historyId: editingHistoryId,
            recipientEmail: recipientEmail.trim(),
            subject: subject.trim(),
            body: body.trim(),
            scheduledAt: scheduledDate.toISOString(),
          }),
        }
      );

      setMsg(
        r.message || "Scheduled follow-up updated successfully."
      );
      setMsgType("success");

      // Refresh the leads list after the backend confirms the update.
      await load();

      setSelected(null);
      setDraft(null);
      setEditMode(null);
      setEditingHistoryId(null);
    } catch (error) {
      console.error(
        "Failed to update scheduled follow-up:",
        error
      );

      setMsg(
        error.message || "Failed to update scheduled follow-up."
      );
      setMsgType("error");
    } finally {
      setBusy(false);
      setBusyAction("");
    }
  };


  // ----------------------------------------------------
  // CANCEL SCHEDULED FOLLOW-UP
  // ----------------------------------------------------

  const cancelScheduled = async (
  historyId
) => {
  if (!selected || !historyId) {
    return;
  }

  const confirmed =
    window.confirm(
      "Are you sure you want to cancel this scheduled follow-up?"
    );

  if (!confirmed) return;

  setBusy(true);
  setBusyAction("cancel");
  setMsg("");
  setMsgType("");

  try {
    const r = await apiRequest(
      `${API}/leads/${selected.id}/follow-up/scheduled`,
      {
        method: "DELETE",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          historyId,
        }),
      }
    );

    setMsg(
      r.message ||
        "Scheduled follow-up cancelled successfully."
    );
    setMsgType("success");

    setSelected(null);
    setDraft(null);
    setEditMode(null);
    setEditingHistoryId(null);

    await load();
  } catch (error) {
    console.error(
      "Failed to cancel scheduled follow-up:",
      error
    );

    setMsg(
      error.message ||
        "Failed to cancel scheduled follow-up."
    );
    setMsgType("error");
  } finally {
    setBusy(false);
    setBusyAction("");
  }
};

  // ----------------------------------------------------
  // CLEAR EDIT MODE
  // ----------------------------------------------------

  const clearEditMode = () => {
    setEditMode(null);
    setEditingHistoryId(null);
    setSubject("");
    setBody("");
    setSchedule("");
  };

  // ----------------------------------------------------
  // RENDER
  // ----------------------------------------------------

  return (
    <>
      <header>
        <div>
          <b>SaaSquatch</b>
          <small>Lead Intelligence</small>
        </div>

        <span>
          Smart Follow-Up Prototype
        </span>
      </header>

      <main>
        <p className="eyebrow">
          SAASQUATCH-STYLE LEADS
        </p>

   <h1>
  Turn discovered leads into managed conversations.
</h1>

        <p className="sub">
          Track outreach, identify follow-up
          opportunities, and create the next
          message without leaving the lead
          workflow.
        </p>

        {/* ------------------------------------------
            STATS
        ------------------------------------------ */}

        <div className="dashboard-overview">

  <section className="stats">
    {[
      ["Total Leads", stats.total],
      ["Follow-ups Due", stats.due],
      ["Contacted", stats.contacted],
      ["Replied", stats.replied],
    ].map((x) => (
      <div key={x[0]}>
        <small>{x[0]}</small>
        <strong>{x[1]}</strong>
      </div>
    ))}
  </section>

  <section className="analytics">
    <div className="analytics-heading">
      <div>
        <p className="eyebrow">FOLLOW-UP ANALYTICS</p>
        <h2>Outreach performance</h2>
        <p>
          Track how your follow-ups are progressing across all leads.
        </p>
      </div>

      <div className="analytics-average">
        <span>Avg. follow-ups / lead</span>
        <strong>
          {analytics.total > 0
            ? (analytics.total / stats.total).toFixed(1)
            : "0.0"}
        </strong>
      </div>
    </div>

    <div className="analytics-cards">
      <div className="analytics-card">
        <span>Total Follow-ups</span>
        <strong>{analytics.total}</strong>
      </div>

      <div className="analytics-card">
        <span>Sent</span>
        <strong>{analytics.sent}</strong>
      </div>

      <div className="analytics-card">
        <span>Scheduled</span>
        <strong>{analytics.scheduled}</strong>
      </div>

      <div className="analytics-card">
        <span>Failed</span>
        <strong>{analytics.failed}</strong>
      </div>
    </div>

    <div className="analytics-bars">

      <div className="bar-row">
        <span>Sent</span>

        <div className="bar-track">
          <div
            className="bar-fill sent"
            style={{
              width: `${
                analytics.total
                  ? (analytics.sent / analytics.total) * 100
                  : 0
              }%`,
            }}
          />
        </div>

        <strong>{analytics.sent}</strong>
      </div>

      <div className="bar-row">
        <span>Scheduled</span>

        <div className="bar-track">
          <div
            className="bar-fill scheduled"
            style={{
              width: `${
                analytics.total
                  ? (analytics.scheduled / analytics.total) * 100
                  : 0
              }%`,
            }}
          />
        </div>

        <strong>{analytics.scheduled}</strong>
      </div>

      <div className="bar-row">
        <span>Failed</span>

        <div className="bar-track">
          <div
            className="bar-fill failed"
            style={{
              width: `${
                analytics.total
                  ? (analytics.failed / analytics.total) * 100
                  : 0
              }%`,
            }}
          />
        </div>

        <strong>{analytics.failed}</strong>
      </div>

    </div>
  </section>

</div>
        
{/* ------------------------------------------
    SEARCH
------------------------------------------ */}

<div className="toolbar">
  <input
    id="lead-search"
    name="leadSearch"
    type="search"
    placeholder="Search company, contact, industry..."
    value={q}
    onChange={(e) => setQ(e.target.value)}
    onKeyDown={(e) =>
      e.key === "Enter" && load()
    }
  />

  <button onClick={load}>
    Search
  </button>
</div>
<div className="leads-table-container">
  {/* Keep your existing leads table here */}
</div>

        {/* ------------------------------------------
            MESSAGE
        ------------------------------------------ */}

       {msg && (
  <div
    className={`notice ${
      msgType === "error"
        ? "notice-error"
        : msgType === "success"
        ? "notice-success"
        : ""
    }`}
  >
    <span>
      {msgType === "error"
        ? "✕"
        : msgType === "success"
        ? "✓"
        : "i"}
    </span>

    <p>{msg}</p>

    <button
      type="button"
      onClick={() => {
        setMsg("");
        setMsgType("");
      }}
      aria-label="Dismiss notification"
    >
      ×
    </button>
  </div>
)}

        {/* ------------------------------------------
            LEADS TABLE
        ------------------------------------------ */}

        <section className="table">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Contact</th>
                <th>Industry</th>
                <th>Status</th>
                <th>Last Contacted</th>
                <th>Next Follow-up</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
  {loading ? (
    <tr>
      <td
        colSpan="7"
        className="table-loading"
      >
        <div className="loading-spinner" />
        <span>
          Loading leads...
        </span>
      </td>
    </tr>
  ) : leads.length === 0 ? (
    <tr>
      <td
        colSpan="7"
        className="table-empty"
      >
        <strong>
          No leads found
        </strong>

        <span>
          Try a different search or check
          your lead data.
        </span>
      </td>
    </tr>
  ) : (
    leads.map((l) => (
                <tr key={l.id}>
                  <td>
                    <b>{l.company}</b>
                    <small>{l.email}</small>
                  </td>

                  <td>
                    {l.contact}
                    <small>{l.title}</small>
                  </td>

                  <td>
                    {l.industry}
                  </td>

                  <td>
                    <em
                      className={l.status}
                    >
                      {l.status.replaceAll(
                        "_",
                        " "
                      )}
                    </em>
                  </td>

                  <td>
                    {fmt(l.lastContacted)}
                  </td>

                  <td>
                    {l.nextFollowUps?.length ? (
                      <div className="followup-list">
                        {l.nextFollowUps.map(
                          (item, index) => (
                            <div
                              className="next-followup"
                              key={`${item.date}-${index}`}
                            >
                              <strong>
                                Follow-up #
                                {index + 1}
                              </strong>

                              <span>
                                {fmt(item.date)}
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>

                  <td>
                    {l.status ===
                    "REPLIED" ? (
                      <small>
                        Conversation active
                      </small>
                    ) : (
                      <button
                        onClick={() =>
                          open(l)
                        }
                      >
                        {l.status ===
                        "NOT_CONTACTED"
                          ? "Send Email"
                          : "Follow Up"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
            </tbody>
          </table>
        </section>
      </main>

      {/* ------------------------------------------
          FOLLOW-UP MODAL
      ------------------------------------------ */}

      {selected && (
        <div className="backdrop">
          <aside>
            <button
              className="close"
              onClick={() =>
                setSelected(null)
              }
            >
              ×
            </button>

            <p className="eyebrow">
              SMART FOLLOW-UP
            </p>

            <h2>
              {selected.contact}
            </h2>

            <p>
              {selected.company} ·{" "}
              {selected.email}
            </p>

            {/* --------------------------------------
                OUTREACH HISTORY
            -------------------------------------- */}

            <h3>
              Outreach History
            </h3>

            <div className="history">
              {selected.history.map(
                (h, index) => {
                  const isInitial =
                    h.type === "INITIAL";

                  const followUpNumber =
                    selected.history
                      .slice(0, index + 1)
                      .filter(
                        (item) =>
                          item.type ===
                          "FOLLOW_UP"
                      ).length;

                  const isScheduled =
                    h.status ===
                    "SCHEDULED";

                  const isSent =
                    h.status === "SENT";
                    const isFailed = h.status === "FAILED";
const isCancelled = h.status === "CANCELLED";

                  return (
                    <article
                      key={
                        h._id ||
                        h.id ||
                        index
                      }
                      className={
                        isScheduled
                          ? "scheduled-history"
                          : ""
                      }
                    >
                      <b>
                        {isInitial
                          ? "Initial email"
                          : `Follow-up #${followUpNumber}`}
                      </b>

                      <small>
                        {fmt(
                          h.scheduledAt ||
                            h.date
                        )}
                      </small>
                        {/* STATUS */}
                        {isSent && (
                        <span className="history-status sent-status">
                          ✓ SENT
                        </span>
                      )}             {isScheduled && (
  <span className="history-status scheduled-status">
    ⏰ SCHEDULED
  </span>
)}

{isFailed && (
  <span className="history-status failed-status">
    ✕ FAILED
  </span>
)}
{isFailed && h.lastError && (
  <p className="history-error">
    Reason: {h.lastError}
  </p>
)}
{isCancelled && (
  <span className="history-status cancelled-status">
    CANCELLED
  </span>
)}

<strong>
  {h.subject}
</strong>


                      <p>
                        {h.body}
                      </p>

                      {/* SCHEDULED ACTIONS */}

                      {isScheduled && (
                        <div className="history-actions">
                          <button
                            className="small-action"
                            onClick={() =>
                              editScheduled(
                                h,
                                "email"
                              )
                            }
                            disabled={busy}
                          >
                            Edit Email
                          </button>

                          <button
                            className="small-action"
                            onClick={() =>
                              editScheduled(
                                h,
                                "schedule"
                              )
                            }
                            disabled={busy}
                          >
                            Edit Schedule
                          </button>

                          <button
                            className="small-action danger"
                            onClick={() =>
                              cancelScheduled(
                                h._id
                              )
                            }
                            disabled={busy}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </article>
                  );
                }
              )}
            </div>

            {/* --------------------------------------
                COMPOSER
            -------------------------------------- */}

            <div
              ref={composerRef}
              className={`composer ${
                editMode
                  ? "editing"
                  : ""
              }`}
            >
              <div className="row">
                <h3>
                  {editMode
                    ? editMode === "email"
                      ? "Edit Follow-up Email"
                      : "Edit Follow-up Schedule"
                    : "Follow-up message"}
                </h3>

                {!editMode && (
                 <button
  onClick={generate}
  disabled={busy}
>
  {busyAction === "generate"
    ? "Generating..."
    : "Generate Follow-up"}
</button>
                )}
              </div>
              {!editMode && (
  <div className="template-section">
    <div className="template-header">
      <div>
        <strong>Email Templates</strong>
        <small>
          Start with a template or generate an AI follow-up.
        </small>
      </div>
    </div>

    <div className="template-grid">
      {EMAIL_TEMPLATES.map((template) => (
        <button
          key={template.id}
          type="button"
          className="template-card"
          onClick={() =>
            applyTemplate(template)
          }
          disabled={busy}
        >
          <strong>{template.name}</strong>

          <span>
            {template.description}
          </span>
        </button>
      ))}
    </div>
  </div>
)}

              {/* ------------------------------------
                  EDITING INDICATOR
              ------------------------------------ */}

              {editMode && (
                <div className="editing-notice">
                  {editMode === "email"
                    ? "Editing the email content for this scheduled follow-up."
                    : "Editing the schedule for this scheduled follow-up."}
                </div>
              )}
              {/* RECIPIENT EMAIL */}
<label htmlFor="follow-up-recipient">
  Recipient email{" "}
  <span
    style={{
      fontSize: "11px",
      fontWeight: 400,
      color: "#7b8495",
    }}
  >
    (For testing: enter your own email to receive the follow-up in real time.)
  </span>
</label>

<input
  id="follow-up-recipient"
  name="recipientEmail"
  type="email"
  autoComplete="email"
  required
  value={recipientEmail}
  onChange={(e) => setRecipientEmail(e.target.value)}
  disabled={editMode === "schedule" || busy}
  placeholder="name@company.com"
/>

<small>
  Enter an inbox you can access. Email delivery depends on your provider's sender verification rules.
</small>

{/* SUBJECT */}

<label>
  Subject
</label>

<input
  ref={subjectInputRef}
  value={subject}
  onChange={(e) =>
    setSubject(e.target.value)
  }
  disabled={
    editMode === "schedule"
  }
/>


              {/* MESSAGE */}

              <label>
                Message
              </label>

              <textarea
                rows="8"
                value={body}
                onChange={(e) =>
                  setBody(
                    e.target.value
                  )
                }
                disabled={
                  editMode ===
                  "schedule"
                }
              />

              {/* SCHEDULE */}

              <label>
                Schedule
              </label>

              <input
                ref={scheduleInputRef}
                type="datetime-local"
                value={schedule}
                onChange={(e) =>
                  setSchedule(
                    e.target.value
                  )
                }
                disabled={
                  editMode === "email"
                }
              />
{/* ACTIONS */}

<div className="actions">
  {editMode ? (
    <>
      <button
        type="button"
        onClick={clearEditMode}
        disabled={busy}
      >
        Cancel
      </button>

      <button
        type="button"
        className="primary"
        onClick={updateScheduled}
        disabled={
          !subject.trim() ||
          !body.trim() ||
          !schedule ||
          busy
        }
      >
        {busyAction === "update"
          ? "Updating..."
          : "Save Changes"}
      </button>
    </>
  ) : (
    <>
      <button
        type="button"
        onClick={sched}
        disabled={
          !subject.trim() ||
          !body.trim() ||
          !schedule ||
          busy
        }
      >
        {busyAction === "schedule"
          ? "Scheduling..."
          : "Schedule"}
      </button>

      <button
        type="button"
        className="primary"
        onClick={send}
        disabled={
          !subject.trim() ||
          !body.trim() ||
          busy
        }
      >
        {busyAction === "send"
          ? "Sending..."
          : "Send Follow-up"}
      </button>
    </>
  )}
</div>

</div>
</aside>
</div>
)}

</>
);

}

createRoot(
  document.getElementById("root")
).render(<App />);