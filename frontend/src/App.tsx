import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TimeLogProvider } from './contexts/TimeLogContext';
import LoginForm from './components/LoginForm';
import AccountSetup from './components/AccountSetup';
import Header from './components/Header';
import Footer from './components/Footer';
import PunchControl from './components/PunchControl';
import TimeLogTable from './components/TimeLogTable';
import UserSummary from './components/UserSummary';
import AdminPortal from './components/AdminPortal';
import UserDetails from './components/UserDetails';
import UserSettings from './components/UserSettings';

const AppContent: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const [showAccountSetup, setShowAccountSetup] = useState(false);

  const location = useLocation();

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex flex-col">
        <div className="flex-1 flex items-center justify-center p-4">
          <Routes>
            <Route path="/setup" element={<AccountSetup onCancel={() => window.location.replace('/login')} />} />
            <Route path="/login" element={<LoginForm onToggleSetup={() => window.location.replace('/setup')} />} />
            <Route path="*" element={<LoginForm onToggleSetup={() => window.location.replace('/setup')} />} />
          </Routes>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      
      <main className="flex-1">
        <Routes>
          <Route path="/" element={
            <TimeLogProvider>
              <div className="container-md py-8 space-y-8">
                {/* Quick Actions Card */}
                <div className="card animate-fade-in">
                  <div className="card-body">
                    <PunchControl />
                  </div>
                </div>

                {/* User Summary */}
                <div className="animate-slide-up">
                  <UserSummary />
                </div>
                
                {/* Time Entries */}
                <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
                  <TimeLogTable />
                </div>
              </div>
            </TimeLogProvider>
          } />
          
          <Route path="/settings" element={<UserSettings />} />
          
          <Route path="/admin" element={
            (user?.isAdmin || user?.isSuperUser) ? <AdminPortal /> : <Navigate to="/" replace />
          } />
          <Route path="/admin/users/:id" element={
            (user?.isAdmin || user?.isSuperUser) ? <UserDetails /> : <Navigate to="/" replace />
          } />
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      
      <Footer />
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}

export default App;
