import next from "eslint-config-next";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...next,
  ...nextTs,
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "coverage/**"] },
  {
    rules: {
      // صور ثابتة صغيرة: لا حاجة لمحسّن الصور (ويضيف style مضمّن يتعارض مع CSP)
      "@next/next/no-img-element": "off",
      // الخروج وانتهاء الجلسة يعيدان تحميل الصفحة بالكامل عمداً (لمسح أي حالة في الذاكرة)
      "@next/next/no-location-assign-relative-destination": "off",
    },
  },
];

export default config;
