const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all members
router.get('/', async (req, res) => {
  const members = await db.getMembers();
  res.json(members);
});

// POST add member
router.post('/', async (req, res) => {
  const { name, phone, email } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and phone are required' });
  }
  if (!/^\d{10}$/.test(phone)) {
    return res.status(400).json({ error: 'Phone must be a 10-digit number' });
  }
  const member = await db.addMember({ name, phone, email });
  res.status(201).json(member);
});

// PUT update member
router.put('/:id', async (req, res) => {
  const { name, phone, email } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and phone are required' });
  }
  if (!/^\d{10}$/.test(phone)) {
    return res.status(400).json({ error: 'Phone must be a 10-digit number' });
  }
  const member = await db.updateMember(Number(req.params.id), { name, phone, email });
  if (!member) return res.status(404).json({ error: 'Member not found' });
  res.json(member);
});

// PUT set admin
router.put('/:id/admin', async (req, res) => {
  const member = await db.getMember(Number(req.params.id));
  if (!member) return res.status(404).json({ error: 'Member not found' });
  const updated = await db.setAdmin(Number(req.params.id));
  res.json(updated);
});

// DELETE member
router.delete('/:id', async (req, res) => {
  const member = await db.getMember(Number(req.params.id));
  if (!member) return res.status(404).json({ error: 'Member not found' });
  if (member.is_admin) {
    return res.status(400).json({ error: 'Cannot delete the admin. Transfer admin role first.' });
  }
  await db.deleteMember(Number(req.params.id));
  res.json({ message: 'Member deleted' });
});

module.exports = router;
