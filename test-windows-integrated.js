#!/usr/bin/env node
/**
 * Test integrado de impresión Windows
 * Prueba el nuevo tipo de impresora Windows con el PrinterManager
 */

const chalk = require('chalk');
const { PrinterManager } = require('./src/printer-manager');

console.log(chalk.cyan(`
╔════════════════════════════════════════════╗
║   Test Impresora Windows Integrada         ║
╚════════════════════════════════════════════╝
`));

async function main() {
    const printerManager = new PrinterManager();

    // Configuración de prueba con impresora Windows
    const testConfig = [
        {
            name: 'HP_Oficina',
            type: 'windows',
            windowsName: 'HP86A42D (HP DeskJet 2700 series)',
            default: true
        }
    ];

    console.log(chalk.yellow('Inicializando impresora Windows...'));
    await printerManager.initialize(testConfig);

    // Obtener estado
    const status = printerManager.getStatus();
    console.log(chalk.yellow('\nEstado de impresoras:'));
    status.forEach(p => {
        const icon = p.connected ? chalk.green('✓') : chalk.red('✗');
        console.log(`  ${icon} ${p.name} (${p.type}) - ${p.config.windowsName || p.config.ip}`);
    });

    // Obtener impresora
    const printer = printerManager.getPrinter('HP_Oficina');

    if (!printer) {
        console.log(chalk.red('\nNo se encontró la impresora HP_Oficina'));
        process.exit(1);
    }

    if (!printer.connected) {
        console.log(chalk.red('\nLa impresora no está conectada/disponible'));
        process.exit(1);
    }

    console.log(chalk.yellow('\nEnviando prueba de impresión...'));

    try {
        await printer.printTest();
        console.log(chalk.green('\n✓ ¡Prueba enviada exitosamente!'));
        console.log(chalk.cyan('\nRevisa tu impresora HP DeskJet 2700'));
    } catch (error) {
        console.log(chalk.red(`\n✗ Error: ${error.message}`));
    }
}

main().catch(err => {
    console.error(chalk.red('Error:'), err.message);
    process.exit(1);
});
