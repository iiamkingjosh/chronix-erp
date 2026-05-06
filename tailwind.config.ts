import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#003366",
          dark:    "#001f3f",
          mid:     "#002a52",
          light:   "#004488",
        },
        accent: {
          DEFAULT: "#FF761B",
          hover:   "#e56615",
        },
        secondary: {
          DEFAULT: "#2472B4",
          dark:    "#1a5a8f",
        },
      },
      fontFamily: {
        orbitron:  ["Orbitron", "sans-serif"],
        helvetica: ["Helvetica Neue", "Helvetica", "Arial", "sans-serif"],
      },
      backgroundImage: {
        "primary-gradient": "linear-gradient(135deg, #001f3f 0%, #002a52 50%, #003366 100%)",
        "primary-gradient-r": "linear-gradient(to right, #001f3f 0%, #003366 100%)",
      },
      animation: {
        "fade-in":    "fadeIn 0.45s ease-out",
        "slide-up":   "slideUp 0.4s ease-out",
        "slide-right":"slideRight 0.5s ease-out",
        "pulse-glow": "pulseGlow 2.5s ease-in-out infinite",
      },
      keyframes: {
        fadeIn:     { "0%": { opacity: "0" },                                          "100%": { opacity: "1" } },
        slideUp:    { "0%": { opacity: "0", transform: "translateY(18px)" },           "100%": { opacity: "1", transform: "translateY(0)" } },
        slideRight: { "0%": { opacity: "0", transform: "translateX(-18px)" },          "100%": { opacity: "1", transform: "translateX(0)" } },
        pulseGlow:  { "0%, 100%": { boxShadow: "0 0 0 0 rgba(255,118,27,0.35)" },     "50%": { boxShadow: "0 0 0 10px rgba(255,118,27,0)" } },
      },
      boxShadow: {
        "glow-accent":  "0 0 24px rgba(255,118,27,0.25)",
        "glow-primary": "0 0 32px rgba(0,51,102,0.6)",
        "input-focus":  "0 0 0 2px rgba(255,118,27,0.4)",
      },
    },
  },
  plugins: [],
};

export default config;
