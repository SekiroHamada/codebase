import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import Home from './pages/Home';
import CricketDashboard from './pages/CricketDashboard';
import FootballDashboard from './pages/FootballDashboard';

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Landing Page */}
        <Route path="/" element={<Home />} />

        {/* Sport-Specific Dashboards */}
        <Route path="/cricket" element={<CricketDashboard />} />
        <Route path="/football" element={<FootballDashboard />} />
      </Routes>
    </Router>
  );
}
