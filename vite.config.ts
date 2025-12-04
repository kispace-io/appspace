import { defineConfig } from 'vite';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import path from 'path';
import dts from 'vite-plugin-dts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const isExternal = (id: string): boolean => {
  if (id.startsWith('./') || id.startsWith('../')) {
    return false;
  }
  if (path.isAbsolute(id) && id.includes('/src/')) {
    return false;
  }
  return true;
};

export default defineConfig({
  worker: {
    format: 'es',
  },
  plugins: [
    dts({
      outDir: 'dist',
      entryRoot: 'src',
      rollupTypes: false,
      tsconfigPath: path.resolve(__dirname, 'tsconfig.build.json'),
    }),
  ],
  build: {
    lib: {
      entry: {
        index: path.resolve(__dirname, 'src/index.ts'),
        'api/index': path.resolve(__dirname, 'src/api/index.ts'),
        'extensions/ai-system/index': path.resolve(__dirname, 'src/extensions/ai-system/index.ts'),
        'extensions/rag-system/index': path.resolve(__dirname, 'src/extensions/rag-system/index.ts'),
        'extensions/in-browser-ml/index': path.resolve(__dirname, 'src/extensions/in-browser-ml/index.ts'),
        'extensions/github-service/github-service': path.resolve(__dirname, 'src/extensions/github-service/github-service.ts'),
        'widgets/index': path.resolve(__dirname, 'src/widgets/index.ts'),
        'parts/index': path.resolve(__dirname, 'src/parts/index.ts'),
        'externals/webawesome': path.resolve(__dirname, 'src/externals/webawesome.ts'),
        'externals/lit': path.resolve(__dirname, 'src/externals/lit.ts'),
        'externals/third-party': path.resolve(__dirname, 'src/externals/third-party.ts'),
        'core/events': path.resolve(__dirname, 'src/core/events.ts'),
      },
      formats: ['es'],
      fileName: (format, entryName) => {
        return `${entryName}.js`;
      },
    },
    rollupOptions: {
      external: isExternal,
      output: {
        preserveModules: false,
        entryFileNames: '[name].js',
        format: 'es',
      },
    },
    outDir: 'dist',
    sourcemap: true,
    minify: false,
  },
});

