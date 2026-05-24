const { query, withTransaction } = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { sendEmail, emailTemplates } = require('../utils/email');

// ── INITIATE PAYMENT ──────────────────────────────────────
const initiatePayment = async (req, res, next) => {
  try {
    const { registration_id, method } = req.body;
    const regRes = await query(
      `SELECT r.*, e.registration_fee, e.title AS event_title
       FROM registrations r JOIN events e ON r.event_id = e.id
       WHERE r.id = $1`,
      [registration_id]
    );
    if (!regRes.rows.length) return res.status(404).json({ error: 'Registration not found.' });
    const reg = regRes.rows[0];

    if (parseFloat(reg.registration_fee) === 0) {
      return res.status(400).json({ error: 'This event has no registration fee.' });
    }

    const existing = await query('SELECT id FROM payments WHERE registration_id=$1 AND status=$2', [registration_id, 'completed']);
    if (existing.rows.length) return res.status(409).json({ error: 'Payment already completed.' });

    const payment = await query(
      `INSERT INTO payments (registration_id, amount, method, status)
       VALUES ($1,$2,$3,'pending') RETURNING *`,
      [registration_id, reg.registration_fee, method]
    );

    res.status(201).json({ payment: payment.rows[0], amount: reg.registration_fee });
  } catch (err) { next(err); }
};

// ── COMPLETE PAYMENT (simulate gateway callback) ───────────
const completePayment = async (req, res, next) => {
  try {
    const { payment_id, transaction_id } = req.body;
    await withTransaction(async (client) => {
      const payRes = await client.query(
        `UPDATE payments SET status='completed', transaction_id=$1, paid_at=NOW()
         WHERE id=$2 AND status='pending' RETURNING *`,
        [transaction_id || uuidv4(), payment_id]
      );
      if (!payRes.rows.length) throw { status: 400, message: 'Payment not found or already processed.' };
      const payment = payRes.rows[0];

      // Confirm registration
      const regRes = await client.query(
        `UPDATE registrations SET status='confirmed', confirmed_at=NOW()
         WHERE id=$1 RETURNING *, (SELECT email FROM users u JOIN students s ON u.id=s.user_id WHERE s.id=registrations.student_id) AS student_email,
         (SELECT full_name FROM users u JOIN students s ON u.id=s.user_id WHERE s.id=registrations.student_id) AS student_name`,
        [payment.registration_id]
      );
      const reg = regRes.rows[0];

      // Get event details
      const evRes = await client.query('SELECT title, event_date, venue FROM events WHERE id=$1', [reg.event_id]);
      const ev = evRes.rows[0];

      // Send receipt email
      const { subject, html } = emailTemplates.registrationConfirm(
        reg.student_name, ev.title,
        new Date(ev.event_date).toLocaleDateString('en-IN'), ev.venue
      );
      await sendEmail({ to: reg.student_email, subject, html }).catch(console.error);

      return payment;
    });
    res.json({ message: 'Payment completed. Registration confirmed!' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
};

// ── GET PAYMENT HISTORY ────────────────────────────────────
const getPaymentHistory = async (req, res, next) => {
  try {
    const studentRes = await query('SELECT id FROM students WHERE user_id=$1', [req.user.id]);
    if (!studentRes.rows.length) return res.status(404).json({ error: 'Student not found.' });
    const result = await query(
      `SELECT p.*, e.title AS event_title, e.event_date
       FROM payments p
       JOIN registrations r ON p.registration_id = r.id
       JOIN events e ON r.event_id = e.id
       WHERE r.student_id = $1
       ORDER BY p.created_at DESC`,
      [studentRes.rows[0].id]
    );
    res.json({ payments: result.rows });
  } catch (err) { next(err); }
};

module.exports = { initiatePayment, completePayment, getPaymentHistory };
