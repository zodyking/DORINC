// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    ignores: ['Agent-Files/**'],
  },
  {
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },
)
