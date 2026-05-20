import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import MarketingLanding from './pages/vastgoed/MarketingLanding';
import LoginPage from './pages/vastgoed/LoginPage';
import AdminDashboard from './pages/vastgoed/AdminDashboard';
import KioskLayout from './pages/vastgoed/KioskLayout';
import ContractSignPage from './pages/vastgoed/ContractSignPage';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-kiosk-cream">
        <div className="w-12 h-12 border-4 border-orange-200 border-t-kiosk-orange rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/vastgoed/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/vastgoed" replace />} />
        <Route path="/vastgoed" element={<MarketingLanding />} />
        <Route path="/vastgoed/login" element={<LoginPage />} />
        <Route path="/vastgoed/admin/*" element={<Protected><AdminDashboard /></Protected>} />
        <Route path="/vastgoed/kiosk" element={<KioskLayout />} />
        <Route path="/onderteken/:token" element={<ContractSignPage />} />
        <Route path="*" element={<Navigate to="/vastgoed" replace />} />
      </Routes>
    </AuthProvider>
  );
}
