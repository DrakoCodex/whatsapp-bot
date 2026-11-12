const active = new Map();

const pick = (items) => items[Math.floor(Math.random() * items.length)];
const normalize = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export async function handleGames(sock, from, msg, command, args, argText) {
  const send = (text) => sock.sendMessage(from, { text }, { quoted: msg });

  if (command === '/ahorcado') {
    const words = ['javascript', 'whatsapp', 'programacion', 'computadora', 'futbol', 'tecnologia', 'aventura', 'desarrollo'];
    const word = pick(words);
    active.set(from, { word, found: new Set(), misses: 0, expires: Date.now() + 10 * 60_000 });
    await send('🪢 *AHORCADO*\nAdivina la palabra letra por letra con /letra A. Tienes 6 errores permitidos y 10 minutos.');
    return true;
  }

  if (command === '/letra') {
    const game = active.get(from);
    const letter = normalize(args[0]);
    if (!game || Date.now() > game.expires) {
      active.delete(from);
      await send('No hay un ahorcado activo. Escribe /ahorcado para empezar.');
      return true;
    }
    if (!/^[a-zñ]$/.test(letter)) {
      await send('Escribe una sola letra. Ejemplo: /letra a');
      return true;
    }
    if (game.found.has(letter)) {
      await send('Ya probaste esa letra. Intenta con otra.');
      return true;
    }
    game.found.add(letter);
    if (!game.word.includes(letter)) game.misses++;
    const masked = [...game.word].map((c) => game.found.has(c) ? c : '＿').join(' ');
    if ([...game.word].every((c) => game.found.has(c))) {
      active.delete(from);
      await send(`🎉 ¡Ganaste! La palabra era *${game.word}*.`);
    } else if (game.misses >= 6) {
      active.delete(from);
      await send(`💀 Perdiste. La palabra era *${game.word}*.`);
    } else {
      await send(`🪢 ${masked}\nErrores: ${game.misses}/6`);
    }
    return true;
  }

  if (command === '/tateti') {
    const board = ['1','2','3','4','5','6','7','8','9'];
    active.set(from, { board, expires: Date.now() + 5 * 60_000 });
    await send('❌ *TATETI* — Tú eres X y el bot O. Juega con /jugar 1 (casilla del 1 al 9).\n\n' + board.slice(0,3).join(' | ') + '\n' + board.slice(3,6).join(' | ') + '\n' + board.slice(6,9).join(' | '));
    return true;
  }

  if (command === '/jugar') {
    const game = active.get(from);
    if (!game?.board) {
      await send('No tienes un tatetí activo. Escribe /tateti.');
      return true;
    }
    if (Date.now() > game.expires) {
      active.delete(from);
      await send('La partida expiró. Escribe /tateti para jugar otra.');
      return true;
    }
    const pos = Number(args[0]) - 1;
    if (!Number.isInteger(pos) || pos < 0 || pos > 8 || !/^[1-9]$/.test(game.board[pos])) {
      await send('Casilla inválida u ocupada. Elige un número libre del 1 al 9.');
      return true;
    }
    game.board[pos] = 'X';
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    const winner = (mark) => lines.some((line) => line.every((i) => game.board[i] === mark));
    if (winner('X')) {
      active.delete(from);
      await send('🏆 ¡Ganaste!\n' + render(game.board));
      return true;
    }
    const free = game.board.map((v,i) => /^[1-9]$/.test(v) ? i : -1).filter((i) => i >= 0);
    if (!free.length) {
      active.delete(from);
      await send('🤝 ¡Empate!\n' + render(game.board));
      return true;
    }
    // Prioriza ganar o bloquear una victoria inmediata; si no, elige una casilla libre.
    const winningMove = (mark) => free.find((i) => {
      game.board[i] = mark; const wins = winner(mark); game.board[i] = String(i + 1); return wins;
    });
    const move = winningMove('O') ?? winningMove('X') ?? pick(free);
    game.board[move] = 'O';
    if (winner('O')) {
      active.delete(from);
      await send('🤖 Gané esta vez.\n' + render(game.board));
    } else if (!game.board.some((v) => /^[1-9]$/.test(v))) {
      active.delete(from);
      await send('🤝 ¡Empate!\n' + render(game.board));
    } else {
      await send(render(game.board) + '\nTu turno: /jugar <1-9>');
    }
    return true;
  }
  return false;
}

function render(board) {
  return board.slice(0,3).join(' | ') + '\n' + board.slice(3,6).join(' | ') + '\n' + board.slice(6,9).join(' | ');
}
