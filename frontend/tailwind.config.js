/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Override Tailwind's default `orange` palette so utility classes
        // like `bg-orange-500` / `text-orange-500` use the brand color
        // (#FF5C00) and not Tailwind's default #F97316. Keeps the rest of
        // the orange ramp intact for hover / disabled / accent shades.
        orange: {
          50: '#FFF7F0',
          100: '#FFE9D6',
          200: '#FFD1A8',
          300: '#FFB774',
          400: '#FF8A3D',
          500: '#FF5C00',
          600: '#E65300',
          700: '#C74600',
          800: '#A23A00',
          900: '#7A2C00',
        },
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
