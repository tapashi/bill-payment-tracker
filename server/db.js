const { Pool } = require('pg');

const useConnectionString = Boolean(process.env.DATABASE_URL);

const pool = new Pool(
  useConnectionString
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      }
    : {
        host: process.env.PGHOST || '127.0.0.1',
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
        database: process.env.PGDATABASE || 'bill_payment_tracker',
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      }
);

async function query(text, params) {
  return pool.query(text, params);
}

async function initializeSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      failed_login_count INTEGER NOT NULL DEFAULT 0,
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS members (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone VARCHAR(10) NOT NULL,
      email TEXT,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS payment_requests (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      amount NUMERIC(12, 2) NOT NULL,
      payment_details TEXT NOT NULL,
      message_template TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS payment_statuses (
      id SERIAL PRIMARY KEY,
      payment_request_id INTEGER NOT NULL REFERENCES payment_requests(id) ON DELETE CASCADE,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      confirmation_token TEXT NOT NULL UNIQUE,
      notified_at TIMESTAMPTZ,
      reminder_sent_at TIMESTAMPTZ,
      paid_at TIMESTAMPTZ,
      utr TEXT,
      payment_method TEXT,
      screenshot_url TEXT,
      UNIQUE (payment_request_id, member_id)
    );
  `);
}

async function getMembers() {
  const { rows } = await query(
    `SELECT id, name, phone, email, is_admin, created_at
     FROM members
     ORDER BY name ASC`
  );
  return rows;
}

async function getMember(id) {
  const { rows } = await query(
    `SELECT id, name, phone, email, is_admin, created_at
     FROM members
     WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function addMember({ name, phone, email }) {
  const { rows } = await query(
    `INSERT INTO members (name, phone, email)
     VALUES ($1, $2, $3)
     RETURNING id, name, phone, email, is_admin, created_at`,
    [name, phone, email || null]
  );
  return rows[0];
}

async function updateMember(id, { name, phone, email }) {
  const { rows } = await query(
    `UPDATE members
     SET name = $2, phone = $3, email = $4
     WHERE id = $1
     RETURNING id, name, phone, email, is_admin, created_at`,
    [id, name, phone, email || null]
  );
  return rows[0] || null;
}

async function setAdmin(id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE members SET is_admin = FALSE');
    const { rows } = await client.query(
      `UPDATE members
       SET is_admin = TRUE
       WHERE id = $1
       RETURNING id, name, phone, email, is_admin, created_at`,
      [id]
    );
    await client.query('COMMIT');
    return rows[0] || null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteMember(id) {
  const result = await query('DELETE FROM members WHERE id = $1', [id]);
  return result.rowCount > 0;
}

async function getAdminMember() {
  const { rows } = await query(
    `SELECT id, name, phone, email, is_admin, created_at
     FROM members
     WHERE is_admin = TRUE
     LIMIT 1`
  );
  return rows[0] || null;
}

async function getPaymentRequests() {
  const { rows } = await query(
    `SELECT pr.id,
            pr.title,
            pr.amount,
            pr.payment_details,
            pr.message_template,
            pr.is_active,
            pr.created_at,
            COUNT(ps.id)::int AS total_members,
            COUNT(*) FILTER (WHERE ps.status = 'paid')::int AS paid_count
     FROM payment_requests pr
     LEFT JOIN payment_statuses ps ON ps.payment_request_id = pr.id
     GROUP BY pr.id
     ORDER BY pr.created_at DESC`
  );
  return rows;
}

async function getPaymentRequest(id) {
  const { rows } = await query(
    `SELECT id, title, amount, payment_details, message_template, is_active, created_at
     FROM payment_requests
     WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function getPaymentRequestWithStatuses(id, includePhones = true) {
  const pr = await getPaymentRequest(id);
  if (!pr) return null;

  const phoneColumn = includePhones ? 'm.phone' : "NULL::text AS phone";
  const { rows: statuses } = await query(
    `SELECT ps.id,
            ps.payment_request_id,
            ps.member_id,
            ps.status,
            ps.confirmation_token,
            ps.notified_at,
            ps.reminder_sent_at,
            ps.paid_at,
            ps.utr,
            ps.payment_method,
            ps.screenshot_url,
            m.name,
            ${phoneColumn},
            m.email
     FROM payment_statuses ps
     JOIN members m ON m.id = ps.member_id
     WHERE ps.payment_request_id = $1
     ORDER BY m.name ASC`,
    [id]
  );

  const admin = await getAdminMember();
  return {
    ...pr,
    statuses,
    admin: admin ? { name: admin.name, phone: admin.phone } : null,
  };
}

async function addPaymentRequest({ title, amount, payment_details, message_template }) {
  const { rows } = await query(
    `INSERT INTO payment_requests (title, amount, payment_details, message_template)
     VALUES ($1, $2, $3, $4)
     RETURNING id, title, amount, payment_details, message_template, is_active, created_at`,
    [title, amount, payment_details, message_template]
  );
  return rows[0];
}

async function updatePaymentRequest(id, updates) {
  const fields = [];
  const values = [id];
  let idx = 2;

  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = $${idx++}`);
    values.push(value);
  }

  if (fields.length === 0) return getPaymentRequest(id);

  const { rows } = await query(
    `UPDATE payment_requests
     SET ${fields.join(', ')}
     WHERE id = $1
     RETURNING id, title, amount, payment_details, message_template, is_active, created_at`,
    values
  );
  return rows[0] || null;
}

async function deletePaymentRequest(id) {
  const result = await query('DELETE FROM payment_requests WHERE id = $1', [id]);
  return result.rowCount > 0;
}

async function addPaymentStatus({ payment_request_id, member_id, confirmation_token }) {
  const { rows } = await query(
    `INSERT INTO payment_statuses (payment_request_id, member_id, confirmation_token)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [payment_request_id, member_id, confirmation_token]
  );
  return rows[0];
}

async function getPaymentStatusByToken(token) {
  const admin = await getAdminMember();
  const { rows } = await query(
    `SELECT ps.*,
            m.name,
            pr.title,
            pr.amount,
            pr.payment_details
     FROM payment_statuses ps
     JOIN members m ON m.id = ps.member_id
     JOIN payment_requests pr ON pr.id = ps.payment_request_id
     WHERE ps.confirmation_token = $1`,
    [token]
  );
  if (rows.length === 0) return null;

  return {
    ...rows[0],
    admin: admin ? { name: admin.name, phone: admin.phone } : null,
  };
}

async function confirmPayment(token, { utr, payment_method, screenshot_url } = {}) {
  const existing = await getPaymentStatusByToken(token);
  if (!existing) return null;
  if (existing.status === 'paid') return { ...existing, already_paid: true };

  await query(
    `UPDATE payment_statuses
     SET status = 'paid',
         paid_at = NOW(),
         utr = COALESCE($2, utr),
         payment_method = COALESCE($3, payment_method),
         screenshot_url = COALESCE($4, screenshot_url)
     WHERE confirmation_token = $1`,
    [token, utr || null, payment_method || null, screenshot_url || null]
  );

  return getPaymentStatusByToken(token);
}

async function markNotified(statusId) {
  await query('UPDATE payment_statuses SET notified_at = NOW() WHERE id = $1', [statusId]);
}

async function markReminderSent(statusId) {
  await query('UPDATE payment_statuses SET reminder_sent_at = NOW() WHERE id = $1', [statusId]);
}

async function markPaid(statusId) {
  await query(
    `UPDATE payment_statuses
     SET status = 'paid', paid_at = NOW()
     WHERE id = $1`,
    [statusId]
  );
}

async function getOverduePayments(requestId) {
  const { rows } = await query(
    `SELECT ps.*, m.name, m.phone, pr.title, pr.amount, pr.payment_details, pr.message_template
     FROM payment_statuses ps
     JOIN members m ON m.id = ps.member_id
     JOIN payment_requests pr ON pr.id = ps.payment_request_id
     WHERE ps.payment_request_id = $1
       AND ps.status = 'pending'
       AND ps.notified_at IS NOT NULL
       AND ps.notified_at <= NOW() - INTERVAL '7 days'
       AND pr.is_active = TRUE`,
    [requestId]
  );
  return rows;
}

async function getStats() {
  const [{ rows: totalMembersRows }, { rows: activeRequestsRows }, { rows: collectedRows }, { rows: pendingRows }] =
    await Promise.all([
      query('SELECT COUNT(*)::int AS total_members FROM members'),
      query('SELECT COUNT(*)::int AS active_requests FROM payment_requests WHERE is_active = TRUE'),
      query(
        `SELECT COALESCE(SUM(pr.amount), 0)::numeric(12,2) AS total_collected
         FROM payment_statuses ps
         JOIN payment_requests pr ON pr.id = ps.payment_request_id
         WHERE ps.status = 'paid'`
      ),
      query(
        `SELECT COUNT(*)::int AS pending_payments
         FROM payment_statuses ps
         JOIN payment_requests pr ON pr.id = ps.payment_request_id
         WHERE ps.status = 'pending' AND pr.is_active = TRUE`
      ),
    ]);

  return {
    totalMembers: totalMembersRows[0].total_members,
    activeRequests: activeRequestsRows[0].active_requests,
    totalCollected: Number(collectedRows[0].total_collected),
    pendingPayments: pendingRows[0].pending_payments,
  };
}

async function getUserByEmail(email) {
  const { rows } = await query(
    `SELECT id, email, password_hash, role, failed_login_count, last_login_at
     FROM users
     WHERE email = $1`,
    [email]
  );
  return rows[0] || null;
}

async function incrementFailedLogin(email) {
  await query(
    `UPDATE users
     SET failed_login_count = failed_login_count + 1
     WHERE email = $1`,
    [email]
  );
}

async function resetFailedLoginAndMarkLastLogin(userId) {
  await query(
    `UPDATE users
     SET failed_login_count = 0,
         last_login_at = NOW()
     WHERE id = $1`,
    [userId]
  );
}

async function createAdminUserIfMissing(email, passwordHash) {
  await query(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, 'admin')
     ON CONFLICT (email) DO NOTHING`,
    [email, passwordHash]
  );
}

module.exports = {
  pool,
  initializeSchema,
  getMembers,
  getMember,
  addMember,
  updateMember,
  setAdmin,
  deleteMember,
  getAdminMember,
  getPaymentRequests,
  getPaymentRequest,
  getPaymentRequestWithStatuses,
  addPaymentRequest,
  updatePaymentRequest,
  deletePaymentRequest,
  addPaymentStatus,
  getPaymentStatusByToken,
  confirmPayment,
  markNotified,
  markReminderSent,
  markPaid,
  getOverduePayments,
  getStats,
  getUserByEmail,
  incrementFailedLogin,
  resetFailedLoginAndMarkLastLogin,
  createAdminUserIfMissing,
};
