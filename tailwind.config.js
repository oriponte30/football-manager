/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 900: '#06102b', 800: '#0b1a42', 700: '#12265c' },
        amber: { crt: '#ffb000', dim: '#b37b00' },
        turf: { DEFAULT: '#2fbf4a', dark: '#1d6b2c' },
        paper: { DEFAULT: '#f3ecd8', dark: '#e2d6b4', manila: '#e8cf8f' },
        crimson: '#d62839',
        desk: { DEFAULT: '#3b2a1e', light: '#5a412d' },
        slate: { board: '#2c3e38' },
      },
      fontFamily: {
        mono: ['"VT323"', '"Courier New"', 'monospace'],
        type: ['"Special Elite"', '"Courier New"', 'monospace'],
        hand: ['"Caveat"', 'cursive'],
      },
    },
  },
  plugins: [],
};
