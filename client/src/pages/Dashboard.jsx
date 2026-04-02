import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    api.get('/stats').then((r) => setStats(r.data));
    api.get('/payment-requests').then((r) => setRequests(r.data));
  }, []);

  if (!stats) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Team Members" value={stats.totalMembers} color="bg-blue-500" />
        <StatCard label="Active Requests" value={stats.activeRequests} color="bg-green-500" />
        <StatCard label="Total Collected" value={`₹${stats.totalCollected}`} color="bg-purple-500" />
        <StatCard label="Pending Payments" value={stats.pendingPayments} color="bg-orange-500" />
      </div>

      {/* Payment Requests List */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">Payment Requests</h2>
          <Link
            to="/request/new"
            className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700"
          >
            + New Request
          </Link>
        </div>

        {requests.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No payment requests yet. Create one to get started!
          </div>
        ) : (
          <div className="divide-y">
            {requests.map((req) => (
              <Link
                key={req.id}
                to={`/request/${req.id}`}
                className="block p-6 hover:bg-gray-50 transition-colors"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-medium text-gray-900">{req.title}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      ₹{req.amount} &middot; Created {new Date(req.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        req.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {req.is_active ? 'Active' : 'Closed'}
                    </span>
                    <span className="text-sm text-gray-600">
                      {req.paid_count}/{req.total_members} paid
                    </span>
                    <div className="w-24 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-500 rounded-full h-2"
                        style={{
                          width: `${req.total_members > 0 ? (req.paid_count / req.total_members) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className={`${color} w-10 h-10 rounded-lg flex items-center justify-center mb-3`}>
        <span className="text-white text-lg font-bold">
          {label[0]}
        </span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}
