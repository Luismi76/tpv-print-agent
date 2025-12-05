#!/usr/bin/env node
/**
 * Simulador de Impresoras Térmicas ESC/POS
 * =========================================
 * Simula impresoras de red que escuchan en puertos TCP.
 * Útil para desarrollo y pruebas sin hardware real.
 *
 * Uso: node escpos-simulator.js
 *
 * Crea 3 impresoras simuladas:
 *   - Cocina (puerto 9100)
 *   - Barra (puerto 9101)
 *   - Caja (puerto 9102)
 */

const net = require('net');
const fs = require('fs');
const path = require('path');

// Configuración de impresoras simuladas
const PRINTERS = [
    { name: 'Cocina', port: 9100, color: '\x1b[33m' },      // Amarillo
    { name: 'Barra', port: 9101, color: '\x1b[36m' },       // Cyan
    { name: 'Caja', port: 9102, color: '\x1b[32m' },        // Verde
];

const RESET = '\x1b[0m';

// Directorio para guardar los tickets recibidos
const OUTPUT_DIR = path.join(__dirname, 'simulated-prints');
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Decodificar comandos ESC/POS básicos a texto legible
function decodeEscPos(buffer) {
    let text = '';
    let i = 0;

    while (i < buffer.length) {
        const byte = buffer[i];

        // ESC (0x1B) - Inicio de comando
        if (byte === 0x1B) {
            const nextByte = buffer[i + 1];

            // ESC @ - Inicializar impresora
            if (nextByte === 0x40) {
                text += '\n--- INICIO TICKET ---\n';
                i += 2;
                continue;
            }

            // ESC ! - Seleccionar modo de impresión
            if (nextByte === 0x21) {
                i += 3;
                continue;
            }

            // ESC a - Justificación
            if (nextByte === 0x61) {
                const align = buffer[i + 2];
                if (align === 0) text += '[IZQUIERDA]';
                else if (align === 1) text += '[CENTRO]';
                else if (align === 2) text += '[DERECHA]';
                i += 3;
                continue;
            }

            // ESC E - Negrita
            if (nextByte === 0x45) {
                text += buffer[i + 2] ? '[NEGRITA]' : '[/NEGRITA]';
                i += 3;
                continue;
            }

            // ESC d - Avanzar líneas
            if (nextByte === 0x64) {
                const lines = buffer[i + 2] || 1;
                text += '\n'.repeat(lines);
                i += 3;
                continue;
            }

            // Otros comandos ESC - saltar
            i += 2;
            continue;
        }

        // GS (0x1D) - Comandos GS
        if (byte === 0x1D) {
            const nextByte = buffer[i + 1];

            // GS V - Cortar papel
            if (nextByte === 0x56) {
                text += '\n========== CORTE ==========\n';
                i += 3;
                continue;
            }

            // GS ! - Tamaño de carácter
            if (nextByte === 0x21) {
                i += 3;
                continue;
            }

            // GS k - Código de barras (saltar datos)
            if (nextByte === 0x6B) {
                text += '[CODIGO BARRAS]';
                // Saltar hasta encontrar NUL
                i += 3;
                while (i < buffer.length && buffer[i] !== 0x00) i++;
                i++;
                continue;
            }

            // Otros comandos GS
            i += 2;
            continue;
        }

        // LF (0x0A) - Nueva línea
        if (byte === 0x0A) {
            text += '\n';
            i++;
            continue;
        }

        // CR (0x0D) - Retorno de carro
        if (byte === 0x0D) {
            i++;
            continue;
        }

        // Caracteres imprimibles (32-126 ASCII, más extendidos)
        if (byte >= 32 && byte <= 126) {
            text += String.fromCharCode(byte);
        } else if (byte >= 128) {
            // Intentar decodificar como ISO-8859-1 / CP437
            text += String.fromCharCode(byte);
        }

        i++;
    }

    return text;
}

// Crear servidor para una impresora
function createPrinterServer(printer) {
    const server = net.createServer((socket) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const clientInfo = `${socket.remoteAddress}:${socket.remotePort}`;

        console.log(`${printer.color}[${printer.name}]${RESET} Conexión desde ${clientInfo}`);

        let dataBuffer = Buffer.alloc(0);

        socket.on('data', (data) => {
            dataBuffer = Buffer.concat([dataBuffer, data]);
        });

        socket.on('end', () => {
            if (dataBuffer.length > 0) {
                // Decodificar y mostrar
                const decoded = decodeEscPos(dataBuffer);

                console.log(`\n${printer.color}╔════════════════════════════════════════╗${RESET}`);
                console.log(`${printer.color}║  IMPRESIÓN EN: ${printer.name.padEnd(22)} ║${RESET}`);
                console.log(`${printer.color}╚════════════════════════════════════════╝${RESET}`);
                console.log(decoded);
                console.log(`${printer.color}──────────────────────────────────────────${RESET}\n`);

                // Guardar en archivo
                const filename = `${printer.name.toLowerCase()}_${timestamp}.txt`;
                const filepath = path.join(OUTPUT_DIR, filename);
                fs.writeFileSync(filepath, decoded);
                console.log(`${printer.color}[${printer.name}]${RESET} Guardado: ${filename}`);
            }
        });

        socket.on('error', (err) => {
            console.error(`${printer.color}[${printer.name}]${RESET} Error: ${err.message}`);
        });
    });

    server.listen(printer.port, '0.0.0.0', () => {
        console.log(`${printer.color}[${printer.name}]${RESET} Escuchando en puerto ${printer.port}`);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`${printer.color}[${printer.name}]${RESET} Puerto ${printer.port} ya en uso`);
        } else {
            console.error(`${printer.color}[${printer.name}]${RESET} Error: ${err.message}`);
        }
    });

    return server;
}

// Banner
console.log(`
╔═══════════════════════════════════════════════════════════╗
║         SIMULADOR DE IMPRESORAS TÉRMICAS ESC/POS          ║
║                     TPV Print Agent                        ║
╚═══════════════════════════════════════════════════════════╝
`);

// Iniciar todas las impresoras
const servers = PRINTERS.map(printer => createPrinterServer(printer));

console.log(`\nImpresoras simuladas disponibles:`);
console.log(`  - Cocina:  192.168.1.76:9100 (o localhost:9100)`);
console.log(`  - Barra:   192.168.1.76:9101 (o localhost:9101)`);
console.log(`  - Caja:    192.168.1.76:9102 (o localhost:9102)`);
console.log(`\nLos tickets recibidos se guardan en: ${OUTPUT_DIR}`);
console.log(`\nPresiona Ctrl+C para detener.\n`);

// Manejar cierre
process.on('SIGINT', () => {
    console.log('\nCerrando simulador...');
    servers.forEach(server => server.close());
    process.exit(0);
});

process.on('SIGTERM', () => {
    servers.forEach(server => server.close());
    process.exit(0);
});
