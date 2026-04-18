import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SpeedInsights } from "@vercel/speed-insights/react"
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <SpeedInsights />
  </StrictMode>,
)

// Reveal the body once React has mounted — pairs with the
// `body { opacity: 0 }` rule in index.html to fade the main app in
// smoothly as the splash window closes.  Two requestAnimationFrames
// guarantee the first React commit has been painted before the
// transition starts, so the user never sees a flash of unstyled or
// half-rendered content.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    document.body.classList.add('app-ready');
  });
});
