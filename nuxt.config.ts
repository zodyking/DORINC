import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-07-07',
  devtools: { enabled: false },

  modules: ['@pinia/nuxt', '@nuxt/eslint'],

  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  typescript: {
    strict: true,
  },

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'DORINC',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#2563eb' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'DORINC' },
        { name: 'application-name', content: 'DORINC' },
        { name: 'description', content: 'Fleet billing, service logs, and customer portal for DORINC.' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/png', href: '/images/dorinc-icon-trans.png' },
        { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/icons/icon-192.png' },
        { rel: 'apple-touch-icon', href: '/icons/icon-192.png' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'preload',
          as: 'style',
          href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap',
          media: 'print',
          onload: 'this.media=\'all\'',
        },
      ],
      noscript: [
        {
          innerHTML:
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">',
        },
      ],
    },
  },

  // Dockploy: set PORT + APP_URL only. DB/SMTP/keys come from /setup (runtime).
  // NUXT_PUBLIC_APP_URL also overrides public.appUrl at runtime if needed.
  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL ?? '',
    sessionSecret: process.env.SESSION_SECRET ?? '',
    encryptionMasterKey: process.env.ENCRYPTION_MASTER_KEY ?? '',
    smtpHost: process.env.SMTP_HOST ?? '',
    smtpPort: process.env.SMTP_PORT ?? '587',
    smtpUser: process.env.SMTP_USER ?? '',
    smtpPass: process.env.SMTP_PASS ?? '',
    smtpFrom: process.env.SMTP_FROM ?? '',
    adminBootstrapEmail: process.env.ADMIN_BOOTSTRAP_EMAIL ?? '',
    maxUploadMb: process.env.MAX_UPLOAD_MB ?? '25',
    public: {
      appUrl: process.env.APP_URL ?? 'http://localhost:3000',
    },
  },

  nitro: {
    experimental: {
      tasks: true,
    },
    esbuild: {
      options: {
        // shared/money.ts uses BigInt literals; default es2019 can break at runtime on Node 24.
        target: 'es2020',
      },
    },
  },

  hooks: {
    'pages:extend'(pages) {
      for (const page of pages) {
        if (page.meta?.layout !== 'staff') continue
        const existing = page.meta.middleware
        const list = existing
          ? (Array.isArray(existing) ? existing : [existing])
          : []
        if (!list.includes('staff-auth')) {
          page.meta.middleware = ['staff-auth', ...list]
        }
      }
    },
  },
})
