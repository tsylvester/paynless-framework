import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ChatProvider } from './context/ChatContext';
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

function App() {
  return (
    <AuthProvider>
      <ChatProvider>
        <Router>
          <Layout>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/home" element={<Home />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/signin" element={<SignIn />} />
              <Route path="/signup" element={<SignUp />} />
              <Route path="/history" element={<ChatHistoryPage />} />
              <Route path="/history/:eventId" element={<ChatDetailsPage />} />
              <Route path="/auth/callback" element={<AuthCallbackPage />} />
              <Route path="/auth/reset-password" element={<ResetPassword />} />
              <Route path="/auth/update-password" element={<UpdatePassword />} />
            </Routes>
          </Layout>
        </Router>
      </ChatProvider>
    </AuthProvider>
  );
}

export default App;