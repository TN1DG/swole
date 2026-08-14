import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Two suites with genuinely different needs, so they are separate projects
// rather than one config with an environment override.
//
//   - convex/  runs against convex-test, which emulates the Convex runtime.
//     edge-runtime matches its semantics far better than plain node.
//   - src/     renders React, which needs a DOM.
//
// `npx vitest run` runs both; `npx vitest run --project ui` runs one.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'convex',
          environment: 'edge-runtime',
          include: ['convex/**/*.test.ts'],
          server: { deps: { inline: ['convex-test'] } },
        },
      },
      {
        // Component tests only. jsdom and the React plugin are the expensive
        // part of this config, so they are scoped to the `.tsx` files that
        // actually render something — the `.ts` logic tests below are plain
        // functions and were paying for a DOM they never touched.
        plugins: [react()],
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./src/test/setup.ts'],
        },
      },
      {
        test: {
          name: 'logic',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        // vercel-headers.test.ts sits at the repo root and reads vercel.json
        // off disk, so it belongs to neither suite above. It needs a project
        // of its own or the explicit `include`s silently drop it — which they
        // did on the first attempt at this split.
        test: {
          name: 'root',
          environment: 'node',
          include: ['*.test.ts'],
        },
      },
    ],
  },
})
