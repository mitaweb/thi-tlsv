import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ocean: {
          50: "#ebfaff",
          100: "#cef2ff",
          200: "#9ce5ff",
          300: "#5ed3ff",
          400: "#22bff7",
          500: "#06a8df",
          600: "#0286b8",
          700: "#076a92",
          800: "#0c5675",
          900: "#0f4862",
        },
      },
      fontFamily: {
        sans: ["system-ui", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
