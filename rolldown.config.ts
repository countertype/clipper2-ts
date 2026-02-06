import { defineConfig } from 'rolldown';

export default defineConfig({
  input: 'src/index.ts',
  platform: 'neutral',
  output: {
    file: 'dist/clipper2.min.mjs',
    format: 'esm',
    minify: true,
    sourcemap: true,
  },
});
