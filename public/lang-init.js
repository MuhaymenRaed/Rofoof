/**
 * Applies the saved language/direction before first paint so English users
 * never see a flash of RTL. Kept out of the React tree deliberately: a
 * <script> rendered by a component is never executed on a client render
 * (React warns about it), and next-themes already handles the theme.
 */
(function () {
  try {
    var l = localStorage.getItem("rofoof.lang") || "ar";
    document.documentElement.lang = l;
    document.documentElement.dir = l === "ar" ? "rtl" : "ltr";
  } catch (e) {}
})();
