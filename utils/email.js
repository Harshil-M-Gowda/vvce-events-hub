const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmail = async ({ to, subject, html, text }) => {
  if (process.env.NODE_ENV === 'test') {
    console.log('[TEST] Email to:', to, '| Subject:', subject);
    return { messageId: 'test-message-id' };
  }
  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'VVCE Events Hub <noreply@vvce.ac.in>',
    to, subject, html, text,
  });
  return info;
};

const emailTemplates = {
  verifyEmail: (name, link) => ({
    subject: 'Verify your VVCE Events Hub account',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#0a1628,#1a3560);padding:30px;text-align:center;">
          <h1 style="color:#f0a500;margin:0;font-size:24px;">VVCE Events Hub</h1>
          <p style="color:rgba(255,255,255,0.7);margin:8px 0 0;">Vidyavardhaka College of Engineering</p>
        </div>
        <div style="padding:30px;">
          <h2 style="color:#0a1628;">Hello, ${name}!</h2>
          <p style="color:#566880;line-height:1.6;">Welcome to VVCE Events Hub. Please verify your email address to activate your account.</p>
          <div style="text-align:center;margin:30px 0;">
            <a href="${link}" style="background:linear-gradient(135deg,#f0a500,#f7c948);color:#0a1628;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;">
              Verify Email Address
            </a>
          </div>
          <p style="color:#8fa3b1;font-size:13px;">This link expires in 1 hour. If you did not create this account, please ignore this email.</p>
        </div>
      </div>
    `,
  }),

  registrationConfirm: (name, eventTitle, eventDate, venue) => ({
    subject: `Registration Confirmed — ${eventTitle}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#0a1628,#1a3560);padding:30px;text-align:center;">
          <h1 style="color:#f0a500;margin:0;">VVCE Events Hub</h1>
        </div>
        <div style="padding:30px;">
          <h2 style="color:#0a1628;">You're registered! ✅</h2>
          <p style="color:#566880;">Hi ${name}, your registration for <strong>${eventTitle}</strong> has been confirmed.</p>
          <div style="background:#f4f6fa;border-radius:8px;padding:20px;margin:20px 0;">
            <p style="margin:5px 0;color:#566880;"><strong style="color:#0a1628;">Event:</strong> ${eventTitle}</p>
            <p style="margin:5px 0;color:#566880;"><strong style="color:#0a1628;">Date:</strong> ${eventDate}</p>
            <p style="margin:5px 0;color:#566880;"><strong style="color:#0a1628;">Venue:</strong> ${venue}</p>
          </div>
          <p style="color:#8fa3b1;font-size:13px;">Carry your college ID on the day of the event.</p>
        </div>
      </div>
    `,
  }),

  teamInvite: (inviteeName, inviterName, teamName, eventTitle, approveLink) => ({
    subject: `Team Invitation — ${eventTitle}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#0a1628,#1a3560);padding:30px;text-align:center;">
          <h1 style="color:#f0a500;margin:0;">VVCE Events Hub</h1>
        </div>
        <div style="padding:30px;">
          <h2 style="color:#0a1628;">You've been invited to a team!</h2>
          <p style="color:#566880;">${inviterName} has invited you to join <strong>${teamName}</strong> for <strong>${eventTitle}</strong>.</p>
          <div style="text-align:center;margin:30px 0;">
            <a href="${approveLink}" style="background:linear-gradient(135deg,#f0a500,#f7c948);color:#0a1628;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;">
              Accept Invitation
            </a>
          </div>
        </div>
      </div>
    `,
  }),

  approvalResult: (name, eventTitle, approved, reason) => ({
    subject: `Event ${approved ? 'Approved' : 'Rejected'} — ${eventTitle}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#0a1628,#1a3560);padding:30px;text-align:center;">
          <h1 style="color:#f0a500;margin:0;">VVCE Events Hub</h1>
        </div>
        <div style="padding:30px;">
          <h2 style="color:${approved ? '#2e7d32' : '#c62828'};">${approved ? '✅ Event Approved!' : '❌ Event Rejected'}</h2>
          <p style="color:#566880;">Hi ${name}, your event <strong>${eventTitle}</strong> has been ${approved ? 'approved' : 'rejected'}.</p>
          ${!approved && reason ? `<div style="background:#ffebee;border-radius:8px;padding:16px;margin:16px 0;"><p style="color:#c62828;margin:0;"><strong>Reason:</strong> ${reason}</p></div>` : ''}
        </div>
      </div>
    `,
  }),

  passwordReset: (name, link) => ({
    subject: 'Reset your VVCE Events Hub password',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#0a1628,#1a3560);padding:30px;text-align:center;">
          <h1 style="color:#f0a500;margin:0;">VVCE Events Hub</h1>
        </div>
        <div style="padding:30px;">
          <h2 style="color:#0a1628;">Password Reset</h2>
          <p style="color:#566880;">Hi ${name}, click below to reset your password. This link expires in 1 hour.</p>
          <div style="text-align:center;margin:30px 0;">
            <a href="${link}" style="background:linear-gradient(135deg,#f0a500,#f7c948);color:#0a1628;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;">
              Reset Password
            </a>
          </div>
        </div>
      </div>
    `,
  }),
};

module.exports = { sendEmail, emailTemplates };
