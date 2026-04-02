const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const cron = require('node-cron');
const db = require('./db');
const { requireAdmin } = require('./auth');

const authRouter = require('./routes/auth');
const membersRouter = require('./routes/members');
const paymentRequestsRouter = require('./routes/paymentRequests');
const paymentsRouter = require('./routes/payments');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/members', requireAdmin, membersRouter);
app.use('/api/payment-requests', requireAdmin, paymentRequestsRouter);
app.use('/api/payments', paymentsRouter);

// Stats endpoint
app.get('/api/stats', requireAdmin, async (req, res) => {
  const stats = await db.getStats();
  res.json(stats);
});

// Cron: Log overdue reminders daily at 9 AM
cron.schedule('0 9 * * *', async () => {
  const requests = await db.getPaymentRequests();
  const activeRequests = requests.filter((pr) => pr.is_active);
  let totalOverdue = 0;
  for (const pr of activeRequests) {
    const overdue = await db.getOverduePayments(pr.id);
    totalOverdue += overdue.length;
  }
  if (totalOverdue > 0) {
    console.log(`[CRON] ${totalOverdue} overdue payments found (7+ days). Check dashboard to send reminders.`);
  }
});

// Serve React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  });
}

async function bootstrap() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required for admin authentication.');
  }

  await db.initializeSchema();

  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    await db.createAdminUserIfMissing(process.env.ADMIN_EMAIL.toLowerCase(), hash);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
