/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Gruvbox color palette
        gruvbox: {
          // Background levels
          bg0: '#282828',     // darkest background
          bg1: '#3c3836',     // secondary background
          bg2: '#504945',     // tertiary background
          bg3: '#665c54',     // quaternary background  
          bg4: '#7c6f64',     // lightest background
          
          // Foreground levels
          fg0: '#fbf1c7',     // brightest foreground
          fg1: '#ebdbb2',     // primary foreground
          fg2: '#d5c4a1',     // secondary foreground
          fg3: '#bdae93',     // tertiary foreground
          fg4: '#a89984',     // darkest foreground
          
          // Bright colors
          red: '#fb4934',
          'bright-red': '#fb4934',
          green: '#b8bb26', 
          'bright-green': '#b8bb26',
          yellow: '#fabd2f',
          'bright-yellow': '#fabd2f',
          blue: '#83a598',
          'bright-blue': '#83a598',
          purple: '#d3869b',
          'bright-purple': '#d3869b',
          aqua: '#8ec07c',
          'bright-aqua': '#8ec07c',
          orange: '#fe8019',
          'bright-orange': '#fe8019',
          
          // Neutral colors
          gray: '#928374',
          
          // Faded colors (backwards compatibility)
          'red-dim': '#cc241d',
          'green-dim': '#98971a',
          'yellow-dim': '#d79921',
          'blue-dim': '#458588',
          'purple-dim': '#b16286',
          'aqua-dim': '#689d6a',
          'orange-dim': '#d65d0e',
          
          // Legacy names (backwards compatibility)
          dark0: '#282828',
          dark1: '#3c3836',
          dark2: '#504945',
          dark3: '#665c54',
          dark4: '#7c6f64',
          light0: '#fbf1c7',
          light1: '#ebdbb2',
          light2: '#d5c4a1',
          light3: '#bdae93',
          light4: '#a89984',
        },
        // Keep original orange for compatibility
        orange: {
          500: '#F34E3F',
          100: '#F34E3F20',
        },
      },
      fontFamily: {
        sans: ['PolySans', 'system-ui', 'sans-serif'],
        header: ['Jen Wagner Co', 'serif'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
