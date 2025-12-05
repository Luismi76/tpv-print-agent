#!/usr/bin/env node
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
const notifier = require('node-notifier');
const { PrinterManager } = require('./printer-manager');
const { ConfigManager } = require('./config-manager');

// Banner
console.log(chalk.cyan(`
╔════════════════════════════════════════════╗
║         TPV Print Agent v1.0.0             ║
║   Agente de impresión para restaurantes    ║
╚════════════════════════════════════════════╝
`));

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
            console.log(chalk.yellow('Ejecuta: npm run configure'));
            console.log(chalk.yellow('O edita el archivo config.json\n'));
            process.exit(1);
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
        const fullUrl = `${wsUrl}/print-agent-ws?restaurantId=${settings.restaurantId}&apiKey=${settings.apiKey}`;

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
                version: '1.0.0',
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

// Iniciar agente
const agent = new PrintAgent();
agent.start().catch(error => {
    console.error(chalk.red('Error fatal:'), error);
    process.exit(1);
});
