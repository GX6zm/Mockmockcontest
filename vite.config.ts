import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// 自定义开局（OP 模式）已正式并入主版本；动效模式默认满血，支持页面内随时切静帧
const motion = process.env.MOTION === '0' ? 'static' : 'full';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'oi-sim-build-markers',
      transformIndexHtml(html) {
        let out = html.replace(/data-motion="[^"]*"/, `data-motion="${motion}"`);
        const markers = [
          `<!-- MOTION_BUILD:${motion} -->`,
          '<!-- OPV_BUILD_MARKER -->',
        ].join('\n    ');
        out = out.replace('</head>', `    ${markers}\n  </head>`);
        return out;
      },
    },
  ],
  define: {
    __OPV__: JSON.stringify(true),
  },
  server: {
    port: 3000,
  },
});
