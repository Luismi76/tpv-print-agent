#!/usr/bin/env node

// Capturar errores ANTES de cualquier require para que la ventana no se cierre
process.on('uncaughtException', (err) => {
    try { console.error('\n[ERROR FATAL]', err.message || err); } catch {}
    setTimeout(() => process.exit(1), 60000);
});
process.on('unhandledRejection', (err) => {
    try { console.error('\n[ERROR]', err.message || err); } catch {}
    setTimeout(() => process.exit(1), 60000);
});

/**
 * TPV Print Agent
 * ===============
 * Agente de impresión local que conecta impresoras del restaurante
 * con el backend TPV en la nube via WebSocket.
 *
 * Flujo:
 * 1. Se conecta al backend via WebSocket
 * 2. Recibe trabajos de impresión
 * 3. Imprime en las impresoras locales (red o USB)
 */

const WebSocket = require('ws');
const chalk = require('chalk');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const notifier = require('node-notifier');
const { PrinterManager } = require('./printer-manager');
const { ConfigManager } = require('./config-manager');

// Leer versión y autor de package.json (compatible con pkg)
let version = '1.2.0';
let author = 'Luis Miguel Santana Castaño';
try {
    const pkg = require('../package.json');
    version = pkg.version || version;
    author = pkg.author || author;
} catch {
    // En exe empaquetado, intentar ruta alternativa
    try {
        const pkgPath = path.join(path.dirname(process.execPath), 'package.json');
        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            version = pkg.version || version;
            author = pkg.author || author;
        }
    } catch { /* usar valores por defecto */ }
}

/**
 * Mantiene la ventana abierta 60s para que el usuario pueda leer el error.
 */
function waitBeforeExit(code = 1) {
    console.log(chalk.gray('\nLa ventana se cerrará en 60 segundos...'));
    setTimeout(() => process.exit(code), 60000);
}

// Banner
console.log(chalk.cyan(`
╔════════════════════════════════════════════╗
║       TPV Print Agent v${version.padEnd(18)}║
║   Agente de impresión para restaurantes    ║
║   ${author.padEnd(39)}║
╚════════════════════════════════════════════╝
`));

/**
 * Configura el agente automáticamente usando un token temporal.
 * Uso: tpv-print-agent --setup TOKEN --url https://bar-api.lmsc.es/api
 */
async function autoSetup(token, baseUrl) {
    const setupUrl = `${baseUrl}/print-agent/setup/${token}`;
    console.log(chalk.yellow(`Obteniendo configuración desde ${baseUrl}...`));

    return new Promise((resolve, reject) => {
        const client = setupUrl.startsWith('https') ? https : http;
        client.get(setupUrl, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Error ${res.statusCode}: ${body}`));
                    return;
                }
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(new Error('Respuesta inválida del servidor'));
                }
            });
        }).on('error', reject);
    });
}

/**
 * Parsea una URL de protocolo custom: tpv-print-agent://setup?token=X&url=Y
 * Retorna { token, url } o null si no es una URL de protocolo válida.
 */
function parseProtocolUrl(arg) {
    if (!arg || !arg.startsWith('tpv-print-agent://')) return null;
    try {
        // URL API no soporta protocolos custom, reemplazar para parsear
        const fakeUrl = arg.replace('tpv-print-agent://', 'http://localhost/');
        const parsed = new URL(fakeUrl);
        const token = parsed.searchParams.get('token');
        const url = parsed.searchParams.get('url');
        if (token && url) return { token, url };
    } catch { /* URL mal formada */ }
    return null;
}

/**
 * Lee un fichero .tpv-setup (JSON con { token, url })
 */
function readSetupFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        if (data.token && data.url) return data;
        console.log(chalk.red('El fichero .tpv-setup no contiene "token" y "url".'));
    } catch (error) {
        console.error(chalk.red(`Error leyendo fichero de setup: ${error.message}`));
    }
    return null;
}

/**
 * Ejecuta el setup con token y URL, guarda la configuración.
 */
async function executeSetup(token, baseUrl) {
    try {
        const config = await autoSetup(token, baseUrl);
        const configManager = new ConfigManager();
        configManager.updateSettings({
            serverUrl: config.serverUrl,
            restaurantId: config.restaurantId,
            apiKey: config.apiKey,
        });

        console.log(chalk.green(`\n✓ Configuración guardada correctamente`));
        console.log(chalk.gray(`  Servidor: ${config.serverUrl}`));
        console.log(chalk.gray(`  Restaurante: ${config.nombre} (ID: ${config.restaurantId})`));
        console.log(chalk.green(`\nEl agente se iniciará automáticamente.\n`));

        notifier.notify({
            title: 'TPV Print Agent',
            message: `Configurado: ${config.nombre}`,
            icon: 'info'
        });

        return true;
    } catch (error) {
        console.error(chalk.red(`\n✗ Error de setup: ${error.message}`));
        console.log(chalk.yellow('Comprueba que el token no haya expirado (validez: 10 min).'));
        return waitBeforeExit();
    }
}

// Comprobar si se ejecuta con --setup, --setup-file, o URL de protocolo
async function checkSetupMode() {
    const args = process.argv.slice(2);

    // 1. URL de protocolo: tpv-print-agent://setup?token=X&url=Y
    const protocolData = parseProtocolUrl(args[0]);
    if (protocolData) {
        console.log(chalk.yellow('Setup via enlace de protocolo...'));
        return executeSetup(protocolData.token, protocolData.url);
    }

    // 2. Fichero .tpv-setup: --setup-file "ruta/fichero.tpv-setup"
    const setupFileIdx = args.indexOf('--setup-file');
    if (setupFileIdx !== -1) {
        const filePath = args[setupFileIdx + 1];
        if (!filePath) {
            console.log(chalk.red('Uso: tpv-print-agent --setup-file "ruta/fichero.tpv-setup"'));
            return waitBeforeExit();
        }
        console.log(chalk.yellow(`Setup via fichero: ${filePath}`));
        const fileData = readSetupFile(filePath);
        if (!fileData) return waitBeforeExit();
        return executeSetup(fileData.token, fileData.url);
    }

    // 3. Modo clásico: --setup TOKEN --url URL
    const setupIdx = args.indexOf('--setup');
    if (setupIdx === -1) return false;

    const token = args[setupIdx + 1];
    const urlIdx = args.indexOf('--url');
    const baseUrl = urlIdx !== -1 ? args[urlIdx + 1] : null;

    if (!token || !baseUrl) {
        console.log(chalk.red('Uso: tpv-print-agent --setup TOKEN --url https://bar-api.lmsc.es/api'));
        return waitBeforeExit();
    }

    return executeSetup(token, baseUrl);
}

class PrintAgent {
    constructor() {
        this.config = new ConfigManager();
        this.printerManager = new PrinterManager();
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 5000;
        this.heartbeatInterval = null;
    }

    async start() {
        console.log(chalk.yellow('Iniciando TPV Print Agent...'));

        // Cargar configuración
        const settings = this.config.getSettings();

        if (!settings.serverUrl || !settings.restaurantId || !settings.apiKey) {
            console.log(chalk.red('\n⚠️  Configuración incompleta.'));
            console.log(chalk.yellow('Ejecuta: tpv-print-agent --setup TOKEN --url https://tu-api.lmsc.es/api'));
            console.log(chalk.yellow('Genera el token desde Configuración > Impresoras en la web.\n'));
            return waitBeforeExit();
        }

        console.log(chalk.gray(`Servidor: ${settings.serverUrl}`));
        console.log(chalk.gray(`Restaurante ID: ${settings.restaurantId}`));

        // Inicializar impresoras
        await this.printerManager.initialize(settings.printers || []);

        // Conectar al backend
        this.connect();

        // Manejar señales de cierre
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
    }

    connect() {
        const settings = this.config.getSettings();
        let wsUrl = settings.serverUrl.replace('https://', 'wss://').replace('http://', 'ws://');

        // Asegurar que el path incluye /api si el servidor usa context-path
        // Soporta ambos formatos: "https://server.com" y "https://server.com/api"
        if (!wsUrl.endsWith('/api')) {
            wsUrl = wsUrl.replace(/\/$/, '') + '/api';
        }

        // Usar /print-agent-ws (NO /ws/print-agent porque SockJS captura /ws/**)
        // apiKey se envía solo en headers (no en URL) para evitar que aparezca en logs de proxies
        const fullUrl = `${wsUrl}/print-agent-ws?restaurantId=${settings.restaurantId}`;

        console.log(chalk.yellow('\nConectando al servidor...'));

        this.ws = new WebSocket(fullUrl, {
            headers: {
                'X-Restaurant-Id': settings.restaurantId,
                'X-Api-Key': settings.apiKey
            }
        });

        this.ws.on('open', () => this.onOpen());
        this.ws.on('message', (data) => this.onMessage(data));
        this.ws.on('close', (code, reason) => this.onClose(code, reason));
        this.ws.on('error', (error) => this.onError(error));
    }

    onOpen() {
        console.log(chalk.green('✓ Conectado al servidor'));
        this.reconnectAttempts = 0;

        // Notificación de sistema
        notifier.notify({
            title: 'TPV Print Agent',
            message: 'Conectado al servidor',
            icon: 'info'
        });

        // Enviar registro de impresoras disponibles
        this.sendPrinterStatus();

        // Iniciar heartbeat
        this.startHeartbeat();
    }

    onMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            console.log(chalk.cyan(`\n📨 Mensaje recibido: ${message.type}`));

            switch (message.type) {
                case 'CONNECTED':
                    // Confirmación de conexión del servidor
                    console.log(chalk.green(`✓ Servidor confirmó conexión: ${message.payload?.message || 'OK'}`));
                    break;

                case 'HEARTBEAT_ACK':
                    // ACK del heartbeat - no hacer nada
                    break;

                case 'PRINT_JOB':
                    this.handlePrintJob(message.payload);
                    break;

                case 'PING':
                    this.sendMessage({ type: 'PONG', timestamp: Date.now() });
                    break;

                case 'CONFIG_UPDATE':
                    this.handleConfigUpdate(message.payload);
                    break;

                case 'PRINTER_TEST':
                    this.handlePrinterTest(message.payload);
                    break;

                case 'DISCOVER_PRINTERS':
                    this.handleDiscoverPrinters(message.payload);
                    break;

                default:
                    console.log(chalk.gray(`Mensaje desconocido: ${message.type}`));
            }
        } catch (error) {
            console.error(chalk.red('Error procesando mensaje:'), error.message);
        }
    }

    async handlePrintJob(job) {
        console.log(chalk.yellow(`\n🖨️  Trabajo de impresión recibido`));
        console.log(chalk.gray(`   ID: ${job.jobId}`));
        console.log(chalk.gray(`   Tipo: ${job.tipo}`));
        console.log(chalk.gray(`   Impresora: ${job.printerName || 'default'}`));

        try {
            // Buscar impresora
            const printer = this.printerManager.getPrinter(job.printerName);

            if (!printer) {
                throw new Error(`Impresora no encontrada: ${job.printerName || 'default'}`);
            }

            // Imprimir según el tipo de contenido
            if (job.contentType === 'escpos') {
                // Contenido ESC/POS raw (bytes)
                await printer.printRaw(Buffer.from(job.content, 'base64'));
            } else if (job.contentType === 'text') {
                // Texto plano
                await printer.printText(job.content);
            } else if (job.contentType === 'html') {
                // HTML renderizado a ESC/POS
                await printer.printHtml(job.content);
            }

            console.log(chalk.green(`✓ Impresión completada: ${job.jobId}`));

            // Confirmar al servidor
            this.sendMessage({
                type: 'PRINT_RESULT',
                payload: {
                    jobId: job.jobId,
                    status: 'SUCCESS',
                    timestamp: Date.now()
                }
            });

        } catch (error) {
            console.error(chalk.red(`✗ Error de impresión: ${error.message}`));

            // Notificar error
            notifier.notify({
                title: 'Error de Impresión',
                message: error.message,
                icon: 'error'
            });

            // Informar al servidor
            this.sendMessage({
                type: 'PRINT_RESULT',
                payload: {
                    jobId: job.jobId,
                    status: 'ERROR',
                    error: error.message,
                    timestamp: Date.now()
                }
            });
        }
    }

    async handlePrinterTest(payload) {
        console.log(chalk.yellow(`\n🧪 Prueba de impresora: ${payload.printerName}`));

        try {
            const printer = this.printerManager.getPrinter(payload.printerName);

            if (!printer) {
                throw new Error(`Impresora no encontrada: ${payload.printerName}`);
            }

            await printer.printTest();

            console.log(chalk.green('✓ Prueba completada'));
            this.sendMessage({
                type: 'TEST_RESULT',
                payload: {
                    printerName: payload.printerName,
                    status: 'SUCCESS'
                }
            });

        } catch (error) {
            console.error(chalk.red(`✗ Error en prueba: ${error.message}`));
            this.sendMessage({
                type: 'TEST_RESULT',
                payload: {
                    printerName: payload.printerName,
                    status: 'ERROR',
                    error: error.message
                }
            });
        }
    }

    async handleConfigUpdate(newConfig) {
        console.log(chalk.yellow('Actualizando configuración...'));

        if (newConfig.printers) {
            this.config.updatePrinters(newConfig.printers);
            // IMPORTANTE: Esperar a que la inicialización termine antes de enviar estado
            await this.printerManager.initialize(newConfig.printers);
        }

        console.log(chalk.green('✓ Configuración actualizada'));

        // Enviar estado actualizado al servidor para que refleje las nuevas impresoras
        this.sendPrinterStatus();
    }

    async handleDiscoverPrinters(payload) {
        console.log(chalk.yellow('\n🔍 Descubriendo impresoras disponibles...'));

        try {
            const discovered = await this.printerManager.discoverPrinters();

            console.log(chalk.green(`✓ Encontradas ${discovered.length} impresoras`));

            // Enviar resultado al servidor
            this.sendMessage({
                type: 'DISCOVER_RESULT',
                payload: {
                    printers: discovered,
                    timestamp: Date.now(),
                    requestId: payload?.requestId
                }
            });

        } catch (error) {
            console.error(chalk.red(`✗ Error descubriendo impresoras: ${error.message}`));
            this.sendMessage({
                type: 'DISCOVER_RESULT',
                payload: {
                    printers: [],
                    error: error.message,
                    timestamp: Date.now(),
                    requestId: payload?.requestId
                }
            });
        }
    }

    sendPrinterStatus() {
        const printers = this.printerManager.getStatus();

        this.sendMessage({
            type: 'AGENT_STATUS',
            payload: {
                version,
                platform: process.platform,
                printers: printers,
                timestamp: Date.now()
            }
        });
    }

    sendMessage(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    startHeartbeat() {
        this.stopHeartbeat();

        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.sendMessage({ type: 'HEARTBEAT', timestamp: Date.now() });
            }
        }, 30000); // Cada 30 segundos
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    onClose(code, reason) {
        console.log(chalk.yellow(`\nDesconectado del servidor (código: ${code})`));
        this.stopHeartbeat();

        // Intentar reconectar
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * this.reconnectAttempts;

            console.log(chalk.gray(`Reconectando en ${delay / 1000}s... (intento ${this.reconnectAttempts}/${this.maxReconnectAttempts})`));

            setTimeout(() => this.connect(), delay);
        } else {
            console.log(chalk.red('Máximo de intentos de reconexión alcanzado.'));
            notifier.notify({
                title: 'TPV Print Agent',
                message: 'No se puede conectar al servidor',
                icon: 'error'
            });
        }
    }

    onError(error) {
        console.error(chalk.red('Error de WebSocket:'), error.message);
    }

    shutdown() {
        console.log(chalk.yellow('\n\nCerrando TPV Print Agent...'));
        this.stopHeartbeat();

        if (this.ws) {
            this.ws.close();
        }

        this.printerManager.cleanup();
        console.log(chalk.green('¡Hasta luego!'));
        process.exit(0);
    }
}

// Iniciar agente (con soporte para --setup automático)
checkSetupMode().then(() => {
    const agent = new PrintAgent();
    agent.start().catch(error => {
        console.error(chalk.red('Error fatal:'), error);
        waitBeforeExit();
    });
}).catch(error => {
    console.error(chalk.red('Error inesperado:'), error);
    waitBeforeExit();
});
