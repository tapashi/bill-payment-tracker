const fs = require('fs');
const path = require('path');
const db = require('../db');

const JSON_PATH = path.join(__dirname, '..', 'data.json');

async function migrate() {
  const raw = fs.readFileSync(JSON_PATH, 'utf-8');
  const data = JSON.parse(raw);

  const client = await db.pool.connect();
  try {
    await db.initializeSchema();
    await client.query('BEGIN');

    await client.query('TRUNCATE TABLE payment_statuses, payment_requests, members RESTART IDENTITY CASCADE');

    for (const m of data.members || []) {
      await client.query(
        `INSERT INTO members (id, name, phone, email, is_admin, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [m.id, m.name, m.phone, m.email || null, Boolean(m.is_admin), m.created_at || new Date().toISOString()]
      );
    }

    for (const pr of data.paymentRequests || []) {
      await client.query(
        `INSERT INTO payment_requests (id, title, amount, payment_details, message_template, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          pr.id,
          pr.title,
          pr.amount,
          pr.payment_details,
          pr.message_template,
          Boolean(pr.is_active),
          pr.created_at || new Date().toISOString(),
        ]
      );
    }

    for (const ps of data.paymentStatuses || []) {
      await client.query(
        `INSERT INTO payment_statuses (
          id,
          payment_request_id,
          member_id,
          status,
          confirmation_token,
          notified_at,
          reminder_sent_at,
          paid_at,
          utr,
          payment_method,
          screenshot_url
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          ps.id,
          ps.payment_request_id,
          ps.member_id,
          ps.status,
          ps.confirmation_token,
          ps.notified_at || null,
          ps.reminder_sent_at || null,
          ps.paid_at || null,
          ps.utr || null,
          ps.payment_method || null,
          ps.screenshot_url || null,
        ]
      );
    }

    await client.query(
      `SELECT setval('members_id_seq', COALESCE((SELECT MAX(id) FROM members), 1), true)`
    );
    await client.query(
      `SELECT setval('payment_requests_id_seq', COALESCE((SELECT MAX(id) FROM payment_requests), 1), true)`
    );
    await client.query(
      `SELECT setval('payment_statuses_id_seq', COALESCE((SELECT MAX(id) FROM payment_statuses), 1), true)`
    );

    await client.query('COMMIT');
    console.log('Migration completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await db.pool.end();
  }
}

migrate();
