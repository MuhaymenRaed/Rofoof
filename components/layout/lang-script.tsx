import "server-only";

/**
 * Applies the saved language/direction during <head> parsing, so an English
 * visitor never sees a flash of RTL before hydration. next-themes handles the
 * theme the same way.
 *
 * This is a Server Component (no "use client"): the tag is emitted only in the
 * server HTML and never re-rendered on the client, which is what avoids React's
 * "Encountered a script tag while rendering React component" warning — the
 * sibling <JsonLd> server component is warning-free for the same reason.
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

export function LangScript() {
  return <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: CODE }} />;
}
