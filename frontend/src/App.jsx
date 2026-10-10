import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

// We will create these files next
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import LiveMatch from './pages/LiveMatch';
import PlayerProfiles from './pages/PlayerProfiles';

export default function App() {
  return (
    <Router>
      <div style={{ display: 'flex', height: '100vh', backgroundColor: '#121212', color: '#ffffff' }}>
        
        {/* High-Contrast UI Sidebar persists across all pages */}
        <Sidebar />

        {/* Main Content Area */}
        <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/live" element={<LiveMatch />} />
            <Route path="/profiles" element={<PlayerProfiles />} />
          </Routes>
        </div>
        
      </div>
    </Router>
  );
}