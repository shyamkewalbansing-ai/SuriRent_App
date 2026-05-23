import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { useRegisterServiceWorker, InstallPrompt } from './lib/pwa';
import RotateNotice from './components/RotateNotice';
import { isMarketingHost, appUrl } from './lib/env';
import MarketingLanding from './pages/vastgoed/MarketingLanding';
import LoginPage from './pages/vastgoed/LoginPage';
import AdminDashboard from './pages/vastgoed/AdminDashboard';
import KioskLayout from './pages/vastgoed/KioskLayout';
import TenantKioskLayout from './pages/vastgoed/TenantKioskLayout';
import ContractSignPage from './pages/vastgoed/ContractSignPage';
import TenantLoginPage from './pages/vastgoed/TenantLoginPage';
import TenantDashboard from './pages/vastgoed/TenantDashboard';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-kiosk-cream">
        <div className="w-12 h-12 border-4 border-orange-200 border-t-kiosk-orange rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function MarketingRoutes() {
  // surirent.sr only serves the marketing landing.
  return (
    <Routes>
      <Route path="/" element={<MarketingLanding />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function AppRoutes() {
  // app.surirent.sr serves the kiosk + admin + tenant portal + contract sign.
  // On preview / local dev, all routes are reachable under the same domain.
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/admin/*" element={<Protected><AdminDashboard /></Protected>} />
      <Route path="/kiosk" element={<KioskLayout />} />
      <Route path="/kiosk/huurder" element={<TenantKioskLayout />} />
      <Route path="/onderteken/:token" element={<ContractSignPage />} />
      <Route path="/huurder" element={<TenantLoginPage />} />
      <Route path="/huurder/portaal" element={<TenantDashboard />} />

      {/* Legacy /vastgoed/* redirects, so old bookmarks keep working during transition. */}
      <Route path="/vastgoed" element={<Navigate to="/" replace />} />
      <Route path="/vastgoed/login" element={<Navigate to="/login" replace />} />
      <Route path="/vastgoed/admin/*" element={<Navigate to="/admin" replace />} />
      <Route path="/vastgoed/kiosk" element={<Navigate to="/kiosk" replace />} />
      <Route path="/vastgoed/kiosk/huurder" element={<Navigate to="/kiosk/huurder" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function HybridRoutes() {
  // On a single-domain deployment (preview / local), we expose both worlds:
  // - `/` shows marketing landing
  // - All app paths reachable directly (/login, /admin, /kiosk, /huurder, ...)
  return (
    <Routes>
      <Route path="/" element={<MarketingLanding />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/admin/*" element={<Protected><AdminDashboard /></Protected>} />
      <Route path="/kiosk" element={<KioskLayout />} />
      <Route path="/kiosk/huurder" element={<TenantKioskLayout />} />
      <Route path="/onderteken/:token" element={<ContractSignPage />} />
      <Route path="/huurder" element={<TenantLoginPage />} />
      <Route path="/huurder/portaal" element={<TenantDashboard />} />

      {/* Legacy /vastgoed/* redirects */}
      <Route path="/vastgoed" element={<Navigate to="/" replace />} />
      <Route path="/vastgoed/login" element={<Navigate to="/login" replace />} />
      <Route path="/vastgoed/admin/*" element={<Navigate to="/admin" replace />} />
      <Route path="/vastgoed/kiosk" element={<Navigate to="/kiosk" replace />} />
      <Route path="/vastgoed/kiosk/huurder" element={<Navigate to="/kiosk/huurder" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  useRegisterServiceWorker();
  const mode = isMarketingHost() ? 'marketing' : (appUrl() ? 'app' : 'hybrid');
  return (
    <AuthProvider>
      {mode === 'marketing' && <MarketingRoutes />}
      {mode === 'app' && <AppRoutes />}
      {mode === 'hybrid' && <HybridRoutes />}
      <InstallPrompt />
      <RotateNotice />
    </AuthProvider>
  );
}
