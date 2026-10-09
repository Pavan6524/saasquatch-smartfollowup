# SaaSquatch Smart Follow-Up

Prototype enhancement inspired by the publicly accessible SaaSquatch lead-generation workflow.

> This project is a prototype enhancement inspired by the publicly accessible SaaSquatch lead-generation workflow. Due to the absence of access to the production SaaSquatch codebase/API, the implementation demonstrates the proposed integration through a self-contained lead-management interface.

## MVP
- SaaSquatch-style lead table
- Outreach status: Not Contacted, Contacted, Follow-up Due, Replied
- Outreach history
- Generate contextual follow-up draft
- Edit, send, or schedule follow-up
- Express API with demo in-memory data
- MongoDB-ready direction for production

## Run

### Backend
```bash
cd backend
npm install
npm run dev
```
API: http://localhost:5000

### Frontend
Open a second terminal:
```bash
cd frontend
npm install
npm run dev
```
Open the Vite URL, normally http://localhost:5173

## Scope
This prototype intentionally does not rebuild SaaSquatch scraping. It focuses on the follow-up workflow so the five-hour development window is spent on one complete, business-relevant feature.

## Production direction
Use MongoDB for persistence, Redis + a job queue for scheduled follow-ups, an email provider such as Resend/SendGrid/AWS SES, provider webhooks for reply detection, rate limits, retries, audit logs, and tenant-level authorization.
