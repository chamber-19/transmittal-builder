import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { showOnReady } from "@chamber-19/desktop-toolkit/window/showOnReady"
import { ActivationGate } from "@chamber-19/desktop-toolkit/activation"
import App from './App.jsx'

// PIN enforcement is intentionally opt-in at build time so local dev and
// coding-agent sessions are never blocked by activation flows.
const enforcePinActivation =
  typeof __ENFORCE_PIN_ACTIVATION__ !== 'undefined' &&
  __ENFORCE_PIN_ACTIVATION__;

const rootApp = enforcePinActivation ? (
  <ActivationGate>
    <App />
  </ActivationGate>
) : (
  <App />
);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {rootApp}
  </StrictMode>,
)

// Reveal the main window after the React tree has committed its first frame.
// Without this, the window stays invisible — the visible:false in tauri.conf.json
// is intentional to prevent white flash on launch.
showOnReady();

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
