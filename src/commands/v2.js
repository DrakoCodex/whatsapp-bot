import { handleGames } from './games.js';
import { handleUtilities } from './utilities.js';
import { handleGroupCommands } from './groups.js';
import { handleProgress } from './progress.js';

export async function handleV2Command(sock, from, msg, rawText) {
  const input = String(rawText || '').trim();
  if (!input.startsWith('/')) return false;
  const [command, ...args] = input.split(/\s+/);
  const normalized = command.toLowerCase();
  const argText = input.slice(command.length).trim();

  if (['/menu', '/ayuda', '!menu'].includes(normalized)) {
    await sock.sendMessage(from, { text:
      '🐉 *DRAKO BOT 2.0 — MENÚ*\n' +
      '━━━━━━━━━━━━━━━━━━━━\n' +
      '🇵🇪 *PERÚ Y CONSULTAS*\n/dni <número> · Consulta de identidad (API configurada)\n/tc · Tipo de cambio\n/clima <ciudad> · Clima\n\n' +
      '🎨 *STICKERS Y CREATIVIDAD*\n/s o /sticker · Foto a sticker\n/stickertexto <frase> · Sticker con texto\n/qr <texto> · Código QR\n\n' +
      '🎮 *JUEGOS*\n/juegos · Lista de juegos\n/adivina · Adivina número\n/trivia · Pregunta rápida\n/ppt piedra|papel|tijera · Duelo\n/ahorcado · Ahorcado\n/letra <letra> · Jugar ahorcado\n/tateti · Tres en raya contra el bot\n/jugar <1-9> · Mover en tatetí\n/dado [caras] · Dado\n/moneda · Cara o cruz\n/8ball <pregunta> · Bola mágica\n/chiste · Chiste\n\n' +
      '🧰 *UTILIDADES OFFLINE*\n/calc <operación> · Calculadora\n/porcentaje <porcentaje> <cantidad>\n/binario encode|decode <texto>\n/mayus <texto> · Mayúsculas\n/minus <texto> · Minúsculas\n/contar <texto> · Contador\n/reversa <texto> · Invertir texto\n/temperatura <valor> C|F\n/fecha · Fecha y hora de Perú\n/password [longitud] · Contraseña\n/uuid · UUID\n/base64 encode|decode <texto>\n\n' +
      '👥 *GRUPOS*\n/reglas · Reglas rápidas\n/encuesta pregunta | opción 1 | opción 2\n/votar <número> · Votar\n/resultados · Ver encuesta\n/sorteo @miembros · Elegir ganador\n/equipos @miembros · Dividir equipos\n/turno @miembros · Orden aleatorio\n\n' +
      '🏅 *PROGRESO*\n/daily · Recompensa diaria\n/perfil · Tu nivel y XP\n/top · Ranking\n/misiones · Retos\n\n' +
      '⚙️ *SISTEMA*\n/ping · Latencia\n/info · Estado\n\n' +
      '━━━━━━━━━━━━━━━━━━━━\n🆓 Los módulos nuevos funcionan localmente y no requieren API de pago. Los estados temporales se reinician si el proceso se reinicia.'
    ) }, { quoted: msg });
    return true;
  }

  if (normalized === '/juegos') {
    await sock.sendMessage(from, { text:
      '🎮 *JUEGOS*\n/adivina · Número secreto\n/trivia · Cultura general\n/ppt piedra|papel|tijera\n/ahorcado y /letra <letra>\n/tateti y /jugar <1-9>\n/dado [caras] · /moneda · /8ball <pregunta>'
    }, { quoted: msg });
    return true;
  }

  return await handleProgress(sock, from, msg, normalized)
    || await handleGames(sock, from, msg, normalized, args, argText)
    || await handleUtilities(sock, from, msg, normalized, args, argText)
    || await handleGroupCommands(sock, from, msg, normalized, args, argText);
}
