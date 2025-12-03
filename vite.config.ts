import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 5173,
		strictPort: false
	},
	ssr: {
		external: ['playwright', 'chalk', 'ora', 'commander']
	},
	build: {
		rollupOptions: {
			external: ['playwright', 'chalk', 'ora', 'commander']
		}
	}
});
