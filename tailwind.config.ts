import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#142018",
        arena: { 50: "#f0fcef", 100: "#dcf8d9", 200: "#bdf2b7", 300: "#91e88c", 500: "#5bd75f", 600: "#2eaa45", 700: "#187532" },
      },
      boxShadow: { card: "0 16px 45px rgba(20, 32, 24, 0.08)" },
      fontFamily: { display: ["Arial Narrow", "Roboto Condensed", "Arial", "sans-serif"] },
    },
  },
  plugins: [],
} satisfies Config;
