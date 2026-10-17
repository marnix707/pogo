/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      keyframes: {
        diceRoll: {
          '0%': { transform: 'rotate(0deg) scale(1)' },
          '25%': { transform: 'rotate(-14deg) scale(1.08) translateY(-6px)' },
          '50%': { transform: 'rotate(12deg) scale(1.04)' },
          '75%': { transform: 'rotate(-6deg) scale(1.06) translateY(-3px)' },
          '100%': { transform: 'rotate(0deg) scale(1)' },
        },
        pop: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
      animation: {
        'dice-roll': 'diceRoll 0.5s ease-in-out',
        pop: 'pop 0.18s ease-out',
        'slide-up': 'slideUp 0.22s ease-out',
      },
    },
  },
  plugins: [],
};
