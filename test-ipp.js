#!/usr/bin/env node
/**
 * Test IPP con librería oficial
 */

const ipp = require('ipp');
const chalk = require('chalk');

const PRINTER_IP = '192.168.1.150';

console.log(chalk.cyan('\n=== Test IPP con librería oficial ===\n'));

// Primero obtener atributos de la impresora
console.log(chalk.yellow(`1. Obteniendo info de la impresora ${PRINTER_IP}...`));

const printerUri = `ipp://${PRINTER_IP}:631/ipp/print`;
const printer = ipp.Printer(printerUri);

// Get printer attributes
printer.execute("Get-Printer-Attributes", null, (err, res) => {
    if (err) {
        console.log(chalk.red('Error obteniendo atributos:'), err.message);

        // Intentar con otras rutas
        console.log(chalk.yellow('\nProbando rutas alternativas...'));
        tryAlternativePaths();
        return;
    }

    console.log(chalk.green('✓ Impresora encontrada!'));
    console.log(chalk.gray('  Nombre:', res['printer-attributes-tag']?.['printer-name']));
    console.log(chalk.gray('  Estado:', res['printer-attributes-tag']?.['printer-state']));
    console.log(chalk.gray('  URI:', res['printer-attributes-tag']?.['printer-uri-supported']));

    // Ahora imprimir
    sendTestPrint(printerUri);
});

function tryAlternativePaths() {
    const paths = [
        '/ipp/printer',
        '/ipp',
        '/printers',
        '/'
    ];

    let found = false;

    for (const path of paths) {
        const uri = `ipp://${PRINTER_IP}:631${path}`;
        console.log(chalk.gray(`  Probando ${uri}...`));

        const testPrinter = ipp.Printer(uri);
        testPrinter.execute("Get-Printer-Attributes", null, (err, res) => {
            if (!err && !found) {
                found = true;
                console.log(chalk.green(`✓ Encontrada en: ${uri}`));
                sendTestPrint(uri);
            }
        });
    }

    // Timeout para si ninguna funciona
    setTimeout(() => {
        if (!found) {
            console.log(chalk.red('\nNo se encontró ninguna ruta IPP válida.'));
            console.log(chalk.yellow('Verificando si la impresora soporta IPP...'));
            checkPrinterWeb();
        }
    }, 5000);
}

function sendTestPrint(uri) {
    console.log(chalk.yellow('\n2. Enviando trabajo de impresión...'));

    const testDocument = `
========================================
         PRUEBA DE IMPRESION TPV
========================================

Fecha: ${new Date().toLocaleString('es-ES')}
Impresora: ${PRINTER_IP}

Esta es una prueba del sistema TPV
Print Agent para restaurantes.

Si puedes leer esto, la impresora
esta funcionando correctamente!

========================================
`;

    const printer = ipp.Printer(uri);

    const msg = {
        "operation-attributes-tag": {
            "requesting-user-name": "TPV-Print-Agent",
            "job-name": "Test TPV",
            "document-format": "text/plain"
        },
        data: Buffer.from(testDocument)
    };

    printer.execute("Print-Job", msg, (err, res) => {
        if (err) {
            console.log(chalk.red('Error imprimiendo:'), err.message);
            return;
        }

        console.log(chalk.green('✓ Trabajo enviado!'));
        console.log(chalk.gray('  Job ID:', res['job-attributes-tag']?.['job-id']));
        console.log(chalk.gray('  Estado:', res['job-attributes-tag']?.['job-state']));
        console.log(chalk.cyan('\n¡Revisa tu impresora!'));
    });
}

function checkPrinterWeb() {
    const http = require('http');

    console.log(chalk.gray(`\nIntentando acceder a http://${PRINTER_IP}...`));

    http.get(`http://${PRINTER_IP}`, (res) => {
        console.log(chalk.green(`✓ La impresora tiene servidor web (HTTP ${res.statusCode})`));
        console.log(chalk.yellow('\nPuedes acceder a su configuración en:'));
        console.log(chalk.cyan(`  http://${PRINTER_IP}`));
        console.log(chalk.gray('\nBusca la sección "Servicios Web" o "IPP" para ver la URI correcta.'));
    }).on('error', (err) => {
        console.log(chalk.red('No se puede acceder al servidor web de la impresora.'));
    });
}
