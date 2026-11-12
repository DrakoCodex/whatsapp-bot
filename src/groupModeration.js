import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { MongoClient } from 'mongodb';

const DEFAULT_RULES = [
  '1. Respeta a todos los miembros.',
  '2. Evita insultos, spam y contenido que perjudique al grupo.',
  '3. No compartas datos personales sin autorización.',
  '4. Sigue las indicaciones de los administradores.'
].join('\n');

const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  links: false,
  stickers: false,
  offensive: false,
  blockedWords: [],
  rules: DEFAULT_RULES
});

const OFFENSIVE_TERMS = [
  'idiota', 'imbecil', 'estupido', 'estupida', 'pendejo', 'pendeja',
  'puta', 'puto', 'mierda', 'cabron', 'cabrona', 'maricon', 'malparido',
  'hijo de puta', 'vete a la mierda'
];

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s]+|(?<![@\w])(?:[\w-]+\.)+(?:com|org|net|edu|gov|io|app|dev|info|biz|me|co|es|pe|ve|xyz|link|ly|gg|tv|us|uk|mx|ar|br|cl|ec|do)(?:\/[^\s]*)?/iu;
const groupMetadataCache = new Map();
const warningCooldowns = new Map();

function cleanSettings(value = {}) {
  return {
    enabled: Boolean(value.enabled),
    links: Boolean(value.links),
    stickers: Boolean(value.stickers),
    offensive: Boolean(value.offensive),
    blockedWords: Array.isArray(value.blockedWords)
      ? value.blockedWords.filter((word) => typeof word === 'string').map((word) => word.slice(0, 60)).slice(0, 30)
      : [],
    rules: typeof value.rules === 'string' && value.rules.trim()
      ? value.rules.slice(0, 1200)
      : DEFAULT_RULES
  };
}

export async function createGroupSettingsStore(mongoUri) {
  const localPath = resolve(process.env.GROUP_SETTINGS_PATH || './data/group-moderation.json');
  const settingsCache = new Map();
  let collection = null;
  let localSettings = {};
  let writeQueue = Promise.resolve();

  if (mongoUri) {
    let client;
    try {
      client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 8000, connectTimeoutMS: 8000 });
      await client.connect();
      collection = client.db('whatsapp_bot').collection('group_moderation');
      console.log('[MOD] Configuración de grupos guardada en MongoDB.');
    } catch (error) {
      await client?.close().catch(() => {});
      console.error(`[MOD] MongoDB no disponible (${error.name}); usaré el archivo local de configuración.`);
    }
  }

  if (!collection) {
    try {
      localSettings = JSON.parse(await readFile(localPath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`[MOD] No se pudo leer la configuración local (${error.name}); se usarán valores iniciales.`);
      }
    }
  }

  return {
    async get(groupId) {
      const cached = settingsCache.get(groupId);
      if (cached && cached.expiresAt > Date.now()) return { ...cached.value, blockedWords: [...cached.value.blockedWords] };

      let value = DEFAULT_SETTINGS;
      if (collection) {
        try {
          const document = await collection.findOne({ _id: groupId });
          value = cleanSettings(document?.settings);
        } catch (error) {
          console.error(`[MOD] No se pudo leer la configuración del grupo (${error.name}).`);
          value = cached?.value || DEFAULT_SETTINGS;
        }
      } else {
        value = cleanSettings(localSettings[groupId]);
      }
      settingsCache.set(groupId, { value, expiresAt: Date.now() + 5000 });
      return { ...value, blockedWords: [...value.blockedWords] };
    },

    async set(groupId, nextSettings) {
      const value = cleanSettings(nextSettings);
      if (collection) {
        await collection.updateOne(
          { _id: groupId },
          { $set: { settings: value, updatedAt: new Date() } },
          { upsert: true }
        );
      } else {
        localSettings[groupId] = value;
        writeQueue = writeQueue.catch(() => {}).then(async () => {
          await mkdir(dirname(localPath), { recursive: true });
          const temporaryPath = `${localPath}.tmp`;
          await writeFile(temporaryPath, JSON.stringify(localSettings, null, 2), 'utf8');
          await rename(temporaryPath, localPath);
        });
        await writeQueue;
      }
      settingsCache.set(groupId, { value, expiresAt: Date.now() + 5000 });
      return { ...value, blockedWords: [...value.blockedWords] };
    }
  };
}

function normalizeJid(jid) {
  return String(jid || '').replace(/:\d+(?=@)/, '').toLowerCase();
}

function sameJid(left, right) {
  return normalizeJid(left) === normalizeJid(right);
}

async function getGroupMetadata(sock, groupId, force = false) {
  const cached = groupMetadataCache.get(groupId);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;
  const metadata = await sock.groupMetadata(groupId);
  groupMetadataCache.set(groupId, { value: metadata, expiresAt: Date.now() + 15000 });
  return metadata;
}

function getPermissions(sock, msg, metadata) {
  const participantIds = [msg.key.participant, msg.key.participantAlt].filter(Boolean);
  const user = metadata.participants.find((participant) =>
    participantIds.some((id) => sameJid(participant.id, id) || sameJid(participant.phoneNumber, id) || sameJid(participant.lid, id))
  );
  const botIds = [sock.user?.id, sock.user?.lid].filter(Boolean);
  const bot = metadata.participants.find((participant) =>
    botIds.some((id) => sameJid(participant.id, id) || sameJid(participant.phoneNumber, id) || sameJid(participant.lid, id))
  );
  const isAdmin = (participant) => Boolean(participant?.admin || participant?.isAdmin || participant?.isSuperAdmin);

  return {
    senderId: participantIds[0] || null,
    senderIsAdmin: isAdmin(user),
    botIsAdmin: isAdmin(bot)
  };
}

function sendText(sock, groupId, msg, text) {
  return sock.sendMessage(groupId, { text }, { quoted: msg });
}

function moderationSummary(settings) {
  const state = (enabled) => enabled ? 'ON' : 'OFF';
  return `🛡️ *MODERACIÓN DEL GRUPO*\n` +
    `Estado: *${state(settings.enabled)}*\n` +
    `• Enlaces: ${state(settings.links)}\n` +
    `• Stickers: ${state(settings.stickers)}\n` +
    `• Términos ofensivos: ${state(settings.offensive)}\n` +
    `• Palabras personalizadas: ${settings.blockedWords.length}\n\n` +
    'Usa /moderacion activar para encender los tres filtros. Solo administradores pueden cambiar esta configuración.';
}

async function handleModerationCommand(sock, groupId, msg, command, argumentText, store) {
  let settings;
  try {
    settings = await store.get(groupId);
  } catch (error) {
    console.error(`[MOD] No se pudo cargar la configuración del grupo (${error.name}).`);
    await sendText(sock, groupId, msg, 'No pude leer la configuración del grupo. Inténtalo de nuevo.');
    return true;
  }
  const parts = argumentText.split(/\s+/).filter(Boolean);
  const action = (parts[0] || '').toLowerCase();

  if (command === '/reglas' && !argumentText) {
    await sendText(sock, groupId, msg, `📜 *REGLAS DEL GRUPO*\n${settings.rules}`);
    return true;
  }

  if (command === '/moderacion' && (!action || action === 'estado')) {
    await sendText(sock, groupId, msg, moderationSummary(settings));
    return true;
  }

  let rulesText = '';
  let mutation = null;
  if (command === '/reglas' && argumentText) {
    rulesText = argumentText;
  } else if (command === '/moderacion' && action === 'reglas') {
    rulesText = parts.slice(1).join(' ').trim();
  } else if (command === '/moderacion' && action === 'activar') {
    mutation = 'activate';
  } else if (command === '/moderacion' && action === 'desactivar') {
    mutation = 'deactivate';
  } else if (command === '/moderacion' && ['enlaces', 'stickers', 'ofensas'].includes(action)) {
    mutation = { feature: { enlaces: 'links', stickers: 'stickers', ofensas: 'offensive' }[action], value: (parts[1] || '').toLowerCase() };
  } else if (command === '/moderacion' && action === 'palabras') {
    mutation = { wordsAction: (parts[1] || '').toLowerCase(), word: parts.slice(2).join(' ').trim() };
  }

  if (!rulesText && !mutation) {
    await sendText(sock, groupId, msg,
      'Uso de moderación:\n' +
      '/moderacion estado\n/moderacion activar|desactivar\n' +
      '/moderacion enlaces|stickers|ofensas on|off\n' +
      '/moderacion palabras agregar|quitar <palabra o frase>\n' +
      '/reglas para ver reglas; /reglas <texto> para cambiarlas.'
    );
    return true;
  }

  if (rulesText && rulesText.length > 1200) {
    await sendText(sock, groupId, msg, 'Las reglas no pueden superar 1200 caracteres.');
    return true;
  }
  if (rulesText && !rulesText.trim()) {
    await sendText(sock, groupId, msg, 'Escribe las reglas después del comando. Ejemplo: /reglas Respeto y nada de spam.');
    return true;
  }
  if (mutation?.feature && !['on', 'off'].includes(mutation.value)) {
    await sendText(sock, groupId, msg, `Uso: /moderacion ${action} on|off`);
    return true;
  }
  if (mutation?.wordsAction && !['agregar', 'quitar'].includes(mutation.wordsAction)) {
    await sendText(sock, groupId, msg, 'Uso: /moderacion palabras agregar|quitar <palabra o frase>');
    return true;
  }
  if (mutation?.word && mutation.word.length > 60) {
    await sendText(sock, groupId, msg, 'Cada término personalizado puede tener hasta 60 caracteres.');
    return true;
  }

  let metadata;
  let permissions;
  try {
    metadata = await getGroupMetadata(sock, groupId, true);
    permissions = getPermissions(sock, msg, metadata);
  } catch (error) {
    console.error(`[MOD] No se pudo consultar quién administra el grupo (${error.name}).`);
    await sendText(sock, groupId, msg, 'No pude comprobar los administradores del grupo. Inténtalo de nuevo.');
    return true;
  }
  if (!permissions.senderIsAdmin) {
    await sendText(sock, groupId, msg, 'Solo los administradores del grupo pueden cambiar las reglas o la moderación.');
    return true;
  }

  if (rulesText) {
    try {
      await store.set(groupId, { ...settings, rules: rulesText.trim() });
    } catch (error) {
      console.error(`[MOD] No se pudieron guardar las reglas (${error.name}).`);
      await sendText(sock, groupId, msg, 'No pude guardar las reglas. Revisa el almacenamiento configurado.');
      return true;
    }
    await sendText(sock, groupId, msg, '✅ Guardé las reglas nuevas del grupo.');
    return true;
  }

  let next = { ...settings, blockedWords: [...settings.blockedWords] };
  if (mutation === 'activate') {
    if (!permissions.botIsAdmin) {
      await sendText(sock, groupId, msg, 'Primero haz administrador al bot para que pueda borrar mensajes y stickers.');
      return true;
    }
    next = { ...next, enabled: true, links: true, stickers: true, offensive: true };
  } else if (mutation === 'deactivate') {
    next = { ...next, enabled: false, links: false, stickers: false, offensive: false };
  } else if (mutation?.feature) {
    if (mutation.value === 'on' && !permissions.botIsAdmin) {
      await sendText(sock, groupId, msg, 'Primero haz administrador al bot para que pueda aplicar este filtro.');
      return true;
    }
    next[mutation.feature] = mutation.value === 'on';
    next.enabled = next.links || next.stickers || next.offensive;
  } else if (mutation?.wordsAction) {
    if (!mutation.word) {
      await sendText(sock, groupId, msg, 'Escribe la palabra o frase. Ejemplo: /moderacion palabras agregar insulto');
      return true;
    }
    const normalizedWord = normalizeText(mutation.word);
    if (!normalizedWord) {
      await sendText(sock, groupId, msg, 'El término debe incluir al menos una letra o número.');
      return true;
    }
    if (mutation.wordsAction === 'agregar') {
      if (!permissions.botIsAdmin) {
        await sendText(sock, groupId, msg, 'Primero haz administrador al bot para que pueda aplicar la lista de términos.');
        return true;
      }
      if (!next.blockedWords.some((word) => normalizeText(word) === normalizedWord)) {
        if (next.blockedWords.length >= 30) {
          await sendText(sock, groupId, msg, 'Ya hay 30 términos personalizados. Quita alguno antes de agregar otro.');
          return true;
        }
        next.blockedWords.push(mutation.word);
      }
      next.offensive = true;
      next.enabled = true;
    } else {
      next.blockedWords = next.blockedWords.filter((word) => normalizeText(word) !== normalizedWord);
    }
  }

  try {
    await store.set(groupId, next);
  } catch (error) {
    console.error(`[MOD] No se pudo guardar la configuración (${error.name}).`);
    await sendText(sock, groupId, msg, 'No pude guardar la configuración. Revisa la conexión con MongoDB o el almacenamiento local.');
    return true;
  }
  await sendText(sock, groupId, msg, moderationSummary(next));
  return true;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function containsTerm(text, term) {
  const normalizedText = ` ${normalizeText(text)} `;
  const normalizedTerm = normalizeText(term);
  return Boolean(normalizedTerm) && normalizedText.includes(` ${normalizedTerm} `);
}

function unwrapMessage(message) {
  let content = message;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const nested = content?.ephemeralMessage?.message
      || content?.viewOnceMessage?.message
      || content?.viewOnceMessageV2?.message
      || content?.documentWithCaptionMessage?.message;
    if (!nested) break;
    content = nested;
  }
  return content || {};
}

function getMessageText(content) {
  return String(
    content.conversation
    || content.extendedTextMessage?.text
    || content.imageMessage?.caption
    || content.videoMessage?.caption
    || content.documentMessage?.caption
    || ''
  ).trim();
}

function violationReasons(settings, content, text) {
  const reasons = [];
  if (settings.stickers && content.stickerMessage) reasons.push('stickers no permitidos');
  if (settings.links && URL_PATTERN.test(text)) reasons.push('enlaces no permitidos');
  if (settings.offensive && [...OFFENSIVE_TERMS, ...settings.blockedWords].some((term) => containsTerm(text, term))) {
    reasons.push('lenguaje ofensivo o palabra bloqueada');
  }
  return reasons;
}

function shouldSendWarning(groupId, participantId) {
  const key = `${groupId}:${normalizeJid(participantId)}`;
  const lastSentAt = warningCooldowns.get(key) || 0;
  if (Date.now() - lastSentAt < 10_000) return false;
  warningCooldowns.set(key, Date.now());
  if (warningCooldowns.size > 5000) {
    for (const [entry, timestamp] of warningCooldowns) {
      if (Date.now() - timestamp > 60_000) warningCooldowns.delete(entry);
    }
  }
  return true;
}

async function moderateMessage(sock, groupId, msg, settings) {
  if (msg.key.fromMe || !settings.enabled) return false;
  const content = unwrapMessage(msg.message);
  const text = getMessageText(content);
  const reasons = violationReasons(settings, content, text);
  if (!reasons.length) return false;

  let metadata;
  let permissions;
  try {
    metadata = await getGroupMetadata(sock, groupId);
    permissions = getPermissions(sock, msg, metadata);
  } catch (error) {
    console.error(`[MOD] No se pudo revisar el grupo ${groupId} (${error.name}).`);
    return false;
  }
  if (permissions.senderIsAdmin || !permissions.senderId) return false;

  let deleted = false;
  if (permissions.botIsAdmin) {
    try {
      await sock.sendMessage(groupId, { delete: msg.key });
      deleted = true;
    } catch (error) {
      console.error(`[MOD] No se pudo borrar un mensaje (${error.name}).`);
    }
  }

  if (shouldSendWarning(groupId, permissions.senderId)) {
    const status = deleted ? 'El mensaje se eliminó.' : 'No pude eliminarlo; el bot necesita permisos de administrador.';
    try {
      await sock.sendMessage(groupId, {
        text: `⚠️ @${permissions.senderId.split('@')[0]}, ${reasons.join(' y ')}. ${status}`,
        mentions: [permissions.senderId]
      });
    } catch (error) {
      console.error(`[MOD] No se pudo enviar la advertencia (${error.name}).`);
    }
  }
  return true;
}

export async function handleGroupModeration(sock, groupId, msg, rawText, store) {
  if (!groupId.endsWith('@g.us')) return false;
  const input = String(rawText || '').trim();
  const [commandToken] = input.split(/\s+/);
  const command = String(commandToken || '').toLowerCase();
  const argumentText = input.slice(String(commandToken || '').length).trim();

  if (command === '/moderacion' || command === '/reglas') {
    return handleModerationCommand(sock, groupId, msg, command, argumentText, store);
  }

  let settings;
  try {
    settings = await store.get(groupId);
  } catch (error) {
    console.error(`[MOD] No se pudo cargar la configuración del grupo (${error.name}).`);
    return false;
  }
  return moderateMessage(sock, groupId, msg, settings);
}
