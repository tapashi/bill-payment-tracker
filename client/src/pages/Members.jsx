import { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function Members() {
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [editingId, setEditingId] = useState(null);

  const fetchMembers = () => api.get('/members').then((r) => setMembers(r.data));

  useEffect(() => {
    fetchMembers();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/members/${editingId}`, form);
        toast.success('Member updated');
      } else {
        await api.post('/members', form);
        toast.success('Member added');
      }
      setForm({ name: '', phone: '', email: '' });
      setEditingId(null);
      fetchMembers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Something went wrong');
    }
  };

  const handleEdit = (member) => {
    setEditingId(member.id);
    setForm({ name: member.name, phone: member.phone, email: member.email || '' });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this team member?')) return;
    try {
      await api.delete(`/members/${id}`);
      toast.success('Member removed');
      fetchMembers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Cannot delete');
    }
  };

  const handleSetAdmin = async (id) => {
    if (!window.confirm('Make this member the admin?')) return;
    try {
      await api.put(`/members/${id}/admin`);
      toast.success('Admin role transferred');
      fetchMembers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Something went wrong');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Team Members</h1>

      {/* Add / Edit Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">
          {editingId ? 'Edit Member' : 'Add New Member'}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="Name *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="text"
            placeholder="Phone (10 digits) *"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
            required
            className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="email"
            placeholder="Email (optional)"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex space-x-2">
            <button
              type="submit"
              className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 flex-1"
            >
              {editingId ? 'Update' : 'Add'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setForm({ name: '', phone: '', email: '' });
                }}
                className="bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Members Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {members.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                  No members yet. Add team members above.
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{m.name}</td>
                  <td className="px-6 py-4 text-gray-600">{m.phone}</td>
                  <td className="px-6 py-4 text-gray-600">{m.email || '-'}</td>
                  <td className="px-6 py-4">
                    {m.is_admin ? (
                      <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs font-medium">
                        Admin
                      </span>
                    ) : (
                      <span className="text-gray-400 text-sm">Member</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    {!m.is_admin && (
                      <button
                        onClick={() => handleSetAdmin(m.id)}
                        className="text-yellow-600 hover:text-yellow-800 text-sm"
                        title="Make Admin"
                      >
                        👑 Admin
                      </button>
                    )}
                    <button
                      onClick={() => handleEdit(m)}
                      className="text-indigo-600 hover:text-indigo-800 text-sm"
                    >
                      Edit
                    </button>
                    {!m.is_admin && (
                      <button
                        onClick={() => handleDelete(m.id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
