import "server-only";

/**
 * Renders a JSON-LD block for search engines. Rendered from a Server Component
 * (never a Client one), so there's no hydration/"script tag in a React render"
 * problem — this is the pattern the Next.js docs recommend.
 *
 * Security: JSON.stringify does NOT make a payload safe to drop into HTML. A
 * value containing `</script>` (or an HTML tag) would break out of the block
 * and enable XSS. We scrub the three characters that matter — `<`, `>` and `&`
 * — into their JSON unicode escapes, which are equivalent inside a JSON string
 * but inert as HTML.
 */
function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(data) }} />
  );
}
