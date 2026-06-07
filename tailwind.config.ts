import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './data/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        arandu: {
          red: '#9E3D2C',
          terracotta: '#B85A3C',
          wine: '#5A211D',
          paper: '#F7F0E6',
          sand: '#E6D2B8',
          wood: '#B58A62',
          coal: '#201A17',
          ink: '#2B211D'
        }
      },
      fontFamily: {
        editorial: ['Georgia', 'serif'],
        sans: ['Inter', 'Arial', 'sans-serif']
      },
      boxShadow: {
        soft: '0 24px 60px rgba(43, 33, 29, 0.10)'
      }
    }
  },
  plugins: []
};

export default config;
