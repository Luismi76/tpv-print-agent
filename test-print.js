#!/usr/bin/env node
/**
 * Test de impresión directa
 * Prueba las impresoras configuradas sin necesidad del servidor
 */

const chalk = require('chalk');
const { PrinterManager } = require('./src/printer-manager');
const { ConfigManager } = require('./src/config-manager');

console.log(chalk.cyan(`
╔════════════════════════════════════════════╗
║       Test de Impresión Directa            ║
╚════════════════════════════════════════════╝
`));

async function main() {
    const config = new ConfigManager();
    const printerManager = new PrinterManager();
    const settings = config.getSettings();

    console.log(chalk.yellow('Cargando configuración...'));
    console.log(chalk.gray(`Impresoras configuradas: ${settings.printers.length}\n`));

    // Inicializar impresoras
    await printerManager.initialize(settings.printers);

    // Mostrar estado
    const status = printerManager.getStatus();
    console.log(chalk.yellow('\nEstado de impresoras:'));
    status.forEach(p => {
        const icon = p.connected ? chalk.green('✓') : chalk.red('✗');
        console.log(`  ${icon} ${p.name} (${p.type}) - ${p.config.ip}:${p.config.port || 631}`);
    });

    // Buscar impresora conectada
    const connectedPrinter = status.find(p => p.connected);

    if (!connectedPrinter) {
        console.log(chalk.red('\nNo hay impresoras conectadas para probar.'));
        console.log(chalk.yellow('Verifica que las IPs sean correctas y las impresoras estén encendidas.'));
        process.exit(1);
    }

    console.log(chalk.yellow(`\nEnviando prueba a: ${connectedPrinter.name}...`));

    try {
        const printer = printerManager.getPrinter(connectedPrinter.name);
        await printer.printTest();
        console.log(chalk.green('\n✓ ¡Prueba enviada! Revisa tu impresora.'));
    } catch (error) {
        console.log(chalk.red(`\n✗ Error: ${error.message}`));
    }
}

main().catch(err => {
    console.error(chalk.red('Error:'), err.message);
    process.exit(1);
});
