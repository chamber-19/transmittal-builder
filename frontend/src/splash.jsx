/**
 * splash.jsx — Thin mount for the framework Splash component.
 *
 * The full Splash implementation lives in @chamber-19/desktop-toolkit v2.0.0.
 * This file is a 3-line wrapper that mounts it in the Tauri splash window.
 *
 * If the framework's Splash component accepts configuration props (e.g.
 * appName, appOrg), pass them here. Verify export path with framework
 * package.json `exports` field at v2.0.0.
 */

import { createRoot } from "react-dom/client";
import { Splash } from "@chamber-19/desktop-toolkit/splash";

createRoot(document.getElementById("root")).render(<Splash />);
