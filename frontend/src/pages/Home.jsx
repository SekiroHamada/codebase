import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();

  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    width: '100%',
    textAlign: 'center'
  };

  const buttonContainerStyle = {
    display: 'flex',
    gap: '20px',
    marginTop: '30px'
  };

  const buttonStyle = {
    padding: '20px 40px',
    fontSize: '1.2rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    backgroundColor: '#3b82f6', // High-contrast blue
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    transition: 'background-color 0.3s'
  };

  return (
    <div style={containerStyle}>
      <h1>Select Sport Context</h1>
      <p>Initialize the causal ML inference engine for live match tracking.</p>
      
      <div style={buttonContainerStyle}>
        <button 
          style={buttonStyle} 
          onClick={() => navigate('/cricket')}
        >
          Cricket
        </button>
        <button 
          style={buttonStyle} 
          onClick={() => navigate('/football')}
        >
          Football
        </button>
      </div>
    </div>
  );
}