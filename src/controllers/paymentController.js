const { query, transaction } = require('../config/database');
const { sendMail } = require('../config/email');
const { v4: uuidv4 } = require('uuid');

// In production, integrate with Razorpay/Stripe here.
// These controllers implement the payment lifecycle with a mock gateway
// that can be swapped for real gateway calls.

// POST /api/payments/initiate
const initiatePayment = async (req, res, next) => {
  try {
    const { event_id, method } = req.body; // method: 'upi' | 'card' | 'netbanking'
    const studentId = req.user.id;

    const event = await query('SELECT id, name, registration_fee FROM events WHERE id = $1', [event_id]);
    if (!event.rows.length) return res.status(404).json({ success: false, message: 'Event not found' });

    const ev = event.rows[0];
    if (ev.registration_fee <= 0) {
      return res.status(400).json({ success: false, message: 'This event has no registration fee' });
    }

    // Check existing pending payment
    const existing = await query(
      `SELECT id FROM payments WHERE event_id = $1 AND student_id = $2 AND status = 'pending'`,
      [event_id, studentId]
    );
    if (existing.rows.length) {
      return res.json({ success: true, message: 'Payment already initiated', payment_id: existing.rows[0].id });
    }

    const transactionRef = `VVCE-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;

    const result = await query(
      `INSERT INTO payments (event_id, student_id, amount, method, transaction_ref, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id, transaction_ref, amount`,
      [event_id, studentId, ev.registration_fee, method, transactionRef]
    );

    // In production: call Razorpay/Stripe API here and return their order_id
    res.status(201).json({
      success: true,
      message: 'Payment initiated',
      data: {
        payment_id: result.rows[0].id,
        transaction_ref: result.rows[0].transaction_ref,
        amount: result.rows[0].amount,
        currency: 'INR',
        // razorpay_order_id: razorpayOrder.id  ← plug in real gateway here
      },
    });
  } catch (err) { next(err); }
};

// POST /api/payments/verify
const verifyPayment = async (req, res, next) => {
  try {
    const { payment_id, gateway_payment_id, gateway_signature } = req.body;
    // In production: verify Razorpay signature here
    // const isValid = verifyRazorpaySignature(gateway_payment_id, gateway_signature);
    const isValid = true; // mock for now

    if (!isValid) return res.status(400).json({ success: false, message: 'Payment verification failed' });

    const payment = await query('SELECT * FROM payments WHERE id = $1 AND student_id = $2', [payment_id, req.user.id]);
    if (!payment.rows.length) return res.status(404).json({ success: false, message: 'Payment not found' });
    if (payment.rows[0].status === 'success') return res.status(409).json({ success: false, message: 'Payment already verified' });

    await transaction(async (client) => {
      await client.query(
        `UPDATE payments SET status = 'success', gateway_payment_id = $1, paid_at = NOW() WHERE id = $2`,
        [gateway_payment_id || 'MOCK_' + Date.now(), payment_id]
      );

      // Auto-confirm registration
      await client.query(
        `UPDATE registrations SET status = 'confirmed' WHERE event_id = $1 AND student_id = $2`,
        [payment.rows[0].event_id, req.user.id]
      );
    });

    // Send receipt
    const [user, event] = await Promise.all([
      query('SELECT name, email FROM users WHERE id = $1', [req.user.id]),
      query('SELECT name, event_date, venue FROM events WHERE id = $1', [payment.rows[0].event_id]),
    ]);

    await sendMail({
      to: user.rows[0].email,
      subject: `Payment Receipt — ${event.rows[0].name}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;">
          <h2 style="color:#0a1628;">Payment Successful ✅</h2>
          <p>Hello <strong>${user.rows[0].name}</strong>,</p>
          <p>Your payment of <strong>₹${payment.rows[0].amount}</strong> for <strong>${event.rows[0].name}</strong> has been received.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:8px;border:1px solid #eee;color:#888;font-size:12px;">Transaction Ref</td><td style="padding:8px;border:1px solid #eee;font-size:13px;">${payment.rows[0].transaction_ref}</td></tr>
            <tr><td style="padding:8px;border:1px solid #eee;color:#888;font-size:12px;">Amount</td><td style="padding:8px;border:1px solid #eee;font-size:13px;">₹${payment.rows[0].amount}</td></tr>
            <tr><td style="padding:8px;border:1px solid #eee;color:#888;font-size:12px;">Event</td><td style="padding:8px;border:1px solid #eee;font-size:13px;">${event.rows[0].name}</td></tr>
            <tr><td style="padding:8px;border:1px solid #eee;color:#888;font-size:12px;">Date</td><td style="padding:8px;border:1px solid #eee;font-size:13px;">${new Date(event.rows[0].event_date).toDateString()}</td></tr>
          </table>
          <p style="color:#888;font-size:12px;">Keep this email as your payment receipt. Show your USN at event check-in.</p>
        </div>
      `,
    });

    res.json({ success: true, message: 'Payment verified and registration confirmed. Receipt sent to your email.' });
  } catch (err) { next(err); }
};

// GET /api/payments/my
const getMyPayments = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT p.*, e.name as event_name, e.event_date
       FROM payments p JOIN events e ON e.id = p.event_id
       WHERE p.student_id = $1
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

// GET /api/payments/event/:eventId/revenue  — admin/authority
const getEventRevenue = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT
         COUNT(*) as total_transactions,
         SUM(amount) FILTER (WHERE status = 'success') as total_revenue,
         COUNT(*) FILTER (WHERE status = 'success') as successful,
         COUNT(*) FILTER (WHERE status = 'pending') as pending,
         COUNT(*) FILTER (WHERE status = 'failed') as failed,
         method, COUNT(*) as method_count
       FROM payments WHERE event_id = $1
       GROUP BY ROLLUP(method)`,
      [req.params.eventId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

module.exports = { initiatePayment, verifyPayment, getMyPayments, getEventRevenue };
