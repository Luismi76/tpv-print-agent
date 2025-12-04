#!/usr/bin/env node
/**
 * Test de impresión usando impresoras de Windows
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const PRINTER_NAME = 'HP86A42D (HP DeskJet 2700 series)';

console.log(chalk.cyan('\n=== Test Impresión Windows ===\n'));

// Crear archivo temporal con el contenido
const testContent = `
========================================
         PRUEBA DE IMPRESION TPV
========================================

Fecha: ${new Date().toLocaleString('es-ES')}
Impresora: ${PRINTER_NAME}

Esta es una prueba del sistema TPV
Print Agent para restaurantes.

Si puedes leer esto, la impresora
esta funcionando correctamente!

========================================

Productos de ejemplo:
--------------------------------
1x Cafe con leche        2.50 EUR
2x Tostada integral      3.60 EUR
1x Zumo de naranja       3.00 EUR
--------------------------------
TOTAL:                   9.10 EUR

Gracias por su visita!
========================================
`;

const tempFile = path.join(process.env.TEMP || '/tmp', 'tpv-test-print.txt');
fs.writeFileSync(tempFile, testContent, 'utf-8');

console.log(chalk.yellow(`Imprimiendo en: ${PRINTER_NAME}`));
console.log(chalk.gray(`Archivo temporal: ${tempFile}\n`));

// Usar PowerShell para imprimir
const psCommand = `
$content = Get-Content -Path '${tempFile.replace(/\\/g, '\\\\')}' -Raw
$content | Out-Printer -Name '${PRINTER_NAME}'
`;

exec(`powershell -Command "${psCommand}"`, (error, stdout, stderr) => {
    // Limpiar archivo temporal
    try { fs.unlinkSync(tempFile); } catch (e) {}

    if (error) {
        console.log(chalk.red('Error:'), error.message);
        console.log(chalk.gray('stderr:', stderr));
        return;
    }

    console.log(chalk.green('✓ Trabajo enviado a la cola de impresión!'));
    console.log(chalk.cyan('\nRevisa tu impresora HP DeskJet 2700'));
});
