// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import starlight from '@astrojs/starlight';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import { remarkCodeFilenames } from './src/plugins/remark-code-filenames.mjs';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone'
  }),
  markdown: {
    remarkPlugins: [remarkCodeFilenames]
  },
  integrations: [
    starlight({
      title: 'Lumen Guides',
      description: 'Guides for building Minecraft shaders with Lumen.',
      disable404Route: true,
      pagefind: false,
      pagination: true,
      tableOfContents: {
        minHeadingLevel: 2,
        maxHeadingLevel: 4
      },
      sidebar: [
        {
          label: 'Guides',
          collapsed: false,
          autogenerate: {
            directory: 'guides'
          }
        }
      ],
      customCss: ['/src/styles/starlight.css'],
      components: {
        PageFrame: './src/components/starlight/GuidePageFrame.astro',
        TwoColumnContent: './src/components/starlight/GuideTwoColumnContent.astro',
        PageTitle: './src/components/starlight/GuidePageTitle.astro',
        PageSidebar: './src/components/starlight/GuidePageSidebar.astro'
      }
    }),
    svelte()
  ],
  vite: {
    plugins: [tailwindcss()]
  }
});
