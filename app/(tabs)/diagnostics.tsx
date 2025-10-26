/**
 * @fileoverview Diagnostics Tab - A wrapper for the main Diagnostics Screen.
 *
 * This file serves as a simple entry point for the Diagnostics screen within the
 * tab navigation layout. It re-exports the main `DiagnosticsScreen` component,
 * allowing it to be included as a tab while keeping the main component file
 * independent of the tab navigator's structure.
 *
 * This approach promotes better code organization by separating the screen's
 * content and logic from its specific placement within a navigator.
 *
 * @see DiagnosticsScreen for the actual implementation of the screen.
 * @see (tabs)/_layout.tsx for how this component is used in the tab navigator.
 */

import DiagnosticsScreen from "@/app/diagnostics";

export default DiagnosticsScreen;
