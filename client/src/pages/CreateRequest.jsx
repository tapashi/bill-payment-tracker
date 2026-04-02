import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';

const DEFAULT_TEMPLATE = `Hi {name}! 👋

A payment request has been created:
📋 *{title}*
💰 Amount: ₹{amount}
💳 Payment Details: {payment_details}

Please make the payment and confirm here:
{confirmation_url}

Thank you! 🙏`;

export default function CreateRequest() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: '',
    amount: '',
    payment_details: '',
    message_template: DEFAULT_TEMPLATE,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/payment-requests', {
        ...form,
        amount: parseFloat(form.amount),
      });
      toast.success('Payment request created!');
      navigate(`/request/${res.data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Something went wrong');
    }
  };

  // Live preview
  const preview = form.message_template
    .replace(/{name}/g, 'John Doe')
    .replace(/{title}/g, form.title || 'Birthday Gift')
    .replace(/{amount}/g, form.amount || '500')
    .replace(/{payment_details}/g, form.payment_details || 'UPI: admin@upi')
    .replace(/{confirmation_url}/g, 'https://yourapp.com/confirm/abc123');

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Create Payment Request</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. March Birthday Gift for Rahul"
                required
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹) *</label>
              <input
                type="number"
                min="1"
                step="1"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="e.g. 500"
                required
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Details * (UPI ID, Bank Account, etc.)
              </label>
              <textarea
                value={form.payment_details}
                onChange={(e) => setForm({ ...form, payment_details: e.target.value })}
                placeholder="e.g. GPay/PhonePe UPI: admin@okaxis"
                required
                rows={2}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                WhatsApp Message Template
              </label>
              <p className="text-xs text-gray-500 mb-1">
                Placeholders: {'{name}'}, {'{title}'}, {'{amount}'}, {'{payment_details}'}, {'{confirmation_url}'}
              </p>
              <textarea
                value={form.message_template}
                onChange={(e) => setForm({ ...form, message_template: e.target.value })}
                rows={10}
                className="w-full border border-gray-300 rounded-md px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 font-medium"
            >
              Create & Send to Team
            </button>
          </div>
        </form>

        {/* Message Preview */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-900">Message Preview</h2>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 whitespace-pre-wrap text-sm text-gray-800">
            {preview}
          </div>
        </div>
      </div>
    </div>
  );
}
