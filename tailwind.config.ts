import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17201b",
        arena: { 50: "#effcf3", 100: "#d8f7e2", 500: "#24a85a", 600: "#168a46", 700: "#116c38" },
      },
      boxShadow: { card: "0 12px 35px rgba(23, 32, 27, 0.07)" },
    },
  },
  plugins: [],
} satisfies Config;
