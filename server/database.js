const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.json');

const defaultData = {
  members: [],
  paymentRequests: [],
  paymentStatuses: [],
  counters: { members: 0, paymentRequests: 0, paymentStatuses: 0 },
};

class Database {
  constructor() {
    if (fs.existsSync(DB_PATH)) {
      this.data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    } else {
      this.data = JSON.parse(JSON.stringify(defaultData));
      this._save();
    }
  }

  _save() {
    fs.writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2));
  }

  nextId(collection) {
    this.data.counters[collection]++;
    this._save();
    return this.data.counters[collection];
  }

  // Members
  getMembers() {
    return [...this.data.members].sort((a, b) => a.name.localeCompare(b.name));
  }

  getMember(id) {
    return this.data.members.find((m) => m.id === id) || null;
  }

  getAdmin() {
    return this.data.members.find((m) => m.is_admin) || null;
  }

  addMember({ name, phone, email }) {
    const member = {
      id: this.nextId('members'),
      name,
      phone,
      email: email || null,
      is_admin: 0,
      created_at: new Date().toISOString(),
    };
    this.data.members.push(member);
    this._save();
    return member;
  }

  updateMember(id, { name, phone, email }) {
    const member = this.getMember(id);
    if (!member) return null;
    member.name = name;
    member.phone = phone;
    member.email = email || null;
    this._save();
    return member;
  }

  setAdmin(id) {
    this.data.members.forEach((m) => (m.is_admin = 0));
    const member = this.getMember(id);
    if (member) member.is_admin = 1;
    this._save();
    return member;
  }

  deleteMember(id) {
    const idx = this.data.members.findIndex((m) => m.id === id);
    if (idx === -1) return false;
    this.data.members.splice(idx, 1);
    // Also remove related payment statuses
    this.data.paymentStatuses = this.data.paymentStatuses.filter((ps) => ps.member_id !== id);
    this._save();
    return true;
  }

  // Payment Requests
  getPaymentRequests() {
    return [...this.data.paymentRequests]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((pr) => {
        const statuses = this.data.paymentStatuses.filter((ps) => ps.payment_request_id === pr.id);
        return {
          ...pr,
          total_members: statuses.length,
          paid_count: statuses.filter((s) => s.status === 'paid').length,
        };
      });
  }

  getPaymentRequest(id) {
    return this.data.paymentRequests.find((pr) => pr.id === id) || null;
  }

  getPaymentRequestWithStatuses(id) {
    const pr = this.getPaymentRequest(id);
    if (!pr) return null;
    const statuses = this.data.paymentStatuses
      .filter((ps) => ps.payment_request_id === id)
      .map((ps) => {
        const member = this.getMember(ps.member_id);
        return { ...ps, name: member?.name, phone: member?.phone, email: member?.email };
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const admin = this.getAdmin();
    return { ...pr, statuses, admin };
  }

  addPaymentRequest({ title, amount, payment_details, message_template }) {
    const pr = {
      id: this.nextId('paymentRequests'),
      title,
      amount,
      payment_details,
      message_template,
      is_active: 1,
      created_at: new Date().toISOString(),
    };
    this.data.paymentRequests.push(pr);
    this._save();
    return pr;
  }

  updatePaymentRequest(id, updates) {
    const pr = this.getPaymentRequest(id);
    if (!pr) return null;
    Object.assign(pr, updates);
    this._save();
    return pr;
  }

  deletePaymentRequest(id) {
    const idx = this.data.paymentRequests.findIndex((pr) => pr.id === id);
    if (idx === -1) return false;
    this.data.paymentRequests.splice(idx, 1);
    this.data.paymentStatuses = this.data.paymentStatuses.filter((ps) => ps.payment_request_id !== id);
    this._save();
    return true;
  }

  // Payment Statuses
  addPaymentStatus({ payment_request_id, member_id, confirmation_token }) {
    const ps = {
      id: this.nextId('paymentStatuses'),
      payment_request_id,
      member_id,
      status: 'pending',
      confirmation_token,
      notified_at: null,
      reminder_sent_at: null,
      paid_at: null,
      utr: null,
      payment_method: null,
      screenshot_url: null,
    };
    this.data.paymentStatuses.push(ps);
    this._save();
    return ps;
  }

  getPaymentStatusByToken(token) {
    const ps = this.data.paymentStatuses.find((s) => s.confirmation_token === token);
    if (!ps) return null;
    const member = this.getMember(ps.member_id);
    const pr = this.getPaymentRequest(ps.payment_request_id);
    const admin = this.getAdmin();
    return {
      ...ps,
      name: member?.name,
      phone: member?.phone,
      title: pr?.title,
      amount: pr?.amount,
      payment_details: pr?.payment_details,
      admin: admin ? { name: admin.name, phone: admin.phone } : null,
    };
  }

  confirmPayment(token, { utr, payment_method, screenshot_url } = {}) {
    const ps = this.data.paymentStatuses.find((s) => s.confirmation_token === token);
    if (!ps) return null;
    if (ps.status === 'paid') return { ...this.getPaymentStatusByToken(token), already_paid: true };
    ps.status = 'paid';
    ps.paid_at = new Date().toISOString();
    if (utr) ps.utr = utr;
    if (payment_method) ps.payment_method = payment_method;
    if (screenshot_url) ps.screenshot_url = screenshot_url;
    this._save();
    return this.getPaymentStatusByToken(token);
  }

  markNotified(statusId) {
    const ps = this.data.paymentStatuses.find((s) => s.id === statusId);
    if (ps) {
      ps.notified_at = new Date().toISOString();
      this._save();
    }
  }

  markReminderSent(statusId) {
    const ps = this.data.paymentStatuses.find((s) => s.id === statusId);
    if (ps) {
      ps.reminder_sent_at = new Date().toISOString();
      this._save();
    }
  }

  markPaid(statusId) {
    const ps = this.data.paymentStatuses.find((s) => s.id === statusId);
    if (ps) {
      ps.status = 'paid';
      ps.paid_at = new Date().toISOString();
      this._save();
    }
  }

  getOverduePayments(requestId) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const pr = this.getPaymentRequest(requestId);
    if (!pr || !pr.is_active) return [];

    return this.data.paymentStatuses
      .filter(
        (ps) =>
          ps.payment_request_id === requestId &&
          ps.status === 'pending' &&
          ps.notified_at &&
          ps.notified_at <= sevenDaysAgo
      )
      .map((ps) => {
        const member = this.getMember(ps.member_id);
        return {
          ...ps,
          name: member?.name,
          phone: member?.phone,
          title: pr.title,
          amount: pr.amount,
          payment_details: pr.payment_details,
          message_template: pr.message_template,
        };
      });
  }

  // Stats
  getStats() {
    const totalMembers = this.data.members.length;
    const activeRequests = this.data.paymentRequests.filter((pr) => pr.is_active).length;
    const activeRequestIds = new Set(this.data.paymentRequests.filter((pr) => pr.is_active).map((pr) => pr.id));

    let totalCollected = 0;
    let pendingPayments = 0;
    for (const ps of this.data.paymentStatuses) {
      if (ps.status === 'paid') {
        const pr = this.getPaymentRequest(ps.payment_request_id);
        if (pr) totalCollected += pr.amount;
      }
      if (ps.status === 'pending' && activeRequestIds.has(ps.payment_request_id)) {
        pendingPayments++;
      }
    }

    return { totalMembers, activeRequests, totalCollected, pendingPayments };
  }
}

module.exports = new Database();
