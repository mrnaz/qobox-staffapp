/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all of your component files.
  content: ["./app/**/*.{js,jsx,ts,tsx}"],
  // 'class' instead of the default 'media': the app themes itself via
  // ThemeContext (no `dark:` variants), and nativewind's web runtime throws
  // "Cannot manually set color scheme" on startup under the 'media' strategy.
  darkMode: "class",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {},
  },
  plugins: [],
}