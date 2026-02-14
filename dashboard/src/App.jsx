import { Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Login from './pages/Login';
import Chat from './pages/Chat';
import Documents from './pages/Documents';
import FinanceSkills from './pages/FinanceSkills';
import HealthcareSkills from './pages/HealthcareSkills';
import Layout from './components/Layout';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const storedUser = localStorage.getItem('user');
    if (token && storedUser) {
      setIsAuthenticated(true);
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const handleLogin = (userData, token) => {
    localStorage.setItem('accessToken', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setIsAuthenticated(true);
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    localStorage.removeItem('refreshToken');
    setIsAuthenticated(false);
    setUser(null);
  };

  const handleVerticalChange = (newVertical) => {
    const updatedUser = { ...user, vertical: newVertical };
    localStorage.setItem('user', JSON.stringify(updatedUser));
    setUser(updatedUser);
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Layout user={user} onLogout={handleLogout} onVerticalChange={handleVerticalChange}>
      <Routes>
        <Route path="/" element={<Chat user={user} />} />
        <Route path="/chat" element={<Chat user={user} />} />
        <Route path="/documents" element={<Documents user={user} />} />
        <Route path="/skills" element={<FinanceSkills />} />
        <Route path="/skills/healthcare" element={<HealthcareSkills />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default App;
