#!/usr/bin/env node
/**
 * Servidor WebSocket de prueba para el Print Agent
 * Simula el backend para testing local
 */

const WebSocket = require('ws');
const http = require('http');

const PORT = 9090;

// Crear servidor HTTP
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('TPV Test Server\n');
});

// Crear servidor WebSocket
const wss = new WebSocket.Server({ server, path: '/api/ws/print-agent' });

console.log(`
╔════════════════════════════════════════════╗
║     TPV Test Server - WebSocket Mock       ║
╚════════════════════════════════════════════╝

Servidor escuchando en:
  HTTP: http://localhost:${PORT}
  WebSocket: ws://localhost:${PORT}/api/ws/print-agent

Esperando conexión del Print Agent...
`);

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const restaurantId = url.searchParams.get('restaurantId');
    const apiKey = url.searchParams.get('apiKey');

    console.log(`\n✓ Print Agent conectado`);
    console.log(`  Restaurant ID: ${restaurantId}`);
    console.log(`  API Key: ${apiKey ? '***' + apiKey.slice(-4) : 'none'}`);

    // Enviar confirmación
    ws.send(JSON.stringify({
        type: 'CONNECTED',
        payload: {
            message: 'Conectado al servidor de prueba',
            restaurantId
        }
    }));

    // Manejar mensajes
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            console.log(`\n📨 Mensaje recibido: ${message.type}`);

            switch (message.type) {
                case 'HEARTBEAT':
                    ws.send(JSON.stringify({
                        type: 'HEARTBEAT_ACK',
                        payload: { timestamp: Date.now() }
                    }));
                    break;

                case 'AGENT_STATUS':
                    console.log('   Impresoras:', JSON.stringify(message.payload.printers, null, 2));
                    break;

                case 'PRINT_RESULT':
                    console.log(`   Job: ${message.payload.jobId}`);
                    console.log(`   Status: ${message.payload.status}`);
                    break;

                default:
                    console.log('   Payload:', JSON.stringify(message.payload, null, 2));
            }
        } catch (e) {
            console.log('Error parsing message:', e.message);
        }
    });

    ws.on('close', () => {
        console.log('\n✗ Print Agent desconectado');
    });

    // Menú interactivo
    console.log(`
Comandos disponibles (escribe y presiona Enter):
  1 - Enviar trabajo de impresión de prueba
  2 - Solicitar prueba de impresora
  3 - Enviar ping
  q - Salir
`);
});

// Leer input del usuario
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.on('line', (input) => {
    const clients = [...wss.clients];

    if (clients.length === 0) {
        console.log('No hay Print Agent conectado');
        return;
    }

    const ws = clients[0];

    switch (input.trim()) {
        case '1':
            // Enviar trabajo de impresión
            const testTicket = `
================================
       TICKET DE PRUEBA
================================
Fecha: ${new Date().toLocaleString('es-ES')}
--------------------------------
1x Cafe con leche        2.50
1x Tostada               1.80
--------------------------------
TOTAL:                   4.30 EUR
================================
      Gracias por su visita
================================
`;
            const job = {
                type: 'PRINT_JOB',
                payload: {
                    jobId: 'test-' + Date.now(),
                    tipo: 'TICKET',
                    printerName: 'default',
                    contentType: 'text',
                    content: Buffer.from(testTicket).toString('base64')
                }
            };
            ws.send(JSON.stringify(job));
            console.log('📤 Trabajo de impresión enviado');
            break;

        case '2':
            ws.send(JSON.stringify({
                type: 'PRINTER_TEST',
                payload: { printerName: 'Tickets' }
            }));
            console.log('📤 Solicitud de prueba enviada');
            break;

        case '3':
            ws.send(JSON.stringify({
                type: 'PING',
                payload: { timestamp: Date.now() }
            }));
            console.log('📤 Ping enviado');
            break;

        case 'q':
            console.log('Cerrando servidor...');
            process.exit(0);
            break;

        default:
            console.log('Comando no reconocido');
    }
});

server.listen(PORT, () => {
    console.log(`Servidor iniciado en puerto ${PORT}`);
});
