export async function handleUtilities(sock, from, msg, command, args, argText) {
  const send = (text) => sock.sendMessage(from, { text }, { quoted: msg });

  if (command === '/porcentaje') {
    const [percent, amount] = args.map(Number);
    if (args.length !== 2 || !Number.isFinite(percent) || !Number.isFinite(amount)) {
      await send('Uso: /porcentaje <porcentaje> <cantidad>\nEjemplo: /porcentaje 18 250');
    } else {
      await send(`🧮 El ${percent}% de ${amount} es *${Number((percent * amount / 100).toFixed(6))}*.`);
    }
    return true;
  }

  if (command === '/binario') {
    const mode = (args[0] || '').toLowerCase();
    const value = argText.slice((args[0] || '').length).trim();
    if (!['encode','decode'].includes(mode) || !value) {
      await send('Uso:\n/binario encode <texto>\n/binario decode <01001000 01101001>');
    } else if (mode === 'encode') {
      await send('💻 Binario:\n' + [...value].map((c) => c.codePointAt(0).toString(2).padStart(8,'0')).join(' '));
    } else {
      try {
        const bytes = value.trim().split(/\s+/);
        if (!bytes.every((b) => /^[01]{8,21}$/.test(b))) throw new Error('invalid');
        await send('💻 Texto:\n' + bytes.map((b) => String.fromCodePoint(parseInt(b,2))).join(''));
      } catch {
        await send('❌ Binario inválido. Usa grupos de 8 bits separados por espacios.');
      }
    }
    return true;
  }

  if (command === '/mayus' || command === '/minus') {
    if (!argText) await send(`Uso: ${command} <texto>`);
    else await send(command === '/mayus' ? argText.toLocaleUpperCase('es') : argText.toLocaleLowerCase('es'));
    return true;
  }

  if (command === '/contar') {
    if (!argText) await send('Uso: /contar <texto>');
    else {
      const words = argText.trim().split(/\s+/).filter(Boolean).length;
      await send(`📏 Caracteres: ${[...argText].length}\nPalabras: ${words}\nSin espacios: ${[...argText].filter((c) => !/\s/.test(c)).length}`);
    }
    return true;
  }

  if (command === '/fecha') {
    const now = new Date();
    await send('📅 ' + new Intl.DateTimeFormat('es-PE', { dateStyle:'full', timeStyle:'short', timeZone:'America/Lima' }).format(now) + ' (hora de Perú)');
    return true;
  }

  if (command === '/temperatura') {
    const value = Number(args[0]);
    const mode = (args[1] || '').toUpperCase();
    if (!Number.isFinite(value) || !['C','F'].includes(mode)) {
      await send('Uso: /temperatura <valor> C|F\nEjemplo: /temperatura 30 C');
    } else {
      const converted = mode === 'C' ? value * 9/5 + 32 : (value - 32) * 5/9;
      await send(`🌡️ ${value}°${mode} = *${converted.toFixed(1)}°${mode === 'C' ? 'F' : 'C'}*`);
    }
    return true;
  }
  return false;
}
