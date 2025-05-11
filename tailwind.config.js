/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // Windows Fluent UI colors
      colors: {
        'windows-blue': '#0078D4',
        'windows-light': '#F3F2F1',
        'windows-dark': '#323130',
        'windows-accent': '#0078D4',
      },
      // Windows-specific spacing
      spacing: {
        'win-sm': '4px',
        'win-md': '8px',
        'win-lg': '12px',
        'win-xl': '16px',
        'win-2xl': '20px',
        'win-3xl': '24px',
      },
    },
  },
  plugins: [],
};
