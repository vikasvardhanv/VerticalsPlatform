import { Link, useLocation, useNavigate } from 'react-router-dom';

function Layout({ children, user, onLogout, onVerticalChange }) {
  const location = useLocation();
  const navigate = useNavigate();

  const isHealthcare = user?.vertical === 'healthcare';

  const navItems = [
    { path: '/chat', label: 'Chat', icon: '💬' },
    { path: '/documents', label: 'Documents', icon: '📄' },
    {
      path: isHealthcare ? '/skills/healthcare' : '/skills',
      label: isHealthcare ? 'Healthcare Skills' : 'Finance Skills',
      icon: isHealthcare ? '🏥' : '🏦'
    },
  ];

  const brandName = isHealthcare ? 'MediGuard AI' : 'FinSecure AI';
  const brandIcon = isHealthcare ? '🏥' : '🔐';

  const toggleVertical = () => {
    const newVertical = isHealthcare ? 'finance' : 'healthcare';
    onVerticalChange(newVertical);

    // If on a skills page, navigate to the other vertical's skills page
    if (location.pathname.startsWith('/skills')) {
      navigate(newVertical === 'healthcare' ? '/skills/healthcare' : '/skills');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-8">
              <Link to="/" className="flex items-center gap-2">
                <span className="text-2xl">{brandIcon}</span>
                <span className="font-bold text-xl text-gray-900">{brandName}</span>
              </Link>
              <nav className="flex gap-1">
                {navItems.map(item => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition ${location.pathname === item.path
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-100'
                      }`}
                  >
                    {item.icon} {item.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center bg-gray-100 p-1 rounded-lg border border-gray-200">
                <button
                  onClick={() => {
                    if (user?.vertical !== 'finance') {
                      onVerticalChange('finance');
                      if (location.pathname.startsWith('/skills')) navigate('/skills');
                    }
                  }}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition ${!isHealthcare ? 'bg-white shadow-sm text-primary-700' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  🏦 Finance
                </button>
                <button
                  onClick={() => {
                    if (user?.vertical !== 'healthcare') {
                      onVerticalChange('healthcare');
                      if (location.pathname.startsWith('/skills')) navigate('/skills/healthcare');
                    }
                  }}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition ${isHealthcare ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  🏥 Healthcare
                </button>
              </div>
              <div className="h-6 w-px bg-gray-200"></div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700">{user?.email}</span>
                <button
                  onClick={onLogout}
                  className="p-1 px-3 text-sm text-red-600 font-medium hover:bg-red-50 rounded-lg transition"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}

export default Layout;
