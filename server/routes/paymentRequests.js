const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const DEFAULT_TEMPLATE = `Hi {name}! 👋

A payment request has been created:
📋 *{title}*
💰 Amount: ₹{amount}
💳 Payment Details: {payment_details}

Please make the payment and confirm here:
{confirmation_url}

Thank you! 🙏`;

// GET all payment requests
router.get('/', async (req, res) => {
  const requests = await db.getPaymentRequests();
  res.json(requests);
});

// GET single payment request with statuses
router.get('/:id', async (req, res) => {
  const result = await db.getPaymentRequestWithStatuses(Number(req.params.id), true);
  if (!result) return res.status(404).json({ error: 'Payment request not found' });
  res.json(result);
});

// POST create payment request
router.post('/', async (req, res) => {
  const { title, amount, payment_details, message_template } = req.body;
  if (!title || !amount || !payment_details) {
    return res.status(400).json({ error: 'Title, amount, and payment details are required' });
  }
  if (amount <= 0) {
    return res.status(400).json({ error: 'Amount must be positive' });
  }

  const members = await db.getMembers();
  if (members.length === 0) {
    return res.status(400).json({ error: 'No team members found. Add members first.' });
  }

  const template = message_template || DEFAULT_TEMPLATE;
  const pr = await db.addPaymentRequest({
    title,
    amount: parseFloat(amount),
    payment_details,
    message_template: template,
  });

  for (const member of members) {
    await db.addPaymentStatus({
      payment_request_id: pr.id,
      member_id: member.id,
      confirmation_token: uuidv4(),
    });
  }

  res.status(201).json(pr);
});

// PUT update payment request
router.put('/:id', async (req, res) => {
  const existing = await db.getPaymentRequest(Number(req.params.id));
  if (!existing) return res.status(404).json({ error: 'Payment request not found' });

  const updates = {};
  if (req.body.title !== undefined) updates.title = req.body.title;
  if (req.body.amount !== undefined) updates.amount = req.body.amount;
  if (req.body.payment_details !== undefined) updates.payment_details = req.body.payment_details;
  if (req.body.message_template !== undefined) updates.message_template = req.body.message_template;
  if (req.body.is_active !== undefined) updates.is_active = req.body.is_active;

  const updated = await db.updatePaymentRequest(Number(req.params.id), updates);
  res.json(updated);
});

// DELETE payment request
router.delete('/:id', async (req, res) => {
  const exists = await db.getPaymentRequest(Number(req.params.id));
  if (!exists) return res.status(404).json({ error: 'Payment request not found' });
  await db.deletePaymentRequest(Number(req.params.id));
  res.json({ message: 'Payment request deleted' });
});

module.exports = router;
