#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const outDir = join(process.cwd(), 'public/pwa-guide')
mkdirSync(outDir, { recursive: true })

function phoneFrame(content, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 420" role="img" aria-hidden="true">
  <title>${label}</title>
  <rect x="20" y="10" width="280" height="400" rx="28" fill="#111827" />
  <rect x="28" y="24" width="264" height="372" rx="20" fill="#f8fafc" />
  <rect x="118" y="16" width="84" height="8" rx="4" fill="#374151" />
  ${content}
</svg>`
}

function desktopFrame(content, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 220" role="img" aria-hidden="true">
  <title>${label}</title>
  <rect x="20" y="12" width="320" height="180" rx="10" fill="#e2e8f0" />
  <rect x="28" y="20" width="304" height="24" rx="6" fill="#fff" stroke="#cbd5e1" />
  <rect x="28" y="48" width="304" height="136" rx="6" fill="#fff" />
  ${content}
</svg>`
}

function highlight(x, y, w, h, r = 8) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="#6366f1" stroke-width="3" stroke-dasharray="6 4" />
  <rect x="${x - 4}" y="${y - 4}" width="${w + 8}" height="${h + 8}" rx="${r + 4}" fill="#6366f1" opacity="0.12" />`
}

const files = {
  'ios-safari-open.svg': phoneFrame(`
  <rect x="40" y="44" width="240" height="28" rx="8" fill="#fff" stroke="#cbd5e1" />
  <text x="52" y="62" font-family="system-ui,sans-serif" font-size="11" fill="#64748b">safari</text>
  <text x="52" y="92" font-family="system-ui,sans-serif" font-size="12" fill="#0f172a">dorinc.app</text>
  <rect x="40" y="108" width="240" height="220" rx="10" fill="#eef2ff" />
  <text x="130" y="220" font-family="system-ui,sans-serif" font-size="14" font-weight="700" fill="#4f46e5">DORINC</text>
  ${highlight(40, 44, 240, 28)}
  `, 'Safari with DORINC open'),

  'ios-safari-more-menu.svg': phoneFrame(`
  <rect x="40" y="330" width="240" height="44" rx="12" fill="#fff" stroke="#cbd5e1" />
  <circle cx="72" cy="352" r="8" fill="#94a3b8" />
  <circle cx="112" cy="352" r="8" fill="#94a3b8" />
  <circle cx="152" cy="352" r="8" fill="#94a3b8" />
  <rect x="248" y="338" width="24" height="24" rx="6" fill="#334155" />
  <text x="254" y="354" font-family="system-ui,sans-serif" font-size="14" fill="#fff">⋯</text>
  <text x="40" y="326" font-family="system-ui,sans-serif" font-size="11" fill="#64748b">Safari bottom toolbar</text>
  ${highlight(244, 334, 32, 32, 8)}
  `, 'Safari More menu button'),

  'ios-safari-share.svg': phoneFrame(`
  <rect x="40" y="330" width="240" height="44" rx="12" fill="#fff" stroke="#cbd5e1" />
  <rect x="146" y="338" width="28" height="28" rx="8" fill="#007aff" />
  <path d="M158 354 L158 346 M154 350 L158 346 L162 350" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" />
  <text x="138" y="326" font-family="system-ui,sans-serif" font-size="11" fill="#64748b">Share button</text>
  ${highlight(142, 334, 36, 36, 8)}
  `, 'Safari Share button'),

  'ios-safari-view-more.svg': phoneFrame(`
  <rect x="40" y="180" width="240" height="180" rx="16" fill="#fff" stroke="#cbd5e1" />
  <text x="56" y="206" font-family="system-ui,sans-serif" font-size="12" font-weight="700" fill="#0f172a">Share</text>
  <rect x="56" y="320" width="208" height="24" rx="8" fill="#eef2ff" />
  <text x="120" y="336" font-family="system-ui,sans-serif" font-size="11" fill="#4f46e5">View More ▼</text>
  ${highlight(52, 316, 216, 32, 8)}
  `, 'Share sheet View More'),

  'ios-add-home-screen.svg': phoneFrame(`
  <rect x="40" y="180" width="240" height="180" rx="16" fill="#fff" stroke="#cbd5e1" />
  <rect x="56" y="248" width="208" height="36" rx="10" fill="#eef2ff" stroke="#6366f1" />
  <rect x="64" y="256" width="20" height="20" rx="4" fill="#6366f1" />
  <text x="92" y="272" font-family="system-ui,sans-serif" font-size="12" font-weight="600" fill="#0f172a">Add to Home Screen</text>
  ${highlight(52, 244, 216, 44, 10)}
  `, 'Add to Home Screen option'),

  'ios-open-as-web-app.svg': phoneFrame(`
  <rect x="40" y="150" width="240" height="170" rx="16" fill="#fff" stroke="#cbd5e1" />
  <text x="56" y="176" font-family="system-ui,sans-serif" font-size="12" font-weight="700" fill="#0f172a">Add to Home Screen</text>
  <text x="56" y="220" font-family="system-ui,sans-serif" font-size="11" fill="#334155">Open as Web App</text>
  <rect x="228" y="206" width="36" height="20" rx="10" fill="#22c55e" />
  <circle cx="244" cy="216" r="7" fill="#fff" />
  <text x="228" y="252" font-family="system-ui,sans-serif" font-size="12" font-weight="700" fill="#007aff">Add</text>
  ${highlight(224, 202, 44, 24, 10)}
  `, 'Open as Web App toggle'),

  'android-chrome-banner.svg': phoneFrame(`
  <rect x="40" y="300" width="240" height="48" rx="12" fill="#202124" />
  <text x="56" y="330" font-family="system-ui,sans-serif" font-size="12" fill="#fff">Install app</text>
  <rect x="220" y="312" width="44" height="24" rx="8" fill="#1a73e8" />
  <text x="232" y="328" font-family="system-ui,sans-serif" font-size="10" fill="#fff">Install</text>
  ${highlight(36, 296, 248, 56, 12)}
  `, 'Chrome install banner'),

  'android-chrome-menu.svg': phoneFrame(`
  <rect x="40" y="44" width="240" height="36" rx="8" fill="#fff" stroke="#cbd5e1" />
  <rect x="248" y="52" width="24" height="20" rx="4" fill="#334155" />
  <text x="256" y="66" font-family="system-ui,sans-serif" font-size="12" fill="#fff">⋮</text>
  ${highlight(244, 48, 32, 28, 6)}
  `, 'Chrome menu button'),

  'android-install-app.svg': phoneFrame(`
  <rect x="180" y="80" width="120" height="180" rx="12" fill="#fff" stroke="#cbd5e1" />
  <rect x="192" y="132" width="96" height="28" rx="8" fill="#eef2ff" stroke="#6366f1" />
  <text x="200" y="150" font-family="system-ui,sans-serif" font-size="10" font-weight="600" fill="#0f172a">Install app</text>
  ${highlight(188, 128, 104, 36, 8)}
  `, 'Install app menu item'),

  'android-samsung-menu.svg': phoneFrame(`
  <rect x="40" y="330" width="240" height="44" rx="12" fill="#fff" stroke="#cbd5e1" />
  <rect x="248" y="338" width="24" height="24" rx="6" fill="#1428a0" />
  <text x="252" y="354" font-family="system-ui,sans-serif" font-size="12" fill="#fff">☰</text>
  ${highlight(244, 334, 32, 32, 8)}
  `, 'Samsung Internet menu'),

  'android-confirm.svg': phoneFrame(`
  <rect x="60" y="140" width="200" height="120" rx="14" fill="#fff" stroke="#cbd5e1" />
  <text x="120" y="190" font-family="system-ui,sans-serif" font-size="12" fill="#0f172a">Add to Home screen?</text>
  <rect x="196" y="220" width="48" height="24" rx="8" fill="#1a73e8" />
  <text x="210" y="236" font-family="system-ui,sans-serif" font-size="10" fill="#fff">Add</text>
  ${highlight(192, 216, 56, 32, 8)}
  `, 'Android install confirmation'),

  'desktop-chrome-install.svg': desktopFrame(`
  <rect x="250" y="24" width="24" height="16" rx="4" fill="#eef2ff" stroke="#6366f1" />
  <text x="254" y="36" font-family="system-ui,sans-serif" font-size="10" fill="#4f46e5">⊕</text>
  <rect x="40" y="60" width="280" height="100" rx="8" fill="#eef2ff" />
  ${highlight(246, 20, 32, 24, 4)}
  `, 'Chrome install icon'),

  'desktop-chrome-menu.svg': desktopFrame(`
  <rect x="250" y="24" width="24" height="16" rx="4" fill="#334155" />
  <text x="258" y="36" font-family="system-ui,sans-serif" font-size="10" fill="#fff">⋮</text>
  <rect x="180" y="70" width="140" height="90" rx="8" fill="#fff" stroke="#cbd5e1" />
  <rect x="188" y="118" width="124" height="24" rx="6" fill="#eef2ff" stroke="#6366f1" />
  <text x="194" y="134" font-family="system-ui,sans-serif" font-size="9" fill="#0f172a">Install page as app…</text>
  ${highlight(184, 114, 132, 32, 6)}
  `, 'Chrome install menu option'),

  'desktop-edge-install.svg': desktopFrame(`
  <rect x="248" y="24" width="28" height="16" rx="4" fill="#eef2ff" stroke="#6366f1" />
  <text x="254" y="36" font-family="system-ui,sans-serif" font-size="9" fill="#0078d4">App</text>
  ${highlight(244, 20, 36, 24, 4)}
  `, 'Edge install icon'),

  'desktop-edge-menu.svg': desktopFrame(`
  <rect x="250" y="24" width="24" height="16" rx="4" fill="#334155" />
  <rect x="170" y="70" width="150" height="90" rx="8" fill="#fff" stroke="#cbd5e1" />
  <rect x="178" y="118" width="134" height="24" rx="6" fill="#eef2ff" stroke="#6366f1" />
  <text x="182" y="134" font-family="system-ui,sans-serif" font-size="8" fill="#0f172a">Install this site as an app</text>
  ${highlight(174, 114, 142, 32, 6)}
  `, 'Edge install menu option'),

  'desktop-safari-menu.svg': desktopFrame(`
  <rect x="40" y="24" width="48" height="16" rx="4" fill="#fff" stroke="#cbd5e1" />
  <text x="48" y="36" font-family="system-ui,sans-serif" font-size="9" fill="#0f172a">File</text>
  <rect x="40" y="44" width="120" height="80" rx="8" fill="#fff" stroke="#cbd5e1" />
  <rect x="48" y="88" width="104" height="22" rx="6" fill="#eef2ff" stroke="#6366f1" />
  <text x="54" y="103" font-family="system-ui,sans-serif" font-size="9" fill="#0f172a">Add to Dock…</text>
  ${highlight(44, 84, 112, 30, 6)}
  `, 'Safari Add to Dock menu'),

  'desktop-safari-share.svg': desktopFrame(`
  <rect x="250" y="24" width="24" height="16" rx="4" fill="#007aff" />
  <rect x="170" y="70" width="150" height="90" rx="8" fill="#fff" stroke="#cbd5e1" />
  <rect x="178" y="118" width="134" height="24" rx="6" fill="#eef2ff" stroke="#6366f1" />
  <text x="188" y="134" font-family="system-ui,sans-serif" font-size="9" fill="#0f172a">Add to Dock</text>
  ${highlight(174, 114, 142, 32, 6)}
  `, 'Safari Share Add to Dock'),

  'desktop-confirm.svg': desktopFrame(`
  <rect x="90" y="70" width="180" height="90" rx="10" fill="#fff" stroke="#cbd5e1" />
  <text x="130" y="110" font-family="system-ui,sans-serif" font-size="11" fill="#0f172a">Install DORINC?</text>
  <rect x="210" y="124" width="48" height="22" rx="6" fill="#6366f1" />
  <text x="224" y="139" font-family="system-ui,sans-serif" font-size="9" fill="#fff">Install</text>
  ${highlight(206, 120, 56, 30, 6)}
  `, 'Desktop install confirmation'),

  'desktop-firefox-note.svg': desktopFrame(`
  <rect x="40" y="60" width="280" height="100" rx="8" fill="#fff7ed" stroke="#fdba74" />
  <text x="56" y="96" font-family="system-ui,sans-serif" font-size="11" fill="#9a3412">Firefox does not support PWA install</text>
  <text x="56" y="118" font-family="system-ui,sans-serif" font-size="10" fill="#c2410c">Use Chrome or Edge instead</text>
  `, 'Firefox PWA limitation note'),
}

for (const [name, svg] of Object.entries(files)) {
  writeFileSync(join(outDir, name), svg.trim() + '\n', 'utf8')
}

console.log(`Wrote ${Object.keys(files).length} guide illustrations to ${outDir}`)
