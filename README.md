# TPV Print Agent

[![Release](https://img.shields.io/github/v/release/Luismi76/tpv-print-agent?style=flat-square)](https://github.com/Luismi76/tpv-print-agent/releases)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
[![Windows](https://img.shields.io/badge/platform-Windows-0078D6?style=flat-square&logo=windows)](https://github.com/Luismi76/tpv-print-agent/releases)

Agente de impresión local para el sistema TPV SaaS. Permite conectar impresoras locales (red y USB) del restaurante con el backend en la nube.

## Descarga

**[Descargar ultima version](https://github.com/Luismi76/tpv-print-agent/releases/latest)**

| Archivo | Descripcion |
|---------|-------------|
| `TPV-Print-Agent-X.X.X.msi` | Instalador Windows (recomendado) |
| `TPV-Print-Agent-X.X.X-portable.zip` | Version portable |

## Arquitectura

```
[Nube - backend.lmsc.es]                [Restaurante]
┌─────────────────────────┐            ┌─────────────────────────────┐
│  Backend API            │◄──────────►│  TPV Print Agent            │
│  └── WebSocket          │            │  ├── WebSocket Client       │
└─────────────────────────┘            │  └── ESC/POS Driver         │
                                       │                             │
                                       │  Impresoras                 │
                                       │  ├── Red (192.168.x.x:9100) │
                                       │  └── USB                    │
                                       └─────────────────────────────┘
```

## Requisitos

- Windows 10 o superior (también compatible con Linux y macOS)
- Node.js 18 o superior
- Conexión a Internet

## Instalación

### Opción 1: Ejecutable (Recomendado para usuarios)

1. Descarga `tpv-print-agent.exe` de la sección de releases
2. Ejecuta el instalador
3. Sigue el asistente de configuración

### Opción 2: Desde código fuente (Desarrolladores)

```bash
# Clonar repositorio
git clone https://github.com/lmsc/tpv-print-agent.git
cd tpv-print-agent

# Instalar dependencias
npm install

# Configurar
npm run configure

# Iniciar
npm start
```

## Configuración

Al ejecutar por primera vez, el asistente te pedirá:

1. **URL del servidor**: `https://backend.lmsc.es/api`
2. **ID del restaurante**: Proporcionado por el administrador
3. **API Key**: Proporcionado por el administrador
4. **Impresoras**: Puedes agregar una o más impresoras

### Ejemplo de configuración manual

El archivo de configuración se encuentra en:
- Windows: `%APPDATA%\tpv-print-agent\config.json`
- Linux/Mac: `~/.config/tpv-print-agent/config.json`

```json
{
  "serverUrl": "https://backend.lmsc.es/api",
  "restaurantId": "123",
  "apiKey": "tu-api-key-aqui",
  "printers": [
    {
      "name": "Tickets",
      "type": "network",
      "ip": "192.168.1.100",
      "port": 9100,
      "default": true
    },
    {
      "name": "Cocina",
      "type": "network",
      "ip": "192.168.1.101",
      "port": 9100
    }
  ]
}
```

## Tipos de impresoras soportadas

### Impresoras de Red (Recomendado)

La mayoría de impresoras térmicas profesionales soportan conexión por red:

| Marca | Modelos | Puerto |
|-------|---------|--------|
| Epson | TM-T88V, TM-T88VI, TM-T20III | 9100 |
| Star | TSP100, TSP650, mC-Print | 9100 |
| Bixolon | SRP-350, SRP-380 | 9100 |
| Citizen | CT-S310II, CT-E351 | 9100 |

### Impresoras USB

Para impresoras USB, se requiere:
- Driver de la impresora instalado
- Zadig (para libusb en Windows)

## Comandos

```bash
# Iniciar el agente
npm start

# Modo desarrollo (auto-reload)
npm run dev

# Configurar impresoras
npm run configure

# Crear ejecutable para Windows
npm run build
```

## Solución de problemas

### El agente no se conecta al servidor

1. Verifica que tienes conexión a Internet
2. Comprueba que la URL del servidor es correcta
3. Verifica que el ID y API Key son correctos

### La impresora no imprime

1. Verifica que la impresora está encendida
2. Comprueba que la IP y puerto son correctos
3. Prueba hacer ping a la IP de la impresora
4. Ejecuta `npm run configure` para probar la conexión

### Error de USB en Windows

Para impresoras USB en Windows, necesitas instalar Zadig:

1. Descarga [Zadig](https://zadig.akeo.ie/)
2. Conecta la impresora
3. En Zadig, selecciona tu impresora
4. Instala el driver WinUSB

## Ejecutar como servicio en Windows

Para que el agente se inicie automáticamente:

### Opción 1: Inicio de Windows

1. Presiona `Win + R`
2. Escribe `shell:startup`
3. Crea un acceso directo al ejecutable

### Opción 2: Servicio de Windows (NSSM)

```powershell
# Instalar NSSM
choco install nssm

# Crear servicio
nssm install TPVPrintAgent "C:\ruta\tpv-print-agent.exe"
nssm set TPVPrintAgent AppDirectory "C:\ruta"
nssm set TPVPrintAgent DisplayName "TPV Print Agent"
nssm set TPVPrintAgent Start SERVICE_AUTO_START

# Iniciar servicio
nssm start TPVPrintAgent
```

## Desarrollo

### Estructura del proyecto

```
tpv-print-agent/
├── src/
│   ├── index.js          # Punto de entrada
│   ├── config-manager.js # Gestión de configuración
│   ├── printer-manager.js # Gestión de impresoras
│   └── configure.js      # Asistente de configuración
├── package.json
└── README.md
```

### Generar ejecutable

```bash
# Solo Windows
npm run build

# Todas las plataformas
npm run build:all
```

## Licencia

MIT © LMSC
