import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return <main>Co-Sign Security Console</main>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
