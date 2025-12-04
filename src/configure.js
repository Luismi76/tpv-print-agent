#!/usr/bin/env node
/**
 * Configurador Interactivo del TPV Print Agent
 * =============================================
 * Ayuda al usuario a configurar el agente paso a paso
 */

const inquirer = require('inquirer');
const chalk = require('chalk');
const net = require('net');
const { ConfigManager } = require('./config-manager');

console.log(chalk.cyan(`
╔════════════════════════════════════════════╗
║    Configurador TPV Print Agent v1.0.0     ║
╚════════════════════════════════════════════╝
`));

const config = new ConfigManager();

async function main() {
    const settings = config.getSettings();

    console.log(chalk.yellow('Este asistente te ayudará a configurar el agente de impresión.\n'));

    // 1. Configuración del servidor
    const serverAnswers = await inquirer.prompt([
        {
            type: 'input',
            name: 'serverUrl',
            message: 'URL del servidor TPV:',
            default: settings.serverUrl || 'https://backend.lmsc.es/api',
            validate: (input) => {
                if (!input.startsWith('http://') && !input.startsWith('https://')) {
                    return 'La URL debe comenzar con http:// o https://';
                }
                return true;
            }
        },
        {
            type: 'input',
            name: 'restaurantId',
            message: 'ID del restaurante:',
            default: settings.restaurantId,
            validate: (input) => input.length > 0 || 'El ID es requerido'
        },
        {
            type: 'input',
            name: 'apiKey',
            message: 'API Key del restaurante:',
            default: settings.apiKey,
            validate: (input) => input.length > 0 || 'La API Key es requerida'
        }
    ]);

    config.updateSettings(serverAnswers);

    // 2. Configurar impresoras
    console.log(chalk.yellow('\n--- Configuración de Impresoras ---\n'));

    let addMorePrinters = true;
    const printers = [...(settings.printers || [])];

    if (printers.length > 0) {
        console.log(chalk.gray('Impresoras existentes:'));
        printers.forEach((p, i) => {
            console.log(chalk.gray(`  ${i + 1}. ${p.name} (${p.type}: ${p.ip || 'USB'})`));
        });

        const { keepPrinters } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'keepPrinters',
                message: '¿Mantener las impresoras existentes?',
                default: true
            }
        ]);

        if (!keepPrinters) {
            printers.length = 0;
        }
    }

    while (addMorePrinters) {
        const { addPrinter } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'addPrinter',
                message: printers.length === 0
                    ? '¿Deseas agregar una impresora?'
                    : '¿Deseas agregar otra impresora?',
                default: printers.length === 0
            }
        ]);

        if (!addPrinter) {
            addMorePrinters = false;
            continue;
        }

        const printerConfig = await configurePrinter(printers.length === 0);

        if (printerConfig) {
            printers.push(printerConfig);
            console.log(chalk.green(`✓ Impresora "${printerConfig.name}" agregada\n`));
        }
    }

    config.updatePrinters(printers);

    // Resumen
    console.log(chalk.cyan('\n=== Configuración Guardada ===\n'));
    console.log(chalk.white(`Servidor: ${serverAnswers.serverUrl}`));
    console.log(chalk.white(`Restaurante: ${serverAnswers.restaurantId}`));
    console.log(chalk.white(`Impresoras: ${printers.length}`));

    printers.forEach(p => {
        console.log(chalk.gray(`  - ${p.name} (${p.type}${p.ip ? ': ' + p.ip + ':' + p.port : ''})`));
    });

    console.log(chalk.green('\n✓ Configuración completada'));
    console.log(chalk.yellow('Ejecuta "npm start" para iniciar el agente\n'));
}

async function configurePrinter(isFirst) {
    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'name',
            message: 'Nombre de la impresora:',
            default: isFirst ? 'Tickets' : `Impresora${Date.now()}`,
            validate: (input) => input.length > 0 || 'El nombre es requerido'
        },
        {
            type: 'list',
            name: 'type',
            message: 'Tipo de conexión:',
            choices: [
                { name: 'Red (IP/Ethernet)', value: 'network' },
                { name: 'USB', value: 'usb' }
            ],
            default: 'network'
        }
    ]);

    if (answers.type === 'network') {
        const networkAnswers = await inquirer.prompt([
            {
                type: 'input',
                name: 'ip',
                message: 'Dirección IP de la impresora:',
                validate: (input) => {
                    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
                    return ipRegex.test(input) || 'Ingresa una IP válida (ej: 192.168.1.100)';
                }
            },
            {
                type: 'number',
                name: 'port',
                message: 'Puerto:',
                default: 9100
            }
        ]);

        // Probar conexión
        console.log(chalk.yellow(`\nProbando conexión a ${networkAnswers.ip}:${networkAnswers.port}...`));

        const connected = await testConnection(networkAnswers.ip, networkAnswers.port);

        if (connected) {
            console.log(chalk.green('✓ Conexión exitosa'));
        } else {
            console.log(chalk.red('✗ No se pudo conectar'));

            const { continueAnyway } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'continueAnyway',
                    message: '¿Guardar de todos modos?',
                    default: false
                }
            ]);

            if (!continueAnyway) {
                return null;
            }
        }

        const { isDefault } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'isDefault',
                message: '¿Establecer como impresora por defecto?',
                default: isFirst
            }
        ]);

        return {
            name: answers.name,
            type: 'network',
            ip: networkAnswers.ip,
            port: networkAnswers.port,
            default: isDefault
        };

    } else {
        // USB
        console.log(chalk.yellow('\nNota: Para USB se usará la primera impresora detectada.'));
        console.log(chalk.gray('Si tienes múltiples impresoras USB, especifica vendorId y productId.\n'));

        const usbAnswers = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'autoDetect',
                message: '¿Detectar automáticamente?',
                default: true
            }
        ]);

        let vendorId, productId;

        if (!usbAnswers.autoDetect) {
            const manualUsb = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'vendorId',
                    message: 'Vendor ID (hex, ej: 0x04b8):',
                    filter: (input) => parseInt(input, 16)
                },
                {
                    type: 'input',
                    name: 'productId',
                    message: 'Product ID (hex, ej: 0x0202):',
                    filter: (input) => parseInt(input, 16)
                }
            ]);
            vendorId = manualUsb.vendorId;
            productId = manualUsb.productId;
        }

        const { isDefault } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'isDefault',
                message: '¿Establecer como impresora por defecto?',
                default: isFirst
            }
        ]);

        return {
            name: answers.name,
            type: 'usb',
            vendorId,
            productId,
            default: isDefault
        };
    }
}

function testConnection(ip, port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(5000);

        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });

        socket.on('error', () => {
            resolve(false);
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });

        socket.connect(port, ip);
    });
}

main().catch(error => {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
});
