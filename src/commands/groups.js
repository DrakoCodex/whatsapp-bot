const polls = new Map();

function getNames(msg, argText) {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  const names = mentioned.map((jid) => '@' + jid.split('@')[0]);
  if (names.length) return names;
  return argText.split(',').map((name) => name.trim()).filter(Boolean).slice(0, 40);
}

export async function handleGroupCommands(sock, from, msg, command, args, argText) {
  const send = (text, extra = {}) => sock.sendMessage(from, { text, ...extra }, { quoted: msg });
  const isGroup = from.endsWith('@g.us');

  if (['/reglas','/normas'].includes(command)) {
    await send('📜 *REGLAS DEL GRUPO*\n1. Respeta a todos los miembros.\n2. No envíes spam ni enlaces sospechosos.\n3. Evita compartir datos personales.\n4. No publiques contenido ilegal o que perjudique a otros.\n5. Sigue las indicaciones de los administradores.');
    return true;
  }

  if (['/encuesta','/votar','/resultados'].includes(command) && !isGroup) {
    await send('Esta función está disponible dentro de grupos.');
    return true;
  }

  if (command === '/encuesta') {
    const parts = argText.split('|').map((v) => v.trim()).filter(Boolean);
    if (parts.length < 3) {
      await send('Uso: /encuesta Pregunta | Opción 1 | Opción 2\nEjemplo: /encuesta ¿Qué jugamos? | Fútbol | Minecraft');
      return true;
    }
    const id = String(Date.now());
    polls.set(from, { id, question: parts[0].slice(0,120), options: parts.slice(1,6).map((v) => v.slice(0,60)), votes: new Map(), expires: Date.now() + 24*60*60*1000 });
    await send(`📊 *ENCUESTA*\n${parts[0]}\n\n${parts.slice(1,6).map((v,i) => `${i+1}. ${v}`).join('\n')}\n\nVota con */votar <número>*. Una respuesta por participante.\nID: ${id}`);
    return true;
  }

  if (command === '/votar') {
    const poll = polls.get(from);
    if (!poll || Date.now() > poll.expires) {
      polls.delete(from);
      await send('No hay una encuesta activa. Crea una con /encuesta.');
      return true;
    }
    const choice = Number(args[0]);
    if (!Number.isInteger(choice) || choice < 1 || choice > poll.options.length) {
      await send(`Elige una opción del 1 al ${poll.options.length}.`);
      return true;
    }
    const voter = msg.key.participant || msg.key.remoteJid;
    poll.votes.set(voter, choice - 1);
    await send('✅ Voto registrado. Puedes cambiarlo votando por otra opción.');
    return true;
  }

  if (command === '/resultados') {
    const poll = polls.get(from);
    if (!poll || Date.now() > poll.expires) {
      polls.delete(from);
      await send('No hay una encuesta activa.');
      return true;
    }
    const counts = poll.options.map((option, i) => ({ option, count: [...poll.votes.values()].filter((v) => v === i).length }));
    await send('📊 *RESULTADOS*\n' + counts.map((v,i) => `${i+1}. ${v.option}: *${v.count}*`).join('\n') + `\n\nVotos: ${poll.votes.size}`);
    return true;
  }

  if (['/sorteo','/equipos','/turno'].includes(command)) {
    if (!isGroup) {
      await send('Esta función está disponible dentro de grupos.');
      return true;
    }
    const names = getNames(msg, argText);
    if (names.length < 2) {
      await send(`Uso: ${command} @menciones o Nombre 1, Nombre 2, Nombre 3\nPuedes mencionar miembros o escribir sus nombres separados por comas.`);
      return true;
    }
    if (command === '/sorteo') {
      await send('🎉 *GANADOR DEL SORTEO*\n' + names[Math.floor(Math.random() * names.length)]);
    } else if (command === '/turno') {
      const shuffled = [...names].sort(() => Math.random() - 0.5);
      await send('🔀 *ORDEN DE TURNOS*\n' + shuffled.map((name,i) => `${i+1}. ${name}`).join('\n'));
    } else {
      const shuffled = [...names].sort(() => Math.random() - 0.5);
      const a = shuffled.filter((_,i) => i%2===0);
      const b = shuffled.filter((_,i) => i%2===1);
      await send('⚽ *EQUIPOS ALEATORIOS*\n\n🔵 *EQUIPO A*\n' + a.join('\n') + '\n\n🔴 *EQUIPO B*\n' + b.join('\n'));
    }
    return true;
  }
  return false;
}
