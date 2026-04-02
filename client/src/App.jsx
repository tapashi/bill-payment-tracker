import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import api from './services/api';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Members from './pages/Members';
import CreateRequest from './pages/CreateRequest';
import RequestDetails from './pages/RequestDetails';
import ConfirmPayment from './pages/ConfirmPayment';
import Login from './pages/Login';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/auth/me')
      .then((r) => setUser(r.data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    await api.post('/auth/logout');
    setUser(null);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>;
  }

  return (
    <>
      <Toaster position="top-right" />
      <Routes>
        {/* Public route - no navbar */}
        <Route path="/confirm/:token" element={<ConfirmPayment />} />

        {/* Admin routes with navbar */}
        <Route
          path="*"
          element={
            user ? (
              <>
                <Navbar user={user} onLogout={handleLogout} />
                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/members" element={<Members />} />
                    <Route path="/request/new" element={<CreateRequest />} />
                    <Route path="/request/:id" element={<RequestDetails />} />
                  </Routes>
                </main>
              </>
            ) : (
              <Login onLogin={setUser} />
            )
          }
        />
      </Routes>
    </>
  );
}
