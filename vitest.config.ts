import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // convex-test emulates the Convex runtime; edge-runtime matches its
    // semantics far better than plain node.
    environment: 'edge-runtime',
    server: { deps: { inline: ['convex-test'] } },
  },
})
