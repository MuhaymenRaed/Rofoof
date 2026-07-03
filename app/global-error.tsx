"use client";

// global-error replaces the ENTIRE app (including the root layout) when the
// root layout itself fails to render, so it must be fully self-contained:
// its own <html>/<body>, no imported providers, no i18n context, inline
// styles only (nothing here can depend on anything that might also be broken).

export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#F7F3EE",
          color: "#1C1208",
          fontFamily: "Tahoma, 'Segoe UI', system-ui, sans-serif",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#E8321A" }}>رفوف</div>
          <h1 style={{ marginTop: 16, fontSize: 20, fontWeight: 900 }}>حدث خطأ ما</h1>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6B5E50", maxWidth: 360 }}>
            واجهنا مشكلة غير متوقعة أثناء تحميل الموقع. حاول تحديث الصفحة.
          </p>
          <p style={{ marginTop: 4, fontSize: 13, color: "#6B5E50" }} dir="ltr">
            Something went wrong loading the site. Please try refreshing.
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              marginTop: 20,
              border: "none",
              borderRadius: 12,
              background: "#E8321A",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              padding: "10px 24px",
              cursor: "pointer",
            }}
          >
            إعادة المحاولة · Try again
          </button>
        </div>
      </body>
    </html>
  );
}
