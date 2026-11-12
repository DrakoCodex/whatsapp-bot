import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import sharp from 'sharp';

const games = new Map();
const triviaGames = new Map();

const trivia = [
  { q: '¿Cuál es el planeta más grande del sistema solar?', a: ['jupiter', 'júpiter'] },
  { q: '¿Cuántos lados tiene un hexágono?', a: ['6', 'seis'] },
  { q: '¿Cuál es la capital de Perú?', a: ['lima'] },
  { q: '¿Qué lenguaje se ejecuta principalmente en Node.js?', a: ['javascript', 'js'] },
  { q: '¿Cuánto es 9 × 8?', a: ['72', 'setenta y dos'] },
  { q: '¿Qué gas absorben principalmente las plantas?', a: ['dioxido de carbono', 'dióxido de carbono', 'co2'] }
];

const jokes = [
  '¿Qué hace una abeja en el gimnasio? ¡Zum-ba! 🐝',
  '¿Por qué el libro de matemáticas estaba triste? Porque tenía muchos problemas. 📘',
  '¿Qué le dice un bit al otro? Nos vemos en el bus. 💻',
  '¿Cuál es el colmo de un programador? Que su pareja le diga: necesitamos hablar y él responda: ¿en qué lenguaje? 😂'
];

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, (char) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
  })[char]);
}

async function send(sock, from, msg, text) {
  await sock.sendMessage(from, { text }, { quoted: msg });
}

export async function handleFreeCommand(sock, from, msg, rawText) {
  const input = String(rawText || '').trim();
  if (!input.startsWith('/')) return false;

  const [rawCommand, ...args] = input.split(/\s+/);
  const command = rawCommand.toLowerCase();
  const argText = input.slice(rawCommand.length).trim();

  // Menú numerado: funciona como alternativa universal cuando el cliente no admite botones nativos.
  if (['/menu', '/ayuda', '!menu'].includes(command)) {
    await send(sock, from, msg,
      '🤖 *DRako BOT — MENÚ INTERACTIVO*\n' +
      '━━━━━━━━━━━━━━━━━━━━\n' +
      'Responde escribiendo el comando que aparece junto a cada opción.\n\n' +
      '🇵🇪 *PERÚ*\n/dni <número> · Consulta RENIEC (servicio configurado)\n/tc · Tipo de cambio SUNAT\n/clima <ciudad> · Clima actual\n\n' +
      '🎨 *CREATIVIDAD*\n/s · Sticker desde una imagen\n/stickertexto <frase> · Sticker con texto\n/qr <texto> · Crear QR\n\n' +
      '🎮 *MINIJUEGOS*\n/juegos · Ver juegos\n/adivina · Adivina el número\n/trivia · Pregunta de cultura general\n/ppt piedra|papel|tijera · Duelo\n/dado · Lanzar dado\n/moneda · Cara o cruz\n/8ball <pregunta> · Bola mágica\n\n' +
      '🧰 *UTILIDADES GRATIS*\n/password [longitud] · Contraseña segura\n/uuid · Identificador aleatorio\n/base64 encode|decode <texto> · Base64\n/texto <texto> · Contar caracteres\n/reversa <texto> · Invertir texto\n/elige opción 1 | opción 2 · Elegir al azar\n/rango <mín> <máx> · Número aleatorio\n/hora [zona horaria] · Hora local\n/chiste · Chiste aleatorio\n/calc <operación> · Calculadora\n\n' +
      '⚙️ *SISTEMA*\n/ping · Estado de respuesta\n/info · Estado del bot\n\n' +
      '━━━━━━━━━━━━━━━━━━━━\n⚡ Funciones locales gratuitas; algunas consultas existentes requieren sus APIs configuradas.'
    );
    return true;
  }

  if (command === '/juegos') {
    await send(sock, from, msg,
      '🎮 *MINIJUEGOS DISPONIBLES*\n\n' +
      '🎯 /adivina — Adivina un número del 1 al 10.\n' +
      '🧠 /trivia — Responde una pregunta. Usa /respuesta <respuesta>.\n' +
      '✊ /ppt piedra|papel|tijera — Juega contra el bot.\n' +
      '🎲 /dado — Lanza un dado.\n' +
      '🪙 /moneda — Cara o cruz.\n' +
      '🔮 /8ball <pregunta> — Consulta la bola mágica.\n\n' +
      'Todos son gratuitos y no necesitan cuentas externas.'
    );
    return true;
  }

  if (command === '/adivina') {
    const current = games.get(from);
    if (!args.length || !current) {
      const secret = Math.floor(Math.random() * 10) + 1;
      games.set(from, { secret, attempts: 0, expires: Date.now() + 10 * 60 * 1000 });
      await send(sock, from, msg, '🎯 *ADIVINA EL NÚMERO*\nEstoy pensando en un número del 1 al 10.\nEscribe */adivina 7* para probar. Tienes 5 intentos.');
      return true;
    }
    if (Date.now() > current.expires) {
      games.delete(from);
      await send(sock, from, msg, '⌛ La partida expiró. Escribe /adivina para comenzar otra.');
      return true;
    }
    const guess = Number(args[0]);
    if (!Number.isInteger(guess) || guess < 1 || guess > 10) {
      await send(sock, from, msg, 'Escribe un número entero del 1 al 10. Ejemplo: /adivina 7');
      return true;
    }
    current.attempts += 1;
    if (guess === current.secret) {
      games.delete(from);
      await send(sock, from, msg, `🎉 ¡Correcto! Era el número *${current.secret}*. Lo lograste en ${current.attempts} intento(s).`);
    } else if (current.attempts >= 5) {
      games.delete(from);
      await send(sock, from, msg, `😅 Se acabaron los intentos. El número era *${current.secret}*. Escribe /adivina para volver a jugar.`);
    } else {
      await send(sock, from, msg, `❌ ${guess < current.secret ? 'Más alto ⬆️' : 'Más bajo ⬇️'}. Te quedan *${5 - current.attempts}* intentos.`);
    }
    return true;
  }

  if (command === '/trivia') {
    const item = pick(trivia);
    triviaGames.set(from, { answers: item.a, expires: Date.now() + 5 * 60 * 1000 });
    await send(sock, from, msg, `🧠 *TRIVIA*\n\n${item.q}\n\nResponde con */respuesta <tu respuesta>*. Tienes 5 minutos.`);
    return true;
  }

  if (command === '/respuesta') {
    const game = triviaGames.get(from);
    if (!game || Date.now() > game.expires) {
      triviaGames.delete(from);
      await send(sock, from, msg, 'No tienes una trivia activa. Escribe /trivia para comenzar.');
      return true;
    }
    const answer = normalize(argText);
    if (game.answers.includes(answer)) {
      triviaGames.delete(from);
      await send(sock, from, msg, '✅ ¡Respuesta correcta! ¡Bien jugado!');
    } else {
      await send(sock, from, msg, '❌ No es correcto. Puedes intentarlo otra vez o iniciar otra pregunta con /trivia.');
    }
    return true;
  }

  if (command === '/ppt') {
    const choice = normalize(args[0]);
    const aliases = { piedra: 'piedra', rock: 'piedra', papel: 'papel', paper: 'papel', tijera: 'tijera', tijeras: 'tijera', scissors: 'tijera' };
    const user = aliases[choice];
    if (!user) {
      await send(sock, from, msg, '✊ Uso: /ppt piedra, /ppt papel o /ppt tijera.');
      return true;
    }
    const bot = pick(['piedra', 'papel', 'tijera']);
    const result = user === bot ? '🤝 ¡Empate!' :
      ((user === 'piedra' && bot === 'tijera') || (user === 'papel' && bot === 'piedra') || (user === 'tijera' && bot === 'papel')) ? '🎉 ¡Ganaste!' : '🤖 ¡Gané esta vez!';
    await send(sock, from, msg, `✊ *PIEDRA, PAPEL O TIJERA*\nTú: *${user}*\nBot: *${bot}*\n\n${result}`);
    return true;
  }

  if (command === '/dado') {
    const requestedSides = args[0] === undefined ? 6 : Number(args[0]);
    if (!Number.isInteger(requestedSides) || requestedSides < 2 || requestedSides > 100) {
      await send(sock, from, msg, 'El dado debe tener entre 2 y 100 caras enteras. Ejemplo: /dado 20');
      return true;
    }
    const sides = requestedSides;
    await send(sock, from, msg, `🎲 Salió: *${Math.floor(Math.random() * sides) + 1}* (dado de ${sides} caras).`);
    return true;
  }

  if (command === '/moneda') {
    await send(sock, from, msg, `🪙 Salió: *${Math.random() < 0.5 ? 'CARA' : 'CRUZ'}*.`);
    return true;
  }

  if (command === '/8ball') {
    if (!argText) {
      await send(sock, from, msg, '🔮 Escribe una pregunta. Ejemplo: /8ball ¿Tendré suerte hoy?');
      return true;
    }
    await send(sock, from, msg, `🔮 *BOLA MÁGICA*\n\n${pick(['Sí, definitivamente.', 'Todo apunta a que sí.', 'Es muy probable.', 'No cuentes con ello.', 'Mi respuesta es que no.', 'Pregunta de nuevo más tarde.', 'Las señales no son claras.', 'Puede que sí.'])}`);
    return true;
  }

  if (command === '/chiste') {
    await send(sock, from, msg, `😂 ${pick(jokes)}`);
    return true;
  }

  if (command === '/elige') {
    const options = argText.split('|').map((option) => option.trim()).filter(Boolean).slice(0, 20);
    if (options.length < 2) {
      await send(sock, from, msg, 'Uso: /elige Opción 1 | Opción 2 | Opción 3\nIncluye entre 2 y 20 opciones.');
    } else {
      await send(sock, from, msg, `🎯 La opción elegida es: *${pick(options)}*`);
    }
    return true;
  }

  if (command === '/rango') {
    const min = Number(args[0]);
    const max = Number(args[1]);
    if (args.length !== 2 || !Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max || min < -1_000_000_000 || max > 1_000_000_000) {
      await send(sock, from, msg, 'Uso: /rango <mínimo> <máximo>\nUsa enteros entre -1.000.000.000 y 1.000.000.000. Ejemplo: /rango 10 50');
    } else {
      await send(sock, from, msg, `🎲 Número aleatorio entre ${min} y ${max}: *${randomInt(min, max + 1)}*`);
    }
    return true;
  }

  if (command === '/hora') {
    const timeZone = argText || 'America/Lima';
    try {
      const localTime = new Intl.DateTimeFormat('es', {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone
      }).format(new Date());
      await send(sock, from, msg, `🕒 Hora en ${timeZone}:\n${localTime}`);
    } catch {
      await send(sock, from, msg, 'Zona horaria inválida. Ejemplo: /hora America/Caracas o /hora America/Lima');
    }
    return true;
  }

  if (command === '/password') {
    const length = Number(args[0] || 16);
    if (!Number.isInteger(length) || length < 8 || length > 64) {
      await send(sock, from, msg, 'Uso: /password [longitud]. Elige entre 8 y 64 caracteres. Ejemplo: /password 20');
      return true;
    }
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_';
    const bytes = randomBytes(length);
    const password = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
    await send(sock, from, msg, `🔐 *CONTRASEÑA GENERADA*\n\n\`${password}\`\n\nNo la compartas en chats públicos.`);
    return true;
  }

  if (command === '/uuid') {
    await send(sock, from, msg, `🆔 UUID:\n\`${randomUUID()}\``);
    return true;
  }

  if (command === '/base64') {
    const mode = (args.shift() || '').toLowerCase();
    const value = args.join(' ');
    if (!['encode', 'decode'].includes(mode) || !value) {
      await send(sock, from, msg, 'Uso:\n/base64 encode <texto>\n/base64 decode <base64>');
      return true;
    }
    try {
      if (mode === 'encode') {
        await send(sock, from, msg, `📦 Resultado:\n\`${Buffer.from(value, 'utf8').toString('base64')}\``);
      } else {
        const decoded = Buffer.from(value, 'base64').toString('utf8');
        if (!decoded || !Buffer.from(decoded, 'utf8').equals(Buffer.from(value, 'base64'))) throw new Error('Base64 inválido');
        await send(sock, from, msg, `📦 Texto decodificado:\n${decoded.slice(0, 3500)}`);
      }
    } catch {
      await send(sock, from, msg, '❌ No pude decodificar ese valor. Revisa que sea Base64 válido.');
    }
    return true;
  }

  if (command === '/texto') {
    if (!argText) {
      await send(sock, from, msg, 'Uso: /texto <frase o párrafo>');
      return true;
    }
    const words = argText.trim().split(/\s+/).filter(Boolean).length;
    await send(sock, from, msg, `📝 *ANÁLISIS DE TEXTO*\nCaracteres: ${argText.length}\nPalabras: ${words}\nLíneas: ${argText.split(/\r?\n/).length}`);
    return true;
  }

  if (command === '/reversa') {
    if (!argText) {
      await send(sock, from, msg, 'Uso: /reversa <texto>');
      return true;
    }
    await send(sock, from, msg, [...argText].reverse().join(''));
    return true;
  }

  if (command === '/stickertexto') {
    if (!argText) {
      await send(sock, from, msg, 'Uso: /stickertexto <frase>. Ejemplo: /stickertexto HOLA MUNDO');
      return true;
    }
    try {
      const label = argText.slice(0, 80);
      const words = label.match(/.{1,14}(?:\s|$)/g) || [label];
      const lines = words.slice(0, 5).map((line) => line.trim()).filter(Boolean);
      const svg = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" rx="56" fill="#171923"/><circle cx="256" cy="256" r="205" fill="#242938" stroke="#38e8c5" stroke-width="10"/><text x="256" y="${256 - (lines.length - 1) * 34}" text-anchor="middle" font-family="Arial,sans-serif" font-size="42" font-weight="bold" fill="#ffffff">${lines.map((line, i) => `<tspan x="256" dy="${i === 0 ? 0 : 68}">${escapeXml(line)}</tspan>`).join('')}</text><text x="256" y="455" text-anchor="middle" font-family="Arial" font-size="18" fill="#38e8c5">DRAKO BOT</text></svg>`;
      const sticker = await sharp(Buffer.from(svg)).webp({ quality: 78 }).toBuffer();
      await sock.sendMessage(from, { sticker }, { quoted: msg });
    } catch (error) {
      await send(sock, from, msg, `❌ No pude crear el sticker: ${error.message}`);
    }
    return true;
  }

  return false;
}
