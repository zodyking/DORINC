<script setup lang="ts">
import { ENTITY_REF_TOKEN_RE, entityPathForMessageLink } from '~/utils/messages-ui'
import type { MessageEntityType } from '~/server/db/schema/messages'

const props = defineProps<{
  body: string
}>()

const auth = useAuthStore()

function linkPath(entityType: MessageEntityType, entityId: string): string {
  if (!auth.loaded) return `/`
  return entityPathForMessageLink(entityType, entityId, { can: key => auth.can(key) })
}

interface MessagePart {
  kind: 'text' | 'ref'
  value: string
  entityType?: MessageEntityType
  entityId?: string
}

const parts = computed<MessagePart[]>(() => {
  const result: MessagePart[] = []
  const re = new RegExp(ENTITY_REF_TOKEN_RE.source, 'gi')
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(props.body)) !== null) {
    if (match.index > lastIndex) {
      result.push({ kind: 'text', value: props.body.slice(lastIndex, match.index) })
    }
    result.push({
      kind: 'ref',
      value: match[3]!,
      entityType: match[1] as MessageEntityType,
      entityId: match[2]!,
    })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < props.body.length) {
    result.push({ kind: 'text', value: props.body.slice(lastIndex) })
  }

  return result.length ? result : [{ kind: 'text', value: props.body }]
})
</script>

<template>
  <span class="dm-msg-text">
    <template v-for="(part, i) in parts" :key="i">
      <span v-if="part.kind === 'text'">{{ part.value }}</span>
      <NuxtLink
        v-else
        :to="linkPath(part.entityType!, part.entityId!)"
        class="dm-entity-link"
      >
        {{ part.value }}
      </NuxtLink>
    </template>
  </span>
</template>
