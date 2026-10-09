import mongoose from "mongoose";

const outreachSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["INITIAL", "FOLLOW_UP"],
      required: true,
    },

    subject: {
      type: String,
      required: true,
    },

    body: {
      type: String,
      required: true,
    },

    date: {
      type: Date,
      required: true,
    },

   status: {
  type: String,
  enum: ["SENT", "SCHEDULED", "FAILED"],
  default: "SCHEDULED",
},

attempts: {
  type: Number,
  default: 0,
},

lastError: {
  type: String,
  default: null,
},

    scheduledAt: {
      type: Date,
      default: null,
    },

    sentAt: {
      type: Date,
      default: null,
    },
  },
  { _id: true }
);

const leadSchema = new mongoose.Schema(
  {
    company: {
      type: String,
      required: true,
    },
    contact: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      default: "",
    },
    email: {
      type: String,
      required: true,
    },
    industry: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: [
        "NOT_CONTACTED",
        "CONTACTED",
        "FOLLOW_UP_DUE",
        "REPLIED",
      ],
      default: "NOT_CONTACTED",
    },
    lastContacted: {
      type: Date,
      default: null,
    },
    nextFollowUp: {
      type: Date,
      default: null,
    },
    history: {
      type: [outreachSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const Lead = mongoose.model("Lead", leadSchema);

export default Lead;