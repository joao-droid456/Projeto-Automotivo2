export default {
  // No GitHub Actions, publica no caminho do repositório.
  // Localmente, mantém o Vite na raiz para preservar npm run dev.
  base: process.env.GITHUB_ACTIONS ? '/Projeto-Automotivo2/' : '/',

  server: {
    watch: {
      ignored: ['**/.browser-*/**', '**/.npm-cache/**'],
    },
  },

  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        comparacao: 'comparacao.html',
      },
      output: {
        manualChunks(id) {
          const path = id.replaceAll('\\', '/');
          if (
            path.includes('node_modules/three/src/') ||
            path.includes('node_modules/three/build/')
          ) {
            return 'three';
          }
        },
      },
    },
    chunkSizeWarningLimit: 650,
  },
};
