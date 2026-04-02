const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../db');
const { requireAdmin } = require('../auth');
const { validateImage, uploadToS3 } = require('../imageValidator');

// Multer: store in memory for validation before S3 upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, and WebP images are allowed.'));
    }
    cb(null, true);
  },
});

// GET payment info by confirmation token (public - for team members)
router.get('/confirm/:token', async (req, res) => {
  const status = await db.getPaymentStatusByToken(req.params.token);
  if (!status) return res.status(404).json({ error: 'Invalid confirmation link' });
  res.json(status);
});

// POST confirm payment (public - for team members)
router.post('/confirm/:token', upload.single('screenshot'), async (req, res) => {
  try {
    const token = req.params.token;
    const utr = req.body.utr?.trim();
    const payment_method = req.body.payment_method || 'manual';

    // Validate required fields
    if (!utr) {
      return res.status(400).json({ error: 'UPI Transaction Reference (UTR) is required.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Payment screenshot is required.' });
    }

    // Validate image for tampering
    const validation = await validateImage(req.file.buffer, req.file.mimetype);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.reason });
    }

    // Check token is valid before uploading to S3
    const existing = await db.getPaymentStatusByToken(token);
    if (!existing) {
      return res.status(404).json({ error: 'Invalid confirmation link' });
    }
    if (existing.status === 'paid') {
      return res.json({ message: 'Payment already confirmed', already_paid: true });
    }

    // Upload validated screenshot to S3
    const screenshotUrl = await uploadToS3(req.file.buffer, req.file.originalname, token);

    // Confirm payment with all data
    const result = await db.confirmPayment(token, {
      utr,
      payment_method,
      screenshot_url: screenshotUrl,
    });
    res.json({ message: 'Payment confirmed', ...result });
  } catch (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    console.error('Confirm payment error:', err);
    res.status(500).json({ error: 'Failed to confirm payment. Please try again.' });
  }
});

// POST mark notified (admin marks that WhatsApp was sent)
router.post('/notify/:statusId', requireAdmin, async (req, res) => {
  await db.markNotified(Number(req.params.statusId));
  res.json({ message: 'Marked as notified' });
});

// POST mark reminder sent
router.post('/reminder/:statusId', requireAdmin, async (req, res) => {
  await db.markReminderSent(Number(req.params.statusId));
  res.json({ message: 'Reminder sent' });
});

// POST admin manually mark as paid
router.post('/mark-paid/:statusId', requireAdmin, async (req, res) => {
  await db.markPaid(Number(req.params.statusId));
  res.json({ message: 'Marked as paid' });
});

// GET overdue payments (pending for 7+ days after notification)
router.get('/overdue/:requestId', requireAdmin, async (req, res) => {
  const overdue = await db.getOverduePayments(Number(req.params.requestId));
  res.json(overdue);
});

module.exports = router;
