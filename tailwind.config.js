/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        radar: {
          dark: '#0B0F17',
          card: '#131A26',
          border: '#1E293B',
          accent: '#F59E0B',
          gold: '#EAB308',
          success: '#10B981',
          danger: '#EF4444'
        }
      },
      fontFamily: {
        sans: ['Cairo', 'Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
