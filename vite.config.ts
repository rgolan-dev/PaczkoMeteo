import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import process from 'node:process';

export default defineConfig({
	server: { proxy: { '/api/inpost': `http://127.0.0.1:${process.env.PACZKOMETEO_API_PORT || 8787}` } },
	preview: { proxy: { '/api/inpost': `http://127.0.0.1:${process.env.PACZKOMETEO_API_PORT || 8787}` } },
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		})
	]
});
