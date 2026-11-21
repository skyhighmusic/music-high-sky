import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Tier 1 Google Maps Platform Demo Key Quota Defense
const notifyGmpQuota = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};

const prevAuthFailure = (window as unknown as { gm_authFailure?: () => void }).gm_authFailure;
(window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
  notifyGmpQuota();
  if (typeof prevAuthFailure === 'function') prevAuthFailure();
};

const origConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  origConsoleError(...args);
  try {
    const joined = args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ');
    if (
      joined.includes('OverQuotaMapError') ||
      joined.includes('QuotaExceededError') ||
      joined.includes('OVER_QUERY_LIMIT')
    ) {
      notifyGmpQuota();
    }
  } catch {
    // ignore serialization errors
  }
};

createRoot(document.getElementById('root')!).render(<App />);
