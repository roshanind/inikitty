import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// @inikitty:inject:imports

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    {/* @inikitty:inject:providers-open */}
    <App />
    {/* @inikitty:inject:providers-close */}
  </StrictMode>,
);
