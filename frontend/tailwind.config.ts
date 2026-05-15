import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        mist: "#e5eef8",
        accent: "#1d4ed8",
        ember: "#ea580c",
        leaf: "#15803d",
      },
      fontFamily: {
        sans: ["Avenir Next", "Helvetica Neue", "sans-serif"],
      },
      boxShadow: {
        float: "0 24px 80px rgba(15, 23, 42, 0.18)",
      },
    },
  },
  plugins: [],
} satisfies Config;
