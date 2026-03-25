import typography from '@tailwindcss/typography';
import animate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./content/**/*.{md,mdx}",
    
    // FAIL-SAFE: Check both local and root node_modules for Fumadocs
    "./node_modules/fumadocs-ui/dist/**/*.js",
    "../../node_modules/fumadocs-ui/dist/**/*.js",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "Arimo", "Arial", "Helvetica", "sans-serif"],
        mono: ["var(--font-mono)", "Azeret Mono", "ui-monospace", "monospace"],
        heading: ["var(--font-heading)", "APK Futural", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [
    typography,
    animate,
  ],
};