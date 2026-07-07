// Generates all PWA icons from one inline SVG design.
// Run with: node scripts/make-icons.mjs
import sharp from 'sharp'

// Dumbbell mark on the app's dark background.
// `bleed` = square background with no rounded corners (for maskable/apple
// icons, where the OS applies its own mask); otherwise rounded corners.
// `pad` scales the glyph toward the center (maskable safe zone).
function iconSvg({ bleed = false, pad = 1 } = {}) {
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${bleed ? 0 : 96}" fill="#0b0c10"/>
  <g transform="translate(256 256) scale(${pad}) translate(-256 -256)"
     stroke="#a855f7" stroke-width="40" stroke-linecap="round" fill="none">
    <path d="M150 150v212"/>
    <path d="M362 150v212"/>
    <path d="M88 200v112"/>
    <path d="M424 200v112"/>
    <path d="M150 256h212"/>
  </g>
</svg>`)
}

const jobs = [
  { file: 'public/pwa-192.png', size: 192, svg: iconSvg() },
  { file: 'public/pwa-512.png', size: 512, svg: iconSvg() },
  // Maskable: full-bleed bg, glyph shrunk into the central safe zone.
  { file: 'public/maskable-512.png', size: 512, svg: iconSvg({ bleed: true, pad: 0.72 }) },
  // iOS rounds corners itself, so give it a full-bleed square.
  { file: 'public/apple-touch-icon.png', size: 180, svg: iconSvg({ bleed: true, pad: 0.85 }) },
]

for (const job of jobs) {
  await sharp(job.svg).resize(job.size, job.size).png().toFile(job.file)
  console.log(`✓ ${job.file}`)
}
console.log('Done.')
