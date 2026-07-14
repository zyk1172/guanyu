import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '观隅 Guanyu - 新闻叙事审视',
    short_name: '观隅 Guanyu',
    description: '新闻叙事审视与证据核验工具。',
    start_url: '/',
    display: 'standalone',
    background_color: '#f4ecd8',
    theme_color: '#7a4f22',
    icons: [
      {
        src: '/guanyu-icon.png',
        sizes: '1200x1200',
        type: 'image/png',
      },
    ],
  };
}
