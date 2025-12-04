/**
 * Gestor de Impresoras
 * ====================
 * Maneja las conexiones con impresoras locales (red, USB e IPP)
 */

const net = require('net');
const http = require('http');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

/**
 * Clase base para impresoras
 */
class Printer {
    constructor(config) {
        this.name = config.name;
        this.type = config.type; // 'network' | 'usb'
        this.config = config;
        this.connected = false;
    }

    async printRaw(buffer) {
        throw new Error('No implementado');
    }

    async printText(text) {
        // Convertir texto a comandos ESC/POS básicos
        const buffer = this.textToEscPos(text);
        return this.printRaw(buffer);
    }

    async printHtml(html) {
        // Por ahora, extraer texto del HTML
        const text = html.replace(/<[^>]*>/g, '\n').replace(/\n+/g, '\n');
        return this.printText(text);
    }

    async printTest() {
        const testTicket = this.generateTestTicket();
        return this.printRaw(testTicket);
    }

    textToEscPos(text) {
        // Comandos ESC/POS básicos
        const ESC = 0x1B;
        const GS = 0x1D;
        const commands = [];

        // Inicializar impresora
        commands.push(ESC, 0x40); // ESC @ - Reset

        // Texto
        const textBytes = Buffer.from(text, 'utf-8');
        commands.push(...textBytes);

        // Cortar papel
        commands.push(GS, 0x56, 0x00); // GS V 0 - Corte total

        return Buffer.from(commands);
    }

    generateTestTicket() {
        const ESC = 0x1B;
        const GS = 0x1D;
        const commands = [];

        // Reset
        commands.push(ESC, 0x40);

        // Centrar
        commands.push(ESC, 0x61, 0x01);

        // Negrita ON
        commands.push(ESC, 0x45, 0x01);

        // Título
        const title = '=== PRUEBA DE IMPRESION ===\n';
        commands.push(...Buffer.from(title));

        // Negrita OFF
        commands.push(ESC, 0x45, 0x00);

        // Alinear izquierda
        commands.push(ESC, 0x61, 0x00);

        // Info
        const info = `
TPV Print Agent v1.0.0
Impresora: ${this.name}
Tipo: ${this.type}
Fecha: ${new Date().toLocaleString('es-ES')}

Si puedes leer esto, la
impresora esta funcionando
correctamente.

`;
        commands.push(...Buffer.from(info));

        // Centrar
        commands.push(ESC, 0x61, 0x01);

        // Línea final
        commands.push(...Buffer.from('========================\n\n\n'));

        // Cortar
        commands.push(GS, 0x56, 0x00);

        return Buffer.from(commands);
    }

    getStatus() {
        return {
            name: this.name,
            type: this.type,
            connected: this.connected,
            config: {
                ip: this.config.ip,
                port: this.config.port
            }
        };
    }
}

/**
 * Impresora de Red (TCP/IP - ESC/POS)
 */
class NetworkPrinter extends Printer {
    constructor(config) {
        super(config);
        this.type = 'network';
        this.ip = config.ip;
        this.port = config.port || 9100;
    }

    async printRaw(buffer) {
        return new Promise((resolve, reject) => {
            const socket = new net.Socket();
            const timeout = 10000; // 10 segundos

            socket.setTimeout(timeout);

            socket.on('connect', () => {
                console.log(chalk.gray(`   Conectado a ${this.ip}:${this.port}`));
                this.connected = true;
                socket.write(buffer, () => {
                    socket.end();
                });
            });

            socket.on('close', () => {
                console.log(chalk.gray('   Conexión cerrada'));
                resolve();
            });

            socket.on('error', (err) => {
                this.connected = false;
                reject(new Error(`Error de red: ${err.message}`));
            });

            socket.on('timeout', () => {
                this.connected = false;
                socket.destroy();
                reject(new Error('Timeout de conexión'));
            });

            console.log(chalk.gray(`   Conectando a ${this.ip}:${this.port}...`));
            socket.connect(this.port, this.ip);
        });
    }

    async checkConnection() {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(3000);

            socket.on('connect', () => {
                this.connected = true;
                socket.destroy();
                resolve(true);
            });

            socket.on('error', () => {
                this.connected = false;
                resolve(false);
            });

            socket.on('timeout', () => {
                this.connected = false;
                socket.destroy();
                resolve(false);
            });

            socket.connect(this.port, this.ip);
        });
    }
}

/**
 * Impresora IPP (HP, Canon, Epson de oficina via WiFi/Red)
 * Usa el protocolo Internet Printing Protocol
 */
class IppPrinter extends Printer {
    constructor(config) {
        super(config);
        this.type = 'ipp';
        this.ip = config.ip;
        this.port = config.port || 631;
        this.path = config.path || '/ipp/print';
    }

    async printRaw(buffer) {
        // Para IPP, convertimos el contenido a un job de impresión
        return this.printText(buffer.toString('utf-8'));
    }

    async printText(text) {
        return new Promise((resolve, reject) => {
            // Crear documento IPP simple
            const boundary = '----IPPBoundary' + Date.now();
            const documentContent = text;

            // IPP usa HTTP POST con content-type específico
            const options = {
                hostname: this.ip,
                port: this.port,
                path: this.path,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/ipp',
                    'Accept': 'application/ipp'
                },
                timeout: 10000
            };

            console.log(chalk.gray(`   Conectando a IPP ${this.ip}:${this.port}${this.path}...`));

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200 || res.statusCode === 202) {
                        this.connected = true;
                        console.log(chalk.gray('   Trabajo IPP enviado'));
                        resolve();
                    } else {
                        reject(new Error(`IPP error: ${res.statusCode}`));
                    }
                });
            });

            req.on('error', (err) => {
                this.connected = false;
                reject(new Error(`Error IPP: ${err.message}`));
            });

            req.on('timeout', () => {
                this.connected = false;
                req.destroy();
                reject(new Error('Timeout IPP'));
            });

            // Crear mensaje IPP básico (Print-Job operation)
            const ippMessage = this.createIppPrintJob(documentContent);
            req.write(ippMessage);
            req.end();
        });
    }

    createIppPrintJob(content) {
        // Estructura básica de mensaje IPP Print-Job
        // Version 1.1, operation Print-Job (0x0002)
        const buffer = Buffer.alloc(1024 + content.length);
        let offset = 0;

        // Version (1.1)
        buffer.writeInt8(1, offset++);
        buffer.writeInt8(1, offset++);

        // Operation ID (Print-Job = 0x0002)
        buffer.writeInt16BE(0x0002, offset);
        offset += 2;

        // Request ID
        buffer.writeInt32BE(1, offset);
        offset += 4;

        // Operation attributes tag
        buffer.writeInt8(0x01, offset++);

        // charset
        buffer.writeInt8(0x47, offset++); // charset type
        buffer.writeInt16BE(18, offset); offset += 2; // name length
        buffer.write('attributes-charset', offset); offset += 18;
        buffer.writeInt16BE(5, offset); offset += 2; // value length
        buffer.write('utf-8', offset); offset += 5;

        // natural-language
        buffer.writeInt8(0x48, offset++); // naturalLanguage type
        buffer.writeInt16BE(27, offset); offset += 2;
        buffer.write('attributes-natural-language', offset); offset += 27;
        buffer.writeInt16BE(2, offset); offset += 2;
        buffer.write('en', offset); offset += 2;

        // printer-uri
        buffer.writeInt8(0x45, offset++); // uri type
        buffer.writeInt16BE(11, offset); offset += 2;
        buffer.write('printer-uri', offset); offset += 11;
        const uri = `ipp://${this.ip}:${this.port}${this.path}`;
        buffer.writeInt16BE(uri.length, offset); offset += 2;
        buffer.write(uri, offset); offset += uri.length;

        // document-format
        buffer.writeInt8(0x49, offset++); // mimeMediaType
        buffer.writeInt16BE(15, offset); offset += 2;
        buffer.write('document-format', offset); offset += 15;
        buffer.writeInt16BE(10, offset); offset += 2;
        buffer.write('text/plain', offset); offset += 10;

        // End of attributes
        buffer.writeInt8(0x03, offset++);

        // Document data
        const contentBuffer = Buffer.from(content, 'utf-8');
        contentBuffer.copy(buffer, offset);
        offset += contentBuffer.length;

        return buffer.slice(0, offset);
    }

    async checkConnection() {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(3000);

            socket.on('connect', () => {
                this.connected = true;
                socket.destroy();
                resolve(true);
            });

            socket.on('error', () => {
                this.connected = false;
                resolve(false);
            });

            socket.on('timeout', () => {
                this.connected = false;
                socket.destroy();
                resolve(false);
            });

            socket.connect(this.port, this.ip);
        });
    }

    generateTestTicket() {
        // Para impresoras de oficina, texto simple
        return Buffer.from(`
========================================
         PRUEBA DE IMPRESION
========================================

TPV Print Agent v1.0.0
Impresora: ${this.name}
Tipo: IPP (Impresora de Oficina)
IP: ${this.ip}:${this.port}
Fecha: ${new Date().toLocaleString('es-ES')}

Si puedes leer esto, la impresora
esta funcionando correctamente.

========================================
`, 'utf-8');
    }
}

/**
 * Impresora de Windows (usa el sistema de impresión nativo via PowerShell)
 * Ideal para impresoras HP, Canon, Epson de oficina instaladas en Windows
 */
class WindowsPrinter extends Printer {
    constructor(config) {
        super(config);
        this.type = 'windows';
        this.windowsName = config.windowsName; // Nombre exacto en Windows
    }

    async printRaw(buffer) {
        // Para impresoras Windows, convertimos a texto
        return this.printText(buffer.toString('utf-8'));
    }

    async printText(text) {
        return new Promise((resolve, reject) => {
            // Crear archivo temporal
            const tempFile = path.join(process.env.TEMP || '/tmp', `tpv-print-${Date.now()}.txt`);

            try {
                fs.writeFileSync(tempFile, text, 'utf-8');
            } catch (err) {
                reject(new Error(`Error creando archivo temporal: ${err.message}`));
                return;
            }

            console.log(chalk.gray(`   Enviando a impresora Windows: ${this.windowsName}`));

            // Escapar comillas simples en el nombre de la impresora
            const escapedName = this.windowsName.replace(/'/g, "''");
            const escapedPath = tempFile.replace(/\\/g, '\\\\');

            // Usar PowerShell Out-Printer
            const psCommand = `Get-Content -Path '${escapedPath}' -Raw | Out-Printer -Name '${escapedName}'`;

            exec(`powershell -Command "${psCommand}"`, { timeout: 30000 }, (error, stdout, stderr) => {
                // Limpiar archivo temporal
                try { fs.unlinkSync(tempFile); } catch (e) {}

                if (error) {
                    this.connected = false;
                    reject(new Error(`Error de impresión: ${error.message}`));
                    return;
                }

                this.connected = true;
                console.log(chalk.gray('   Trabajo enviado a cola de Windows'));
                resolve();
            });
        });
    }

    async printHtml(html) {
        // Para HTML, extraemos el texto (las impresoras de texto no pueden renderizar HTML)
        // En el futuro se podría convertir a PDF y enviar
        const text = html.replace(/<[^>]*>/g, '\n').replace(/\n+/g, '\n').trim();
        return this.printText(text);
    }

    async checkConnection() {
        return new Promise((resolve) => {
            // Verificar que la impresora existe en Windows
            const escapedName = this.windowsName.replace(/'/g, "''");
            const psCommand = `Get-Printer -Name '${escapedName}' | Select-Object -ExpandProperty PrinterStatus`;

            exec(`powershell -Command "${psCommand}"`, { timeout: 5000 }, (error, stdout, stderr) => {
                if (error) {
                    this.connected = false;
                    resolve(false);
                    return;
                }

                const status = stdout.trim();
                // Estados válidos: Normal, Idle, Printing
                this.connected = !['Offline', 'Error', 'PaperJam', 'PaperOut'].includes(status);
                resolve(this.connected);
            });
        });
    }

    generateTestTicket() {
        return Buffer.from(`
========================================
         PRUEBA DE IMPRESION TPV
========================================

TPV Print Agent v1.0.0
Impresora: ${this.name}
Tipo: Windows (${this.windowsName})
Fecha: ${new Date().toLocaleString('es-ES')}

Si puedes leer esto, la impresora
esta funcionando correctamente.

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
`, 'utf-8');
    }

    getStatus() {
        return {
            name: this.name,
            type: this.type,
            connected: this.connected,
            config: {
                windowsName: this.windowsName
            }
        };
    }
}

/**
 * Impresora USB (usando escpos-usb)
 */
class UsbPrinter extends Printer {
    constructor(config) {
        super(config);
        this.type = 'usb';
        this.vendorId = config.vendorId;
        this.productId = config.productId;
        this.device = null;
    }

    async initialize() {
        try {
            // Intentar cargar escpos-usb (puede fallar si no hay libusb)
            const escposUsb = require('escpos-usb');

            if (this.vendorId && this.productId) {
                this.device = new escposUsb(this.vendorId, this.productId);
            } else {
                // Buscar primer dispositivo USB compatible
                this.device = new escposUsb();
            }

            this.connected = true;
            return true;
        } catch (error) {
            console.log(chalk.yellow(`   USB no disponible: ${error.message}`));
            this.connected = false;
            return false;
        }
    }

    async printRaw(buffer) {
        if (!this.device) {
            await this.initialize();
        }

        if (!this.device) {
            throw new Error('Dispositivo USB no disponible');
        }

        return new Promise((resolve, reject) => {
            this.device.open((err) => {
                if (err) {
                    reject(new Error(`Error abriendo USB: ${err.message}`));
                    return;
                }

                this.device.write(buffer, (err) => {
                    if (err) {
                        reject(new Error(`Error escribiendo a USB: ${err.message}`));
                        return;
                    }

                    this.device.close((err) => {
                        if (err) {
                            console.log(chalk.yellow(`   Advertencia al cerrar USB: ${err.message}`));
                        }
                        resolve();
                    });
                });
            });
        });
    }
}

/**
 * Gestor de todas las impresoras
 */
class PrinterManager {
    constructor() {
        this.printers = new Map();
        this.defaultPrinter = null;
    }

    async initialize(printerConfigs) {
        console.log(chalk.yellow('\nInicializando impresoras...'));
        this.printers.clear();

        for (const config of printerConfigs) {
            try {
                let printer;

                if (config.type === 'usb') {
                    printer = new UsbPrinter(config);
                    await printer.initialize();
                } else if (config.type === 'ipp') {
                    // Impresora IPP (HP, Canon, etc. de oficina)
                    printer = new IppPrinter(config);
                    await printer.checkConnection();
                } else if (config.type === 'windows') {
                    // Impresora instalada en Windows (HP, Canon, etc.)
                    printer = new WindowsPrinter(config);
                    await printer.checkConnection();
                } else {
                    // Por defecto, red (ESC/POS térmica)
                    printer = new NetworkPrinter(config);
                    await printer.checkConnection();
                }

                this.printers.set(config.name, printer);

                if (config.default || !this.defaultPrinter) {
                    this.defaultPrinter = printer;
                }

                const status = printer.connected ? chalk.green('✓') : chalk.red('✗');
                console.log(`   ${status} ${config.name} (${printer.type})`);

            } catch (error) {
                console.log(chalk.red(`   ✗ ${config.name}: ${error.message}`));
            }
        }

        if (this.printers.size === 0) {
            console.log(chalk.yellow('   No hay impresoras configuradas'));
        }

        console.log('');
    }

    getPrinter(name) {
        if (!name || name === 'default') {
            return this.defaultPrinter;
        }
        return this.printers.get(name);
    }

    getStatus() {
        const status = [];
        for (const [name, printer] of this.printers) {
            status.push(printer.getStatus());
        }
        return status;
    }

    cleanup() {
        // Cerrar conexiones si es necesario
        this.printers.clear();
    }
}

module.exports = { PrinterManager, NetworkPrinter, UsbPrinter, WindowsPrinter, IppPrinter };
