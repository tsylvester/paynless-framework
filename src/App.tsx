import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ChatProvider } from './context/ChatContext';
import { SubscriptionProvider } from './context/SubscriptionContext';
import Layout from './components/layout/Layout';
import Home from './pages/Home';
import Landing from './pages/Landing';
import Profile from './pages/Profile';
import AuthCallbackPage from './pages/AuthCallbackPage';
import ResetPassword from './components/auth/ResetPassword';
import UpdatePassword from './components/auth/UpdatePassword';
import SignIn from './components/auth/SignIn';
import SignUp from './components/auth/SignUp';
import ChatHistoryPage from './pages/ChatHistoryPage';
import ChatDetailsPage from './pages/ChatDetailsPage';
import SubscriptionPage from './pages/SubscriptionPage';

function App() {
  return (
    <AuthProvider>
      <Router>
        <SubscriptionProvider>
          <ChatProvider>
            <Layout>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/home" element={<Home />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/signin" element={<SignIn />} />
                <Route path="/signup" element={<SignUp />} />
                <Route path="/history" element={<ChatHistoryPage />} />
                <Route path="/history/:eventId" element={<ChatDetailsPage />} />
                <Route path="/subscription" element={<SubscriptionPage />} />
                <Route path="/auth/callback" element={<AuthCallbackPage />} />
                <Route path="/auth/reset-password" element={<ResetPassword />} />
                <Route path="/auth/update-password" element={<UpdatePassword />} />
              </Routes>
            </Layout>
          </ChatProvider>
        </SubscriptionProvider>
      </Router>
    </AuthProvider>
  );
}

export default App;