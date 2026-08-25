<script setup lang="ts">
import { isDiscountedMoney } from '#shared/invoice-discount'
import { moneyDisplay } from '~/utils/invoices-ui'

const props = defineProps<{
  original: string
  current: string
}>()

const discounted = computed(() => {
  const original = props.original || props.current
  const current = props.current || props.original
  if (!original || !current) return false
  return isDiscountedMoney(original, current)
})
</script>

<template>
  <span class="price-stack">
    <template v-if="discounted">
      <span class="price-was">{{ moneyDisplay(original) }}</span>
      <span class="price-now">{{ moneyDisplay(current) }}</span>
    </template>
    <span v-else>{{ moneyDisplay(current || original || '0') }}</span>
  </span>
</template>
