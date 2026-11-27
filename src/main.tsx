import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initServiceWorker } from './lib/pwa';

const cleanupSW = initServiceWorker();
if (typeof window !== 'undefined') {
  window.addEventListener('unload', cleanupSW, { once: true });
}

createRoot(document.getElementById('root')!).render(<App />);

