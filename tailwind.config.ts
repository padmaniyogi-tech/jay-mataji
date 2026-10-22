import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f7f4ef",
        surface: "#ffffff",
        ink: {
          DEFAULT: "#17141f",
          soft: "#4b4658",
          faint: "#787287",
        },
        line: "#e5dfd4",
        brand: {
          50: "#f4f0ff",
          100: "#eae0ff",
          200: "#d6c2ff",
          300: "#b99bff",
          400: "#9a6bff",
          500: "#7c3aed",
          600: "#6b21d8",
          700: "#5817b4",
          800: "#471690",
          900: "#3a1475",
        },
        accent: {
          50: "#fff8ea",
          100: "#ffedc7",
          200: "#ffd98a",
          300: "#ffbf4d",
          400: "#ffa620",
          500: "#f5820b",
          600: "#d95f06",
          700: "#b44309",
          800: "#92350f",
          900: "#782d10",
        },
        success: { DEFAULT: "#0f9d6e", soft: "#e6f7f0" },
        warn: { DEFAULT: "#b45309", soft: "#fef3c7" },
        danger: { DEFAULT: "#c92a3d", soft: "#fdecef" },
        info: { DEFAULT: "#2563eb", soft: "#e8efff" },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        display: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(23,20,31,0.05), 0 8px 24px -12px rgba(23,20,31,0.12)",
        lift: "0 2px 4px rgba(23,20,31,0.06), 0 20px 40px -20px rgba(23,20,31,0.28)",
      },
      borderRadius: { xl2: "1.25rem" },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "pulse-soft": { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.55" } },
      },
      animation: {
        "fade-up": "fade-up .4s ease-out both",
        shimmer: "shimmer 1.6s infinite",
        "pulse-soft": "pulse-soft 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
