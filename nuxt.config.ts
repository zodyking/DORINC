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
      title: 'DORINC Suite',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap',
        },
      ],
    },
  },

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
  },
})
