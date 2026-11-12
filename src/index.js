import makeWASocket, {
    DisconnectReason,
    fetchLatestBaileysVersion,
    downloadMediaMessage
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import readline from 'readline';
import http from 'http';
import { randomBytes } from 'crypto';
import axios from 'axios';
import dotenv from 'dotenv';
import { createSticker } from './sticker.js';
import { handleFreeCommand } from './commands/free.js';
import { handleV2Command } from './commands/v2.js';
import { getAuthState } from './mongoAuth.js';
import { consultarDni, consultarTipoCambio } from './services/decolecta.js';

dotenv.config();

// Servidor HTTP: health check y panel web para escanear el QR de WhatsApp.
const PORT = process.env.PORT || 3000;
let currentQrDataUrl = null;
let currentQrUpdatedAt = null;
let currentPairingCode = null;
let connectionStatus = 'Iniciando conexión con WhatsApp…';
let connectionHint = 'Espera mientras WhatsApp inicia la conexión.';
let connectionUpdatedAt = new Date().toISOString();
const qrAccessToken = process.env.QR_ACCESS_TOKEN || randomBytes(18).toString('hex');
let reconnectTimer = null;
let reconnectAttempts = 0;

const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (requestUrl.pathname === '/qr') {
        if (requestUrl.searchParams.get('token') !== qrAccessToken) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
            return res.end('Acceso denegado. Usa el enlace QR privado mostrado en los logs del servicio.');
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate' });
        const qrMarkup = currentQrDataUrl
            ? `<section><h3>Opción 1 · Escanear QR</h3><p>WhatsApp → Dispositivos vinculados → Vincular un dispositivo</p><img alt="QR de WhatsApp" src="${currentQrDataUrl}" style="width:min(82vw,360px);background:white;padding:12px;border-radius:12px"><p style="color:#aaa">El QR caduca. Si deja de funcionar, espera a que se actualice.</p></section>`
            : '<section><h3>Opción 1 · Código QR</h3><p>El QR todavía no ha llegado desde WhatsApp.</p></section>';
        const pairingMarkup = currentPairingCode
            ? `<section style="margin-top:24px;padding:20px;border:1px solid #34343d;border-radius:14px"><h3>Opción 2 · Vincular con número</h3><p>En WhatsApp elige “Vincular con número de teléfono” e introduce:</p><div style="font-size:clamp(28px,8vw,42px);font-weight:700;letter-spacing:7px;background:#17171f;padding:18px;border-radius:10px">${currentPairingCode}</div><p style="color:#aaa">Este código es temporal y privado. No lo compartas.</p></section>`
            : (process.env.PAIRING_NUMBER ? '<p style="color:#aaa">El código aparecerá cuando WhatsApp esté listo. Requiere un PAIRING_NUMBER válido y una sesión nueva.</p>' : '<p style="color:#777">Para mostrar también un código numérico, configura PAIRING_NUMBER en Render.</p>');
        return res.end(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="3"><title>Drako Bot · Vincular WhatsApp</title><body style="margin:0;background:#0b0b0f;color:#f5f5f5;font:16px Arial;display:grid;min-height:100vh;place-items:center"><main style="text-align:center;padding:24px;max-width:560px;width:calc(100% - 32px)"><h2>Vincular WhatsApp</h2><p style="color:#9ee7b0">Estado: ${connectionStatus}</p><p style="color:#aaa">${connectionHint}</p>${qrMarkup}${pairingMarkup}<small style="color:#666">Última actualización: ${connectionUpdatedAt}</small></main></body></html>`);
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
        status: 'online',
        bot: 'WhatsApp Bot US',
        qr_panel: 'El enlace privado aparece en los logs del servicio. No uses el marcador TOKEN_PRIVADO.',
        time: new Date().toISOString(),
        auth_mode: process.env.MONGODB_URI ? 'MongoDB Atlas' : 'Local Disk'
    }));
});
server.listen(PORT, () => {
    console.log(`[HTTP] Servidor activo en puerto ${PORT}`);
    console.log(`[QR] Panel privado: /qr?token=${qrAccessToken}`);
});

const logger = pino({ level: process.env.LOG_LEVEL || 'silent' });

function getDisconnectDiagnostics(lastDisconnect) {
    const error = lastDisconnect?.error;
    const statusCode = error?.output?.statusCode ?? error?.statusCode ?? null;
    const reason = statusCode === null
        ? 'unknown'
        : (Object.entries(DisconnectReason).find(([, value]) => value === statusCode)?.[0] || 'unknown');
    const message = typeof error?.message === 'string'
        ? error.message.replace(/[\r\n\t]/g, ' ').slice(0, 180)
        : 'No se recibió mensaje de error';

    return {
        statusCode,
        reason,
        errorName: error?.name || 'Error',
        message
    };
}

function question(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => rl.question(query, (ans) => {
        rl.close();
        resolve(ans.trim());
    }));
}

function scheduleReconnect() {
    if (reconnectTimer) return;
    const delayMs = Math.min(30_000, 1_000 * (2 ** Math.min(reconnectAttempts, 5)));
    reconnectAttempts += 1;
    connectionStatus = `Reintentando conexión en ${Math.ceil(delayMs / 1000)} s…`;
    connectionUpdatedAt = new Date().toISOString();
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        startBot().catch(handleStartupError);
    }, delayMs);
}

function handleStartupError(err) {
    console.error('[FATAL] Error al iniciar el bot:', err.message);
    connectionStatus = 'No se pudo iniciar WhatsApp.';
    connectionHint = 'El servicio reintentará automáticamente. Revisa los logs si el problema continúa.';
    connectionUpdatedAt = new Date().toISOString();
    scheduleReconnect();
}

async function startBot() {
    // Carga de estado de sesión (MongoDB Atlas si existe MONGODB_URI, si no local)
    const authSessionName = process.env.AUTH_SESSION_NAME || 'session_us';
    const { state, saveCreds } = await getAuthState(process.env.MONGODB_URI, authSessionName);
    console.log(`[AUTH] Estado cargado: registered=${Boolean(state.creds.registered)}; cuenta vinculada=${Boolean(state.creds.me?.id)}`);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[BOT] Baileys v${version.join('.')} (Última: ${isLatest})`);

    let phoneNumber = process.env.PAIRING_NUMBER || '';
    if (!state.creds.registered && !phoneNumber && process.stdin.isTTY) {
        console.log('\nMODO DE VINCULACIÓN: escribe tu número para recibir código o ENTER para QR.');
        phoneNumber = await question('Número con código de país o ENTER: ');
    }
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    const validPairingNumber = /^\d{7,15}$/.test(cleanNumber);
    if (phoneNumber && !validPairingNumber) {
        connectionHint = 'PAIRING_NUMBER debe incluir el código de país y tener entre 7 y 15 dígitos. El QR seguirá disponible si la sesión es nueva.';
        console.error('[BOT] PAIRING_NUMBER inválido: usa solo el número internacional con código de país.');
    }

    const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: state,
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    // Baileys emite el QR cuando el socket ya está listo. Ese mismo evento permite
    // solicitar un código de vinculación sin competir con el arranque de la conexión.
    let pairingCodeRequested = false;
    let socketClosed = false;
    let socketOpen = false;
    let qrGeneration = 0;
    sock.ev.on('connection.update', async (update) => {
        const { qr, connection, lastDisconnect } = update;
        if (connection) {
            connectionStatus = connection === 'open' ? 'Conectado correctamente' : connection === 'connecting' ? 'Conectando…' : connectionStatus;
            connectionUpdatedAt = new Date().toISOString();
            console.log(`[BOT] Estado de conexión: ${connection}`);
        }
        if (qr) {
            const generation = ++qrGeneration;
            try {
                const qrDataUrl = await QRCode.toDataURL(qr, {
                    width: 440,
                    margin: 2,
                    errorCorrectionLevel: 'M'
                });
                if (!socketClosed && generation === qrGeneration) {
                    currentQrDataUrl = qrDataUrl;
                    currentQrUpdatedAt = new Date().toISOString();
                    connectionStatus = 'QR listo para escanear';
                    connectionHint = 'En WhatsApp abre Dispositivos vinculados → Vincular un dispositivo y escanea el QR.';
                    connectionUpdatedAt = currentQrUpdatedAt;
                    console.log('[QR] Nuevo código disponible en el panel web.');
                    if (process.stdin.isTTY) {
                        console.log('\n[BOT] Escanea este código QR con WhatsApp:');
                        qrcodeTerminal.generate(qr, { small: true });
                    }
                }
            } catch (err) {
                console.error('[QR] No se pudo preparar la imagen:', err.message);
            }

            if (!state.creds.registered && validPairingNumber && !pairingCodeRequested && !socketClosed) {
                pairingCodeRequested = true;
                connectionStatus = 'Solicitando código de vinculación…';
                connectionHint = 'Introduce el número de 8 dígitos en WhatsApp → Dispositivos vinculados → Vincular con número de teléfono.';
                connectionUpdatedAt = new Date().toISOString();
                try {
                    const code = await sock.requestPairingCode(cleanNumber);
                    if (socketClosed || socketOpen) return;
                    currentPairingCode = code;
                    connectionStatus = 'Código de vinculación generado';
                    connectionUpdatedAt = new Date().toISOString();
                    console.log('\n------------------------------------------------------');
                    console.log(` CÓDIGO DE VINCULACIÓN PARA ${cleanNumber}:`);
                    console.log(` >>> ${code} <<<`);
                    console.log(' En WhatsApp: Ajustes > Dispositivos vinculados > Vincular con el número de teléfono.');
                    console.log('------------------------------------------------------\n');
                } catch (err) {
                    if (socketClosed || socketOpen) return;
                    connectionStatus = currentQrDataUrl
                        ? 'Código no disponible; puedes escanear el QR.'
                        : 'No se pudo solicitar el código. Revisa los logs del servicio.';
                    connectionHint = currentQrDataUrl
                        ? 'Usa el QR de esta página. Si tampoco funciona, cambia AUTH_SESSION_NAME por un nombre nuevo y reinicia.'
                        : 'Revisa los logs. Si WhatsApp rechazó la sesión guardada, cambia AUTH_SESSION_NAME por un nombre nuevo y reinicia.';
                    connectionUpdatedAt = new Date().toISOString();
                    console.error('[BOT] Error al solicitar código de vinculación:', err.message);
                }
            }
        }
        if (connection === 'open') {
            socketClosed = false;
            socketOpen = true;
            qrGeneration += 1;
            reconnectAttempts = 0;
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
            currentQrDataUrl = null;
            currentQrUpdatedAt = null;
            currentPairingCode = null;
            connectionStatus = 'Conectado correctamente';
            connectionHint = 'La cuenta de WhatsApp quedó vinculada.';
            connectionUpdatedAt = new Date().toISOString();
        }
        if (connection === 'close') {
            socketClosed = true;
            socketOpen = false;
            qrGeneration += 1;
            currentQrDataUrl = null;
            currentQrUpdatedAt = null;
            currentPairingCode = null;
            const diagnostics = getDisconnectDiagnostics(lastDisconnect);
            const shouldReconnect = diagnostics.statusCode !== DisconnectReason.loggedOut;
            console.error('[BOT] Diagnóstico de desconexión:', JSON.stringify({
                ...diagnostics,
                reconnecting: shouldReconnect
            }));
            connectionStatus = shouldReconnect
                ? `Conexión cerrada (${diagnostics.statusCode ?? 'sin código'}). Reintentando…`
                : `WhatsApp rechazó la sesión (${diagnostics.statusCode ?? 'sin código'}).`;
            connectionHint = shouldReconnect
                ? 'El bot volverá a intentar conectarse automáticamente.'
                : 'La sesión guardada fue rechazada. En Render, asigna un AUTH_SESSION_NAME nuevo y reinicia para vincular de nuevo sin borrar la sesión anterior.';
            connectionUpdatedAt = new Date().toISOString();

            if (shouldReconnect) {
                scheduleReconnect();
            } else {
                console.error('[BOT] WhatsApp indicó loggedOut; no se reintentará con estas credenciales.');
            }
        } else if (connection === 'open') {
            console.log('\n======================================================');
            console.log(' [BOT] ¡CONECTADO CON ÉXITO A WHATSAPP!');
            console.log(` Modo de sesión: ${process.env.MONGODB_URI ? 'MongoDB Atlas (Persistente)' : 'Local'}`);
            console.log('======================================================\n');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Procesamiento de mensajes entrantes
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (!msg.message || msg.key.remoteJid === 'status@broadcast') continue;

            const from = msg.key.remoteJid;
            const isGroup = from.endsWith('@g.us');

            // Extraer texto
            const text = (
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                msg.message.imageMessage?.caption ||
                msg.message.videoMessage?.caption ||
                ''
            ).trim();

            const isImage = Boolean(msg.message.imageMessage);
            const isQuotedImage = Boolean(
                msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage
            );

            // Comandos gratuitos y minijuegos (se procesan antes de los comandos antiguos).
            if (await handleV2Command(sock, from, msg, text)) continue;
            if (await handleFreeCommand(sock, from, msg, text)) continue;

            // 1. COMANDO: STICKER (/s o /sticker o auto-sticker)
            const stickerCommand = /^\/(s|sticker)(?:\s|$)/i.test(text);
            const isStickerCommand = stickerCommand ||
                                     (process.env.AUTO_STICKER === 'true' && isImage && !text.startsWith('/'));

            if (isStickerCommand && (isImage || isQuotedImage)) {
                try {
                    await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

                    let buffer;
                    if (isImage) {
                        buffer = await downloadMediaMessage(msg, 'buffer', {});
                    } else if (isQuotedImage) {
                        const quotedMsg = {
                            key: {
                                remoteJid: from,
                                id: msg.message.extendedTextMessage.contextInfo.stanzaId
                            },
                            message: msg.message.extendedTextMessage.contextInfo.quotedMessage
                        };
                        buffer = await downloadMediaMessage(quotedMsg, 'buffer', {});
                    }

                    if (buffer) {
                        const stickerBuffer = await createSticker(
                            buffer,
                            process.env.STICKER_PACK || 'Bot Pack',
                            process.env.STICKER_AUTHOR || 'US Bot'
                        );

                        await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });
                        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
                    }
                } catch (err) {
                    console.error('[BOT] Error creando sticker:', err);
                    await sock.sendMessage(from, { text: '❌ Ocurrió un error al procesar el sticker.' }, { quoted: msg });
                }
                continue;
            }

            // 2. COMANDO: CONSULTA DNI RENIEC (/dni 46027897)
            if (text.toLowerCase().startsWith('/dni')) {
                const parts = text.split(/\s+/);
                const dniArg = parts[1];

                if (!dniArg) {
                    await sock.sendMessage(from, {
                        text: '⚠️ *Uso incorrecto del comando*\n\nEjemplo: `/dni 46027897`'
                    }, { quoted: msg });
                    continue;
                }

                try {
                    await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } });
                    const decolectaToken = process.env.DECOLECTA_TOKEN;
                    const data = await consultarDni(dniArg, decolectaToken);

                    const respuesta = `📑 *CONSULTA RENIEC — PERSONA*\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `👤 *Nombres:* ${data.first_name || 'No disponible'}\n` +
                        `🔹 *Apellido Paterno:* ${data.first_last_name || 'No disponible'}\n` +
                        `🔹 *Apellido Materno:* ${data.second_last_name || 'No disponible'}\n` +
                        `📋 *Nombre Completo:* ${data.full_name || `${data.first_last_name} ${data.second_last_name} ${data.first_name}`}\n` +
                        `🆔 *DNI:* ${data.document_number || dniArg}\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `✨ *Fuente:* RENIEC vía Decolecta`;

                    await sock.sendMessage(from, { text: respuesta }, { quoted: msg });
                    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
                } catch (err) {
                    await sock.sendMessage(from, {
                        text: `❌ *Error al consultar DNI:*\n${err.message}`
                    }, { quoted: msg });
                    await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                }
                continue;
            }

            // 3. COMANDO: TIPO DE CAMBIO SUNAT (/dolar, /tc, /sunat)
            if (text.toLowerCase().startsWith('/dolar') || text.toLowerCase().startsWith('/tc') || text.toLowerCase().startsWith('/sunat')) {
                const parts = text.split(/\s+/);
                const fechaArg = parts[1] || null;

                try {
                    await sock.sendMessage(from, { react: { text: '💵', key: msg.key } });
                    const decolectaToken = process.env.DECOLECTA_TOKEN;
                    const data = await consultarTipoCambio(decolectaToken, fechaArg);

                    const respuesta = `💵 *TIPO DE CAMBIO SUNAT (OFICIAL)*\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `🟢 *Compra:* S/ ${data.buy_price}\n` +
                        `🔴 *Venta:* S/ ${data.sell_price}\n` +
                        `📅 *Fecha:* ${data.date || 'Actual'}\n` +
                        `💱 *Moneda:* ${data.base_currency || 'USD'} ➔ ${data.quote_currency || 'PEN'}\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `✨ *Fuente:* SUNAT vía Decolecta`;

                    await sock.sendMessage(from, { text: respuesta }, { quoted: msg });
                    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
                } catch (err) {
                    await sock.sendMessage(from, {
                        text: `❌ *Error al consultar Tipo de Cambio:*\n${err.message}`
                    }, { quoted: msg });
                    await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                }
                continue;
            }

            // 4. COMANDO: GENERADOR DE QR (/qr <texto o link>)
            if (text.toLowerCase().startsWith('/qr')) {
                const qrContent = text.slice(3).trim();
                if (!qrContent) {
                    await sock.sendMessage(from, {
                        text: '⚠️ *Uso del comando:* `/qr <texto o enlace>`\nEjemplo: `/qr https://google.com`'
                    }, { quoted: msg });
                    continue;
                }

                try {
                    const qrBuffer = await QRCode.toBuffer(qrContent, {
                        width: 512,
                        margin: 2,
                        color: { dark: '#000000', light: '#ffffff' }
                    });

                    await sock.sendMessage(from, {
                        image: qrBuffer,
                        caption: `📱 *Código QR Generado*\n\nContenido: ${qrContent}`
                    }, { quoted: msg });
                } catch (err) {
                    await sock.sendMessage(from, { text: `❌ Error al generar QR: ${err.message}` }, { quoted: msg });
                }
                continue;
            }

            // 5. COMANDO: CALCULADORA (/calc 150 * 3.75)
            if (text.toLowerCase().startsWith('/calc')) {
                const expr = text.slice(5).trim();
                if (!expr) {
                    await sock.sendMessage(from, {
                        text: '⚠️ *Uso del comando:* `/calc <operación>`\nEjemplo: `/calc 150 * 3.75`'
                    }, { quoted: msg });
                    continue;
                }

                try {
                    // Sanitizar expresión matemática (solo permitir números, operadores y paréntesis)
                    if (!/^[0-9+\-*/().\s%^]+$/.test(expr)) {
                        throw new Error('Expresión inválida. Solo números y operadores (+ - * / %).');
                    }
                    const resultado = Function(`'use strict'; return (${expr})`)();
                    await sock.sendMessage(from, {
                        text: `🧮 *Calculadora*\n\n• Operación: \`${expr}\`\n• Resultado: *${resultado}*`
                    }, { quoted: msg });
                } catch (err) {
                    await sock.sendMessage(from, { text: `❌ Error en el cálculo: ${err.message}` }, { quoted: msg });
                }
                continue;
            }

            // 6. COMANDO: CLIMA (/clima Lima o /clima Miami)
            if (text.toLowerCase().startsWith('/clima')) {
                const ciudad = text.slice(6).trim();
                if (!ciudad) {
                    await sock.sendMessage(from, {
                        text: '⚠️ *Uso del comando:* `/clima <ciudad>`\nEjemplo: `/clima Lima`'
                    }, { quoted: msg });
                    continue;
                }

                try {
                    const res = await axios.get(`https://wttr.in/${encodeURIComponent(ciudad)}?format=3`, { timeout: 8000 });
                    await sock.sendMessage(from, {
                        text: `🌤️ *Pronóstico del Clima*\n\n${res.data.trim()}`
                    }, { quoted: msg });
                } catch (err) {
                    await sock.sendMessage(from, { text: `❌ No se pudo consultar el clima para "${ciudad}".` }, { quoted: msg });
                }
                continue;
            }

            // 7. COMANDO: PING (/ping)
            if (text.toLowerCase() === '/ping') {
                const timestamp = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now();
                const latencia = Math.abs(Date.now() - timestamp);
                await sock.sendMessage(from, {
                    text: `🏓 *¡Pong!*\n• Latencia: *${latencia} ms*\n• Estado: *En línea y respondiendo*`
                }, { quoted: msg });
                continue;
            }

            // 8. COMANDO: INFO DEL SISTEMA (/info)
            if (text.toLowerCase() === '/info') {
                const memoriaMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
                const uptimeHoras = (process.uptime() / 3600).toFixed(2);
                const authMode = process.env.MONGODB_URI ? 'MongoDB Atlas (Persistente)' : 'Disco Local';

                const infoText = `🤖 *ESTADO DEL ASISTENTE*\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `• *Número:* EE.UU. (+1)\n` +
                    `• *Motor:* Baileys v${version.join('.')}\n` +
                    `• *Sesión:* ${authMode}\n` +
                    `• *Memoria RAM:* ${memoriaMB} MB\n` +
                    `• *Tiempo activo:* ${uptimeHoras} horas\n` +
                    `• *Servicio HTTP:* Puerto ${PORT}\n` +
                    `━━━━━━━━━━━━━━━━━━━━`;

                await sock.sendMessage(from, { text: infoText }, { quoted: msg });
                continue;
            }

            // 9. COMANDO: MENÚ PRINCIPAL (/menu o /ayuda)
            if (text.toLowerCase() === '/menu' || text.toLowerCase() === '/ayuda' || text.toLowerCase() === '!menu') {
                const menuText = `🤖 *PANEL DE COMANDOS — ASISTENTE WHATSAPP*\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `🇵🇪 *CONSULTAS PERÚ (RENIEC / SUNAT)*\n` +
                    `• */dni <número>* : Consulta nombres y apellidos en RENIEC.\n` +
                    `• */dolar* o */tc* : Tipo de cambio oficial SUNAT (compra/venta).\n\n` +
                    `🎨 *STICKERS & MULTIMEDIA*\n` +
                    `• */s* o */sticker* : Convierte una foto en sticker WebP.\n` +
                    `• */qr <texto/url>* : Genera una imagen de código QR.\n\n` +
                    `🛠️ *UTILIDADES*\n` +
                    `• */calc <operación>* : Realiza cálculos matemáticos rápidos.\n` +
                    `• */clima <ciudad>* : Pronóstico del tiempo actual.\n\n` +
                    `⚙️ *SISTEMA*\n` +
                    `• */ping* : Medir latencia de respuesta.\n` +
                    `• */info* : Estado de memoria, sesión y tiempo activo.\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `⚡ _Alojado y activo 24/7_`;

                await sock.sendMessage(from, { text: menuText }, { quoted: msg });
                continue;
            }

            // 10. AUTO-RESPUESTA (Chats privados que no son comandos)
            if (!isGroup && process.env.AUTO_REPLY === 'true' && !msg.key.fromMe) {
                if (!text.startsWith('/')) {
                    const autoMsg = process.env.AUTO_REPLY_TEXT ||
                        '👋 ¡Hola! Soy un bot automatizado. Escribe */menu* para ver la lista completa de comandos o envíame una imagen con */s* para hacerla sticker.';
                    await sock.sendMessage(from, { text: autoMsg }, { quoted: msg });
                }
            }
        }
    });
}

startBot().catch(handleStartupError);
