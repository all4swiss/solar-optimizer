import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        solar: {
          50:  "#fff8e1",
          100: "#ffecb3",
          500: "#ff9800",
          600: "#fb8c00",
        },
        brand: {
          navy:    "#0f172a",
          sky:     "#0ea5e9",
          emerald: "#10b981",
        },
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "spin-slow":  "spin 3s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
