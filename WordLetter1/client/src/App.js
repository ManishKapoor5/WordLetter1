import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Home from './components/Home';
import Editor from './components/Editor';
import Navbar from './components/Navbar';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for access token in URL parameters or localStorage
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    
    if (accessToken) {
      // Store tokens
      localStorage.setItem('accessToken', accessToken);
      if (refreshToken) {
        localStorage.setItem('refreshToken', refreshToken);
      }
      
      // Clean URL
      window.history.replaceState({}, document.title, '/');
      
      // Get user info
      fetchUserInfo(accessToken);
    } else {
      // Check if we already have an access token
      const storedToken = localStorage.getItem('accessToken');
      if (storedToken) {
        fetchUserInfo(storedToken);
      } else {
        setLoading(false);
      }
    }
  }, []);

  const fetchUserInfo = async (accessToken) => {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch user info');
      }
      
      const userData = await response.json();
      setUser({
        id: userData.sub,
        name: userData.name,
        email: userData.email,
        picture: userData.picture
      });
    } catch (error) {
      console.error('Error fetching user info:', error);
      // Clear invalid token
      localStorage.removeItem('accessToken');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <Router>
      <div className="app">
        <Navbar user={user} onLogout={handleLogout} />
        <div className="container">
          <Routes>
            <Route path="/login" element={
              user ? <Navigate to="/" /> : <Login />
            } />
            <Route path="/" element={
              user ? <Home user={user} /> : <Navigate to="/login" />
            } />
            <Route path="/editor" element={
              user ? <Editor user={user} /> : <Navigate to="/login" />
            } />
            <Route path="/editor/:id" element={
              user ? <Editor user={user} /> : <Navigate to="/login" />
            } />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;