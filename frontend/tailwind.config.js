/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        kiosk: {
          orange: '#FF5C00',
          orangeHover: '#E65300',
          orangeDeep: '#C74600',
          orangeLight: '#FF8A3D',
          cream: '#FFF7F0',
          warmSurface: '#FFFBF5',
        },
      },
    },
  },
  plugins: [],
};
