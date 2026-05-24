const base = (content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f4f6fa; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #0a1628, #1a3560); padding: 32px; text-align: center; }
    .header h1 { color: #f0a500; font-size: 22px; margin: 0; }
    .header p { color: rgba(255,255,255,0.7); font-size: 13px; margin: 6px 0 0; }
    .body { padding: 32px; }
    .body p { color: #566880; font-size: 14px; line-height: 1.7; }
    .btn { display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #f0a500, #f7c948); color: #0a1628; font-weight: 700; text-decoration: none; border-radius: 8px; margin: 20px 0; }
    .footer { padding: 20px 32px; background: #f4f6fa; font-size: 11px; color: #8fa3b1; text-align: center; }
    .info-box { background: #f4f6fa; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .info-box p { margin: 4px 0; font-size: 13px; color: #0a1628; }
    .info-box .label { color: #8fa3b1; font-size: 11px; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>VVCE Events Hub</h1>
      <p>Vidyavardhaka College of Engineering</p>
    </div>
    <div class="body">${content}</div>
    <div class="footer">This is an automated message from VVCE Events Hub. Do not reply to this email.</div>
  </div>
</body>
</html>`;

const verifyEmail = (name, url) => base(`
  <p>Hello <strong>${name}</strong>,</p>
  <p>Welcome to VVCE Events Hub! Please verify your email address to activate your account.</p>
  <a href="${url}" class="btn">Verify Email Address</a>
  <p style="font-size:12px;color:#8fa3b1;">This link expires in 24 hours. If you didn't create an account, ignore this email.</p>
`);

const registrationConfirm = (name, event) => base(`
  <p>Hello <strong>${name}</strong>,</p>
  <p>Your registration has been confirmed!</p>
  <div class="info-box">
    <p class="label">Event</p><p><strong>${event.name}</strong></p>
    <p class="label">Club</p><p>${event.club_name}</p>
    <p class="label">Date & Time</p><p>${new Date(event.event_date).toDateString()} at ${event.event_time}</p>
    <p class="label">Venue</p><p>${event.venue}</p>
    <p class="label">Fee</p><p>${event.registration_fee > 0 ? '₹' + event.registration_fee : 'Free'}</p>
  </div>
  <p>Show this email or your USN at the event for check-in. Good luck!</p>
`);

const teamInvite = (inviteeName, inviterName, event, approvalUrl) => base(`
  <p>Hello <strong>${inviteeName}</strong>,</p>
  <p><strong>${inviterName}</strong> has added you to their team for:</p>
  <div class="info-box">
    <p class="label">Event</p><p><strong>${event.name}</strong></p>
    <p class="label">Date</p><p>${new Date(event.event_date).toDateString()}</p>
    <p class="label">Venue</p><p>${event.venue}</p>
  </div>
  <p>Please approve or decline your participation:</p>
  <a href="${approvalUrl}" class="btn">Approve Participation</a>
`);

const eventApprovalStatus = (adminName, event, status, reason) => base(`
  <p>Hello <strong>${adminName}</strong>,</p>
  <p>Your event <strong>${event.name}</strong> has been <strong style="color:${status==='approved'?'#2e7d32':'#c62828'}">${status.toUpperCase()}</strong> by the authority.</p>
  ${reason ? `<div class="info-box"><p class="label">Remarks</p><p>${reason}</p></div>` : ''}
  <p>Log in to VVCE Events Hub to view details.</p>
`);

const passwordReset = (name, url) => base(`
  <p>Hello <strong>${name}</strong>,</p>
  <p>We received a request to reset your password. Click the button below:</p>
  <a href="${url}" class="btn">Reset Password</a>
  <p style="font-size:12px;color:#8fa3b1;">This link expires in 1 hour. If you didn't request a reset, ignore this email.</p>
`);

module.exports = { verifyEmail, registrationConfirm, teamInvite, eventApprovalStatus, passwordReset };
