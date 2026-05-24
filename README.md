# VVCE Events Hub — Backend API

Full-stack backend for the VVCE Events Hub platform built with **Node.js**, **Express**, and **PostgreSQL**.

---

## Tech Stack

| Layer       | Technology                         |
|-------------|-------------------------------------|
| Runtime     | Node.js 18+                        |
| Framework   | Express.js 4.x                     |
| Database    | PostgreSQL 14+                     |
| Auth        | JWT (jsonwebtoken) + bcryptjs      |
| Email       | Nodemailer (SMTP / Gmail)          |
| File Upload | Multer (disk storage)              |
| Validation  | express-validator                  |
| Security    | Helmet, CORS, express-rate-limit   |
| Deployment  | Render (backend) + Vercel (frontend)|

---

## Folder Structure

```
vvce-backend/
├── src/
│   ├── config/
│   │   ├── database.js       # PostgreSQL pool
│   │   └── email.js          # Nodemailer transporter
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── eventController.js
│   │   ├── registrationController.js
│   │   ├── paymentController.js
│   │   ├── certificateController.js
│   │   ├── attendanceController.js
│   │   ├── notificationController.js
│   │   └── userController.js
│   ├── middleware/
│   │   ├── auth.js           # JWT authenticate + authorize
│   │   ├── validate.js       # express-validator error handler
│   │   ├── upload.js         # Multer poster/cert upload
│   │   └── errorHandler.js   # Global error + 404 handler
│   ├── routes/
│   │   └── index.js          # All routes mounted here
│   └── utils/
│       └── emailTemplates.js # HTML email templates
├── migrations/
│   ├── schema.sql            # Full DB schema
│   ├── run.js                # Migration runner
│   └── seed.js               # Dev seed data
├── uploads/                  # Uploaded files (gitignored)
├── .env.example
├── package.json
└── README.md
```

---

## Quick Start (Local Development)

### 1. Prerequisites
- Node.js 18+
- PostgreSQL 14+
- A Gmail account with App Password enabled (for emails)

### 2. Clone & Install

```bash
git clone <your-repo>
cd vvce-backend
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```env
PORT=5000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=vvce_events
DB_USER=postgres
DB_PASSWORD=your_password

JWT_SECRET=your_super_secret_minimum_32_chars_here
JWT_EXPIRES_IN=7d

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_gmail_app_password

FROM_EMAIL=noreply@vvce.ac.in
FROM_NAME=VVCE Events Hub

FRONTEND_URL=http://localhost:3000
```

### 4. Create PostgreSQL Database

```bash
psql -U postgres
CREATE DATABASE vvce_events;
\q
```

### 5. Run Migrations

```bash
npm run migrate
```

### 6. Seed Sample Data (optional)

```bash
npm run seed
```

This creates sample users with password `Password@123`:

| Role      | Email                        |
|-----------|------------------------------|
| Student   | rahul.sharma@vvce.ac.in      |
| Student   | priya.nair@vvce.ac.in        |
| Admin     | cseclub@vvce.ac.in           |
| Admin     | cultural@vvce.ac.in          |
| Authority | suresh.kumar@vvce.ac.in      |
| Authority | anitha.rao@vvce.ac.in        |

### 7. Start the Server

```bash
npm run dev      # development (nodemon)
npm start        # production
```

Server runs at: `http://localhost:5000`

Health check: `GET http://localhost:5000/health`

---

## API Reference

All routes are prefixed with `/api`.

### Authentication (`/api/auth`)

| Method | Endpoint              | Auth | Description                    |
|--------|-----------------------|------|--------------------------------|
| POST   | /register             | ❌   | Register new user              |
| POST   | /verify-email         | ❌   | Verify email with token        |
| POST   | /login                | ❌   | Login → returns JWT token      |
| POST   | /forgot-password      | ❌   | Send password reset email      |
| POST   | /reset-password       | ❌   | Reset password with token      |
| GET    | /me                   | ✅   | Get current user info          |

### Events (`/api/events`)

| Method | Endpoint              | Role           | Description                   |
|--------|-----------------------|----------------|-------------------------------|
| GET    | /                     | Public         | List/filter all events        |
| GET    | /:id                  | Public         | Get event details             |
| POST   | /                     | admin          | Create event (submit approval)|
| PATCH  | /:id                  | admin/authority| Update event                  |
| PATCH  | /:id/approve          | authority      | Approve/reject event          |
| DELETE | /:id                  | admin/authority| Soft-delete event             |
| GET    | /clash-check          | admin/authority| Check venue/date conflicts    |
| GET    | /:id/analytics        | admin/authority| Registration & revenue stats  |

Query params for `GET /`: `?category=Technical&search=hack&date=2025-08-15&page=1&limit=20`

### Registrations (`/api/registrations`)

| Method | Endpoint              | Role    | Description                      |
|--------|-----------------------|---------|----------------------------------|
| POST   | /                     | student | Register for event (+ team)      |
| POST   | /team-approve         | ❌      | Accept/decline team invite       |
| GET    | /my                   | student | My upcoming + completed events   |
| GET    | /event/:eventId       | admin/authority | All registrations for event |
| DELETE | /:id                  | student | Cancel registration              |

### Payments (`/api/payments`)

| Method | Endpoint                    | Role    | Description                |
|--------|-----------------------------|---------|----------------------------|
| POST   | /initiate                   | student | Start payment flow         |
| POST   | /verify                     | student | Confirm payment + register |
| GET    | /my                         | student | My payment history         |
| GET    | /event/:eventId/revenue     | admin/authority | Revenue report  |

### Certificates (`/api/certificates`)

| Method | Endpoint                        | Role    | Description                      |
|--------|---------------------------------|---------|----------------------------------|
| POST   | /                               | admin   | Upload cert for one student      |
| POST   | /bulk                           | admin   | Bulk upload for all registrants  |
| GET    | /my                             | student | My certificates                  |
| GET    | /activity-points                | student | My AICTE points                  |
| GET    | /activity-points/:studentId     | admin/authority | Student's points        |
| GET    | /event/:eventId                 | admin/authority | All certs for event     |

### Attendance (`/api/attendance`)

| Method | Endpoint              | Role           | Description                  |
|--------|-----------------------|----------------|------------------------------|
| POST   | /mark                 | admin          | Mark attendance (bulk)       |
| PATCH  | /:id                  | admin          | Toggle single record         |
| GET    | /my                   | student        | My attendance history        |
| GET    | /event/:eventId       | admin/authority| Full attendance sheet        |
| GET    | /date/:date           | authority      | All events + attendance by date|

### Notifications (`/api/notifications`)

| Method | Endpoint          | Role          | Description              |
|--------|-------------------|---------------|--------------------------|
| GET    | /                 | any           | Get my notifications     |
| PATCH  | /:id/read         | any           | Mark one as read         |
| PATCH  | /read-all         | any           | Mark all as read         |
| POST   | /send             | admin/authority| Broadcast notification  |
| DELETE | /:id              | any           | Delete notification      |

### Users (`/api/users`)

| Method | Endpoint                  | Role      | Description              |
|--------|---------------------------|-----------|--------------------------|
| GET    | /profile                  | any       | Get my profile           |
| PATCH  | /profile                  | any       | Update my profile        |
| PATCH  | /change-password          | any       | Change password          |
| GET    | /dashboard/student        | student   | Student dashboard data   |
| GET    | /dashboard/admin          | admin     | Admin dashboard data     |
| GET    | /dashboard/authority      | authority | Authority dashboard data |
| GET    | /clubs                    | admin/authority | Clubs summary       |
| GET    | /all                      | authority | All users list           |

---

## Authentication Flow

```
1. POST /api/auth/register  →  Creates user (is_verified=false), sends verification email
2. GET  email link          →  POST /api/auth/verify-email  →  is_verified=true
3. POST /api/auth/login     →  Returns { token, user }
4. All protected routes     →  Header: Authorization: Bearer <token>
```

**Email domain enforcement:** Every auth endpoint rejects emails not ending in `@vvce.ac.in`.

---

## Role-Based Access Control

```
student    → view events, register, pay, download certs, view points
admin      → create events, manage participants, upload certs, mark attendance
authority  → approve/reject events, monitor clubs, view all attendance, principal schedule
```

---

## Deployment on Render

### 1. Push to GitHub

```bash
git init && git add . && git commit -m "Initial commit"
git remote add origin https://github.com/your-org/vvce-backend.git
git push -u origin main
```

### 2. Create PostgreSQL on Render
- Render Dashboard → New → PostgreSQL
- Copy the **Internal Database URL**

### 3. Create Web Service on Render
- New → Web Service → Connect your repo
- Build Command: `npm install`
- Start Command: `npm start`
- Add all environment variables from `.env.example`
- Set `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT` from Render's Postgres

### 4. Run Migrations on Render
- In Shell tab: `npm run migrate && npm run seed`

### 5. Update Frontend
- Set your Vercel frontend's API base URL to: `https://your-render-app.onrender.com/api`

---

## Security Features

- ✅ @vvce.ac.in email domain enforcement on all auth routes
- ✅ Password hashing with bcryptjs (salt rounds: 12)
- ✅ JWT with expiry (7 days default)
- ✅ Role-based access control on every protected route
- ✅ Email verification before login
- ✅ Rate limiting: 100 req/15min global, 20 req/15min on auth
- ✅ Helmet.js security headers
- ✅ CORS restricted to frontend URL
- ✅ Input validation with express-validator
- ✅ SQL injection protection via parameterized queries
- ✅ File upload type + size validation

---

## Future Scalability

The modular architecture supports adding:

- 📱 **Mobile App** — same REST API, add push notification endpoints
- 🤖 **AI Recommendations** — add `/api/events/recommended` using student interests
- 💬 **Chat System** — add a `messages` table + Socket.io layer
- 📷 **QR Attendance** — generate QR per registration, add `/api/attendance/qr-scan`
- 🔔 **Push Notifications** — integrate Firebase FCM, store device tokens
- 📊 **Advanced Analytics** — add dedicated analytics routes with aggregation queries
