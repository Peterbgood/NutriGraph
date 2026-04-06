import React from 'react';
import ReactDOM from 'react-dom/client';
import CalorieTracker from './CalorieTracker';
import './index.css'; // This must be present for Tailwind styles to load

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CalorieTracker />
  </React.StrictMode>,
);