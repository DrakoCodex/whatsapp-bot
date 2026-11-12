const profiles = new Map();
const DAY = 24 * 60 * 60 * 1000;

function getProfile(id) {
  if (!profiles.has(id)) profiles.set(id, { xp: 0, coins: 0, dailyAt: 0 });
  return profiles.get(id);
}

function levelFor(xp) {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

export async function handleProgress(sock, from, msg, command) {
  const id = msg.key.participant || msg.key.remoteJid || from;
  const profile = getProfile(id);
  const send = (text) => sock.sendMessage(from, { text }, { quoted: msg });

  if (command === '/daily') {
    const remaining = DAY - (Date.now() - profile.dailyAt);
    if (profile.dailyAt && remaining > 0) {
      const hours = Math.floor(remaining / 3_600_000);
      const minutes = Math.floor((remaining % 3_600_000) / 60_000);
      await send(`🎁 Ya reclamaste tu recompensa diaria. Vuelve en ${hours} h ${minutes} min.`);
    } else {
      profile.dailyAt = Date.now();
      profile.xp += 50;
      profile.coins += 25;
      await send('🎁 *RECOMPENSA DIARIA*\n+50 XP\n+25 DrakoCoins 🪙\n¡Vuelve mañana!');
    }
    return true;
  }

  if (command === '/perfil') {
    await send(`🐉 *TU PERFIL DRAKO*\nNivel: *${levelFor(profile.xp)}*\nXP: ${profile.xp}\nDrakoCoins: ${profile.coins} 🪙\n\nUsa /daily para reclamar tu recompensa diaria.`);
    return true;
  }

  if (command === '/top') {
    const ranking = [...profiles.entries()].sort((a,b) => b[1].xp - a[1].xp).slice(0,10);
    await send('🏆 *TOP DRAKO — XP*\n' + (ranking.length
      ? ranking.map(([user,p],i) => `${i+1}. ${user.split('@')[0]} — Nivel ${levelFor(p.xp)} (${p.xp} XP)`).join('\n')
      : 'Aún no hay perfiles. Usa /daily para empezar.'));
    return true;
  }

  if (command === '/misiones') {
    await send('🎯 *MISIONES DIARIAS*\n1. Reclama /daily: +50 XP y 25 DrakoCoins.\n2. Juega una partida: /juegos.\n3. Prueba una utilidad: /menu.\n\nLas recompensas y perfiles son temporales mientras no se conecte una base de datos de progreso.');
    return true;
  }
  return false;
}
