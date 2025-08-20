/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        orange: {
          500: '#F34E3F',
          100: '#F34E3F20',
        },
        blue: {
          50: '#00A0C820',
          100: '#00A0C830',
          200: '#00A0C840',
          500: '#00A0C8',
          600: '#00A0C8',
          700: '#008AAE',
          800: '#007494',
          900: '#005E7A',
        },
      },
      fontFamily: {
        sans: ['PolySans', 'system-ui', 'sans-serif'],
        header: ['Jen Wagner Co', 'serif'],
      },
    },
  },
  plugins: [],
}
