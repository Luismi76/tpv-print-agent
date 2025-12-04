/**
 * Gestor de Configuración
 * =======================
 * Maneja la configuración persistente del agente
 */

const fs = require('fs');
const path = require('path');

class ConfigManager {
    constructor() {
        // Determinar ruta del archivo de configuración
        this.configPath = this.getConfigPath();
        this.settings = this.loadSettings();
    }

    getConfigPath() {
        // En Windows: %APPDATA%/tpv-print-agent/config.json
        // En Linux/Mac: ~/.config/tpv-print-agent/config.json
        const appData = process.env.APPDATA ||
            (process.platform === 'darwin'
                ? path.join(process.env.HOME, 'Library', 'Application Support')
                : path.join(process.env.HOME, '.config'));

        const configDir = path.join(appData, 'tpv-print-agent');

        // Crear directorio si no existe
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }

        return path.join(configDir, 'config.json');
    }

    loadSettings() {
        try {
            if (fs.existsSync(this.configPath)) {
                const content = fs.readFileSync(this.configPath, 'utf-8');
                return JSON.parse(content);
            }
        } catch (error) {
            console.error('Error cargando configuración:', error.message);
        }

        // Configuración por defecto
        return {
            serverUrl: '',
            restaurantId: '',
            apiKey: '',
            printers: []
        };
    }

    saveSettings() {
        try {
            const content = JSON.stringify(this.settings, null, 2);
            fs.writeFileSync(this.configPath, content, 'utf-8');
            return true;
        } catch (error) {
            console.error('Error guardando configuración:', error.message);
            return false;
        }
    }

    getSettings() {
        return this.settings;
    }

    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        return this.saveSettings();
    }

    updatePrinters(printers) {
        this.settings.printers = printers;
        return this.saveSettings();
    }

    addPrinter(printer) {
        // Evitar duplicados
        const index = this.settings.printers.findIndex(p => p.name === printer.name);
        if (index >= 0) {
            this.settings.printers[index] = printer;
        } else {
            this.settings.printers.push(printer);
        }
        return this.saveSettings();
    }

    removePrinter(name) {
        this.settings.printers = this.settings.printers.filter(p => p.name !== name);
        return this.saveSettings();
    }

    getConfigPath() {
        // Primero buscar en el directorio actual (para desarrollo)
        const localConfig = path.join(process.cwd(), 'config.json');
        if (fs.existsSync(localConfig)) {
            return localConfig;
        }

        // En Windows: %APPDATA%/tpv-print-agent/config.json
        // En Linux/Mac: ~/.config/tpv-print-agent/config.json
        const appData = process.env.APPDATA ||
            (process.platform === 'darwin'
                ? path.join(process.env.HOME, 'Library', 'Application Support')
                : path.join(process.env.HOME, '.config'));

        const configDir = path.join(appData, 'tpv-print-agent');

        // Crear directorio si no existe
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }

        return path.join(configDir, 'config.json');
    }
}

module.exports = { ConfigManager };
