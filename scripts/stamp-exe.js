/**
 * Estampa metadatos de Windows (versión, autor, copyright) en el exe generado por pkg.
 * Se ejecuta automáticamente después de `npm run build`.
 */
const rcedit = require('rcedit');
const pkg = require('../package.json');

async function stamp() {
    console.log(`Estampando metadatos: v${pkg.version} — ${pkg.author}`);

    await rcedit('dist/tpv-print-agent.exe', {
        'file-version': pkg.version,
        'product-version': pkg.version,
        'version-string': {
            CompanyName: pkg.author,
            FileDescription: pkg.description,
            ProductName: 'TPV Print Agent',
            LegalCopyright: `Copyright (c) 2025-2026 ${pkg.author}`,
            OriginalFilename: 'tpv-print-agent.exe',
        },
    });

    console.log('Metadatos estampados correctamente.');
}

stamp().catch((err) => {
    console.error('Error estampando metadatos:', err.message);
    process.exit(1);
});
