"use client";

import { memo } from "react";

/**
 * Applies the saved language/direction during <head> parsing, so an English
 * visitor never sees a flash of RTL before hydration. next-themes handles the
 * theme the same way.
 *
 * Why memo: React never executes a <script> during a *client* render and logs
 * "Encountered a script tag while rendering React component" when it meets
 * one. Cache Components re-renders the root layout on the client (via
 * <Activity>), which would trip that. Memoized with no props, this component
 * renders exactly once — on the server — so the tag only ever reaches the
 * initial HTML. This mirrors how next-themes injects its own no-flash script.
 */
const CODE = `
(function () {
  try {
    var l = localStorage.getItem('rofoof.lang') || 'ar';
    document.documentElement.lang = l;
    document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
  } catch (e) {}
})();
`;

export const LangScript = memo(function LangScript() {
  return <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: CODE }} />;
});
