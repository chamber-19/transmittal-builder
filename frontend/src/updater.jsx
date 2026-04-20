/**
 * updater.jsx — Thin mount for the framework Updater component.
 *
 * The full Updater implementation lives in @chamber-19/desktop-toolkit v2.0.0.
 * This file is a 3-line wrapper that mounts it in the Tauri updater window.
 *
 * Verify export path with framework package.json `exports` field at v2.0.0.
 */

import { createRoot } from "react-dom/client";
import { Updater } from "@chamber-19/desktop-toolkit/updater";

createRoot(document.getElementById("root")).render(<Updater />);
