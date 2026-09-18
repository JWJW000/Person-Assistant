const konstaConfig = require('konsta/config');

module.exports = konstaConfig({
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        'ios-bg': '#F2F2F7',
        'ios-card': '#FFFFFF',
        'ios-blue': '#007AFF'
      }
    }
  },
  plugins: [
    require('@tailwindcss/typography')
  ]
});
