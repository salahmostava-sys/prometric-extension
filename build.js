const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, 'dist');

async function build() {
  // Clean dist directory
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  console.log('Building extension with esbuild...');

  try {
    await esbuild.build({
      entryPoints: [
        './background.js',
        './content.js',
        './bridge.js',
        './popup.js'
      ],
      bundle: true,
      minify: false, // Keep readable for debugging for now
      sourcemap: process.env.NODE_ENV !== 'production',
      outdir: 'dist',
      target: ['chrome100']
    });

    // Copy static files
    const staticFiles = [
      'manifest.json',
      'popup.html',
      'popup.css',
      'icon.png',
      'icon16.png',
      'icon48.png',
      'icon128.png'
    ];

    for (const file of staticFiles) {
      if (fs.existsSync(file)) {
        fs.copyFileSync(file, path.join(outDir, file));
      }
    }

    console.log('Build complete! Files are in the "dist" directory.');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
