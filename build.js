const { build } = require('esbuild');

const entries = {
  'Info.ts': '// icon-color: blue; icon-glyph: info;',
  'Obsidian.ts': '// icon-color: deep-gray; icon-glyph: tasks;',
};

const watch = process.argv.includes('-w') || process.argv.includes('--watch');
for (const [entry, banner] of Object.entries(entries)) {
  build({
    banner: { js: banner },
    bundle: true,
    entryPoints: [entry],
    logLevel: 'info',
    minify: true,
    outdir: 'Documents',
    watch,
  });
}
