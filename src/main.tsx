import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress known benign Vite WebSocket unhandled rejection in the AI Studio environment
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && event.reason.message === 'WebSocket closed without opened.') {
    event.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
