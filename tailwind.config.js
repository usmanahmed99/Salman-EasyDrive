/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Warm near-black used by easydriving.ca hero / nav sections.
        ink: "#14100F",
        // easydriving.ca brand orange-red (#ef4423 / #f03c02) expressed as a scale.
        brand: {
          50: "#FFF3EF",
          100: "#FFE2D8",
          200: "#FFC3AE",
          300: "#FB9A78",
          400: "#F4663D",
          500: "#EF4423",
          600: "#F03C02",
          700: "#C42F02",
          800: "#9A2705",
          900: "#581601",
          950: "#350D00"
        },
        // Warm cream surface used across the site instead of cool grey.
        cream: "#F6F3F2",
        clay: "#4D4643",
        sun: "#FFE066"
      },
      boxShadow: {
        soft: "0 18px 55px -25px rgba(53, 13, 0, 0.30)",
        card: "0 10px 35px -20px rgba(53, 13, 0, 0.22)"
      },
      fontFamily: {
        sans: ["Open Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        heading: ["Muli", "Mulish", "Open Sans", "ui-sans-serif", "sans-serif"]
      }
    }
  },
  plugins: []
};
