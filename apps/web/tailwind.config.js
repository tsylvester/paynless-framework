// import path from 'path';

/** @type {import('tailwindcss').Config} */

// Log the CWD to diagnose path issues
//console.log('[tailwind.config.js] CWD:', process.cwd());

export default {
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
	darkMode: "class",
	theme: {
		container: {
			center: true,
			padding: {
				DEFAULT: "1rem",
				sm: "2rem",
				lg: "4rem",
				xl: "5rem",
				"2xl": "6rem",
			},
		},
		extend: {
			colors: {
				primary: "rgb(var(--color-primary) / <alpha-value>)",
				secondary: "rgb(var(--color-secondary) / <alpha-value>)",
				background: "rgb(var(--color-background) / <alpha-value>)",
				surface: "rgb(var(--color-surface) / <alpha-value>)",
				textPrimary: "rgb(var(--color-textPrimary) / <alpha-value>)",
				textSecondary: "rgb(var(--color-textSecondary) / <alpha-value>)",
				border: "rgb(var(--color-border) / <alpha-value>)",
			},
			ringWidth: {
				DEFAULT: "3px",
			},
			ringColor: {
				DEFAULT: "rgb(var(--color-primary) / <alpha-value>)",
				primary: "rgb(var(--color-primary) / <alpha-value>)",
			},
			ringOpacity: {
				DEFAULT: "0.2",
				20: "0.2",
			},
			ringOffsetWidth: {
				DEFAULT: "2px",
			},
			ringOffsetColor: {
				DEFAULT: "var(--color-background)",
			},
			keyframes: {
				// Define the slide-up-spring animation keyframes
				slideUpSpring: {
					"0%": { transform: "translateY(100%)", opacity: "0" }, // Start fully off-screen below, transparent
					"60%": { transform: "translateY(-12%)", opacity: "1" }, // Overshoot slightly above
					"100%": { transform: "translateY(0)", opacity: "1" }, // Settle into final position, fully opaque
				},
				slideDownSpring: {
					"0%": { transform: "translateY(-100%)", opacity: "0" }, // Start fully off-screen above, transparent
					"60%": { transform: "translateY(12%)", opacity: "1" }, // Overshoot slightly below
					"100%": { transform: "translateY(0)", opacity: "1" }, // Settle into final position, fully opaque
				},
			},
			animation: {
				"slide-up-spring": "slideUpSpring 0.3s ease-out forwards", // Link keyframes to an animation class
				"slide-down-spring": "slideDownSpring 0.3s ease-out forwards", // Link keyframes to an animation class
			},
		},
	},
	plugins: [require("@tailwindcss/typography")],
};
