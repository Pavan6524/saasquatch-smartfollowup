# SaaSquatch Smart Follow-Up

Prototype enhancement inspired by the publicly accessible SaaSquatch lead-generation workflow.

> This project is a prototype enhancement inspired by the publicly accessible SaaSquatch lead-generation workflow. Due to the absence of access to the production SaaSquatch codebase/API, the implementation demonstrates the proposed integration through a self-contained lead-management interface.

## MVP
- SaaSquatch-style lead table
- Outreach status: Not Contacted, Contacted, Follow-up Due, Replied
- Outreach history with scheduled, sent, failed, and cancelled statuses
- Generate contextual follow-up drafts
- Edit follow-up email content and recipient
- Send follow-up emails using Nodemailer and Gmail SMTP
- Schedule, edit, and cancel follow-ups
- Express REST API with MongoDB persistence
- Background worker that checks for due follow-ups every 10 seconds
- React and Vite frontend
- Deployed frontend on Vercel and backend on Render

## Run

### Backend
```bash
cd backend
npm install
npm run dev
```

API: http://localhost:5000

Configure the required environment variables in `backend/.env`, including your MongoDB connection string and Gmail SMTP credentials. Never commit `.env` or expose email passwords and database credentials.

### Frontend
Open a second terminal:
```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL, normally http://localhost:5173.

## Scope
This prototype intentionally does not rebuild SaaSquatch scraping. It focuses on the follow-up workflow so the five-hour development window is spent on one complete, business-relevant feature.

## Production direction
The current implementation uses MongoDB for persistence, Nodemailer with Gmail SMTP for email delivery, and a background worker for scheduled follow-ups.

For a more scalable production environment, future improvements could include Redis and a dedicated job queue, an email provider with a supported HTTPS API such as Resend/SendGrid/AWS SES, provider webhooks for delivery and reply detection, rate limits, retry handling, audit logs, monitoring, and tenant-level authorization.