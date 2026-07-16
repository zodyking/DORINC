<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <ClientOnly>
    <AuthSessionTimeoutOverlay />
  </ClientOnly>
</template>
