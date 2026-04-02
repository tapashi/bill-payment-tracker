import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';

const COUNTRY_CODE = '91';

function buildWhatsAppUrl(phone, message) {
  const fullPhone = `${COUNTRY_CODE}${phone}`;
  return `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;
}

function buildMessage(template, data) {
  return template
    .replace(/{name}/g, data.name)
    .replace(/{title}/g, data.title)
    .replace(/{amount}/g, data.amount)
    .replace(/{payment_details}/g, data.payment_details)
    .replace(/{confirmation_url}/g, data.confirmation_url);
}

export default function RequestDetails() {
  const { id } = useParams();
  const [request, setRequest] = useState(null);
  const [overdue, setOverdue] = useState([]);
  const [sendQueue, setSendQueue] = useState([]);
  const [sendQueueIsReminder, setSendQueueIsReminder] = useState(false);

  const appUrl = window.location.origin;

  const fetchData = useCallback(() => {
    api.get(`/payment-requests/${id}`).then((r) => setRequest(r.data));
    api.get(`/payments/overdue/${id}`).then((r) => setOverdue(r.data));
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!request) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  const paidCount = request.statuses.filter((s) => s.status === 'paid').length;
  const totalCollected = paidCount * request.amount;

  const handleSendWhatsApp = async (status, isReminder = false) => {
    const confirmUrl = `${appUrl}/confirm/${status.confirmation_token}`;
    const message = buildMessage(
      isReminder
        ? `⏰ Reminder: ${request.message_template}`
        : request.message_template,
      {
        name: status.name,
        title: request.title,
        amount: request.amount,
        payment_details: request.payment_details,
        confirmation_url: confirmUrl,
      }
    );
    const waUrl = buildWhatsAppUrl(status.phone, message);
    window.open(waUrl, '_blank');

    // Mark as notified
    try {
      if (isReminder) {
        await api.post(`/payments/reminder/${status.id}`);
      } else {
        await api.post(`/payments/notify/${status.id}`);
      }
      fetchData();
    } catch {
      // Ignore tracking errors
    }
  };

  const handleSendAll = () => {
    const pending = request.statuses.filter((s) => s.status === 'pending');
    if (pending.length === 0) {
      toast('All payments are already confirmed!');
      return;
    }
    if (!window.confirm(`Open WhatsApp for ${pending.length} pending members one by one?`)) return;
    setSendQueueIsReminder(false);
    setSendQueue(pending);
    handleSendWhatsApp(pending[0], false);
    setSendQueue(pending.slice(1));
  };

  const handleSendReminders = () => {
    if (overdue.length === 0) {
      toast('No overdue payments to remind!');
      return;
    }
    if (!window.confirm(`Send reminders to ${overdue.length} overdue members one by one?`)) return;
    setSendQueueIsReminder(true);
    setSendQueue(overdue);
    handleSendWhatsApp(overdue[0], true);
    setSendQueue(overdue.slice(1));
  };

  const handleSendNext = () => {
    if (sendQueue.length === 0) return;
    const next = sendQueue[0];
    handleSendWhatsApp(next, sendQueueIsReminder);
    setSendQueue(sendQueue.slice(1));
  };

  const handleCancelQueue = () => {
    setSendQueue([]);
  };

  const handleMarkPaid = async (statusId) => {
    if (!window.confirm('Manually mark this payment as paid?')) return;
    try {
      await api.post(`/payments/mark-paid/${statusId}`);
      toast.success('Marked as paid');
      fetchData();
    } catch {
      toast.error('Failed to update');
    }
  };

  const handleCloseRequest = async () => {
    if (!window.confirm('Close this payment request?')) return;
    await api.put(`/payment-requests/${id}`, { is_active: 0 });
    toast.success('Request closed');
    fetchData();
  };

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{request.title}</h1>
          <p className="text-gray-500 mt-1">
            Created {new Date(request.created_at).toLocaleDateString()}
          </p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-sm font-medium ${
            request.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {request.is_active ? 'Active' : 'Closed'}
        </span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Amount per person</p>
          <p className="text-xl font-bold">₹{request.amount}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Payment Details</p>
          <p className="text-sm font-medium mt-1">{request.payment_details}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Progress</p>
          <p className="text-xl font-bold">
            {paidCount}/{request.statuses.length} paid
          </p>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div
              className="bg-green-500 rounded-full h-2 transition-all"
              style={{
                width: `${request.statuses.length > 0 ? (paidCount / request.statuses.length) * 100 : 0}%`,
              }}
            ></div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Total Collected</p>
          <p className="text-xl font-bold text-green-600">₹{totalCollected}</p>
        </div>
      </div>

      {/* Action Buttons */}
      {request.is_active && (
        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={handleSendAll}
            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 text-sm font-medium"
          >
            📱 Send All via WhatsApp
          </button>
          {overdue.length > 0 && (
            <button
              onClick={handleSendReminders}
              className="bg-orange-500 text-white px-4 py-2 rounded-md hover:bg-orange-600 text-sm font-medium"
            >
              ⏰ Send Reminders ({overdue.length} overdue)
            </button>
          )}
          <button
            onClick={handleCloseRequest}
            className="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600 text-sm font-medium"
          >
            Close Request
          </button>
        </div>
      )}

      {/* Send Queue Banner */}
      {sendQueue.length > 0 && (
        <div className="bg-green-50 border border-green-300 rounded-lg p-4 mb-6 flex items-center justify-between">
          <span className="text-green-800 font-medium">
            {sendQueue.length} member{sendQueue.length > 1 ? 's' : ''} remaining — next: <strong>{sendQueue[0].name}</strong>
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleSendNext}
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 text-sm font-medium"
            >
              📱 Send Next
            </button>
            <button
              onClick={handleCancelQueue}
              className="bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Payment Status Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Member</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notified</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Paid At</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">UTR</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Proof</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {request.statuses.map((s) => {
              const isOverdue = overdue.some((o) => o.id === s.id);
              return (
                <tr key={s.id} className={isOverdue ? 'bg-orange-50' : 'hover:bg-gray-50'}>
                  <td className="px-6 py-4 font-medium text-gray-900">{s.name}</td>
                  <td className="px-6 py-4 text-gray-600">{s.phone}</td>
                  <td className="px-6 py-4">
                    {s.status === 'paid' ? (
                      <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-medium">
                        ✅ Paid
                      </span>
                    ) : (
                      <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full text-xs font-medium">
                        ⏳ Pending
                        {isOverdue && ' (Overdue)'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {s.notified_at ? new Date(s.notified_at).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {s.paid_at ? new Date(s.paid_at).toLocaleString() : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {s.utr ? (
                      <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded" title={`Via ${s.payment_method || 'unknown'}`}>
                        {s.utr}
                      </span>
                    ) : s.status === 'paid' ? (
                      <span className="text-xs text-gray-400">N/A</span>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {s.screenshot_url ? (
                      <a
                        href={s.screenshot_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                      >
                        📎 View
                      </a>
                    ) : s.status === 'paid' ? (
                      <span className="text-xs text-gray-400">N/A</span>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    {s.status === 'pending' && request.is_active && (
                      <>
                        <button
                          onClick={() => handleSendWhatsApp(s)}
                          className="text-green-600 hover:text-green-800 text-sm"
                          title="Send WhatsApp"
                        >
                          📱 Send
                        </button>
                        <button
                          onClick={() => handleMarkPaid(s.id)}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                          title="Mark as paid"
                        >
                          ✅ Mark Paid
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
