/**
 * splash.jsx — Side-effect entry that loads the framework Splash.
 *
 * @chamber-19/desktop-toolkit/splash is a self-mounting script: importing it
 * for side effect causes it to call createRoot(#root).render(<SplashApp />).
 *
 * Optional configuration (appName, appOrg) is read by the framework from
 * window.__SPLASH_CONFIG__, which is set inline by splash.html before this
 * module loads.
 */

import "@chamber-19/desktop-toolkit/splash";
