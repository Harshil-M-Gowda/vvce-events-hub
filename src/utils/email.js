// src/utils/email.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendMail = async ({ to, subject, html }) => {
  const info = await transporter.sendMail({
    from: process.env.FROM_EMAIL,
    to,
    subject,
    html,
  });
  return info;
};

// ── Templates ────────────────────────────────────────────────

const BASE = (content) => `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f4f6fa;padding:20px;">
    <div style="background:#0a1628;border-radius:12px 12px 0 0;padding:24px;text-align:center;">
      <h1 style="color:#f0a500;margin:0;font-size:24px;">VVCE Events Hub</h1>
      <p style="color:rgba(255,255,255,0.6);margin:4px 0 0;font-size:13px;">Vidyavardhaka College of Engineering</p>
    </div>
    <div style="background:#fff;border-radius:0 0 12px 12px;padding:28px;">
      ${content}
    </div>
    <p style="text-align:center;color:#8fa3b1;font-size:11px;margin-top:16px;">
      This is an automated message from VVCE Events Hub. Do not reply.
    </p>
  </div>
`;

exports.sendVerificationEmail = async (email, name, token) => {
  const link = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
  await sendMail({
    to: email,
    subject: 'Verify your VVCE Events Hub account',
    html: BASE(`
      <h2 style="color:#0a1628;">Hello, ${name}!</h2>
      <p>Welcome to VVCE Events Hub. Click the button below to verify your email.</p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${link}" style="background:#f0a500;color:#0a1628;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">Verify Email</a>
      </div>
      <p style="color:#566880;font-size:13px;">This link expires in 24 hours.</p>
    `),
  });
};

exports.sendRegistrationConfirmation = async (email, name, event) => {
  await sendMail({
    to: email,
    subject: `Registration Confirmed — ${event.name}`,
    html: BASE(`
      <h2 style="color:#0a1628;">You're registered! 🎉</h2>
      <p>Hi <strong>${name}</strong>, your registration is confirmed.</p>
      <div style="background:#f4f6fa;border-radius:8px;padding:16px;margin:20px 0;">
        <h3 style="color:#0a1628;margin:0 0 12px;">${event.name}</h3>
        <table style="width:100%;font-size:14px;color:#566880;">
          <tr><td>📅 Date</td><td style="text-align:right;color:#0a1628;font-weight:600;">${event.event_date}</td></tr>
          <tr><td>⏰ Time</td><td style="text-align:right;color:#0a1628;font-weight:600;">${event.event_time}</td></tr>
          <tr><td>📍 Venue</td><td style="text-align:right;color:#0a1628;font-weight:600;">${event.venue}</td></tr>
          <tr><td>🏛️ Organizer</td><td style="text-align:right;color:#0a1628;font-weight:600;">${event.club_name}</td></tr>
        </table>
      </div>
      <p style="color:#566880;font-size:13px;">Keep this email for your records.</p>
    `),
  });
};

exports.sendTeamInvite = async (email, inviterName, teamName, eventName, token) => {
  const link = `${process.env.FRONTEND_URL}/team-invite?token=${token}`;
  await sendMail({
    to: email,
    subject: `Team Invitation — ${eventName}`,
    html: BASE(`
      <h2 style="color:#0a1628;">You've been invited! 🤝</h2>
      <p><strong>${inviterName}</strong> has invited you to join team <strong>${teamName}</strong> for <strong>${eventName}</strong>.</p>
      <div style="text-align:center;margin:28px 0;display:flex;gap:12px;justify-content:center;">
        <a href="${link}&action=accept" style="background:#2e7d32;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Accept</a>
        <a href="${link}&action=reject" style="background:#c62828;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Decline</a>
      </div>
      <p style="color:#566880;font-size:13px;">This invitation expires in 48 hours.</p>
    `),
  });
};

exports.sendPasswordReset = async (email, name, token) => {
  const link = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
  await sendMail({
    to: email,
    subject: 'Reset your VVCE Events Hub password',
    html: BASE(`
      <h2 style="color:#0a1628;">Password Reset</h2>
      <p>Hi <strong>${name}</strong>, click below to reset your password.</p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${link}" style="background:#f0a500;color:#0a1628;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">Reset Password</a>
      </div>
      <p style="color:#566880;font-size:13px;">This link expires in 1 hour. Ignore if you didn't request this.</p>
    `),
  });
};

exports.sendApprovalNotification = async (email, adminName, eventName, status, remarks) => {
  const color = status === 'approved' ? '#2e7d32' : '#c62828';
  const label = status === 'approved' ? 'Approved ✅' : 'Rejected ❌';
  await sendMail({
    to: email,
    subject: `Event ${label} — ${eventName}`,
    html: BASE(`
      <h2 style="color:${color};">${label}</h2>
      <p>Hi <strong>${adminName}</strong>, your event <strong>${eventName}</strong> has been <strong>${status}</strong>.</p>
      ${remarks ? `<div style="background:#f4f6fa;border-radius:8px;padding:16px;margin-top:16px;"><p style="margin:0;color:#566880;font-size:13px;"><strong>Remarks:</strong> ${remarks}</p></div>` : ''}
    `),
  });
};

exports.sendPaymentReceipt = async (email, name, payment, event) => {
  await sendMail({
    to: email,
    subject: `Payment Receipt — ${event.name}`,
    html: BASE(`
      <h2 style="color:#0a1628;">Payment Successful 🎉</h2>
      <p>Hi <strong>${name}</strong>, your payment has been received.</p>
      <div style="background:#f4f6fa;border-radius:8px;padding:16px;margin:20px 0;">
        <table style="width:100%;font-size:14px;color:#566880;">
          <tr><td>Event</td><td style="text-align:right;color:#0a1628;font-weight:600;">${event.name}</td></tr>
          <tr><td>Amount</td><td style="text-align:right;color:#0a1628;font-weight:600;">₹${payment.amount}</td></tr>
          <tr><td>Transaction ID</td><td style="text-align:right;color:#0a1628;font-size:12px;">${payment.razorpay_payment_id || payment.id}</td></tr>
          <tr><td>Date</td><td style="text-align:right;color:#0a1628;">${new Date().toLocaleDateString('en-IN')}</td></tr>
        </table>
      </div>
    `),
  });
};
