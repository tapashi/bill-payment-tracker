import { Link, useLocation } from 'react-router-dom';

const navItems = [
  { path: '/', label: 'Dashboard' },
  { path: '/members', label: 'Team Members' },
  { path: '/request/new', label: 'New Request' },
];

export default function Navbar({ user, onLogout }) {
  const location = useLocation();

  return (
    <nav className="bg-indigo-600 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="text-white font-bold text-xl">
            💰 Bill Payment Tracker
          </Link>
          <div className="flex items-center space-x-4">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === item.path
                    ? 'bg-indigo-800 text-white'
                    : 'text-indigo-100 hover:bg-indigo-500 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            ))}
            <span className="text-indigo-100 text-sm">{user?.email}</span>
            <button
              onClick={onLogout}
              className="px-3 py-2 rounded-md text-sm font-medium text-indigo-100 hover:bg-indigo-500 hover:text-white"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
