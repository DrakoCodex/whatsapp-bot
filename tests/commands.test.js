import test from 'node:test';
import assert from 'node:assert/strict';
import { handleUtilities } from '../src/commands/utilities.js';
import { handleGames } from '../src/commands/games.js';
import { handleGroupCommands } from '../src/commands/groups.js';

function mock() {
  const sent = [];
  return {
    sent,
    sock: { sendMessage: async (to, payload) => { sent.push({ to, ...payload }); } },
    msg: { key: { remoteJid: '12345@g.us', participant: 'user-1@s.whatsapp.net' }, message: {} }
  };
}

test('porcentaje calcula correctamente y responde en español', async () => {
  const { sock, msg, sent } = mock();
  assert.equal(await handleUtilities(sock, 'chat', msg, '/porcentaje', ['18','250'], '18 250'), true);
  assert.match(sent[0].text, /45/);
});

test('conversor de temperatura Celsius a Fahrenheit', async () => {
  const { sock, msg, sent } = mock();
  await handleUtilities(sock, 'chat', msg, '/temperatura', ['0','C'], '0 C');
  assert.match(sent[0].text, /32\.0°F/);
});

test('conversor binario codifica texto', async () => {
  const { sock, msg, sent } = mock();
  await handleUtilities(sock, 'chat', msg, '/binario', ['encode','Hola'], 'encode Hola');
  assert.match(sent[0].text, /01001000/);
});

test('tatetí inicia una partida y acepta una casilla válida', async () => {
  const { sock, msg, sent } = mock();
  await handleGames(sock, 'chat-game', msg, '/tateti', [], '');
  assert.match(sent[0].text, /TATETI/);
  await handleGames(sock, 'chat-game', msg, '/jugar', ['1'], '1');
  assert.match(sent[1].text, /X/);
});

test('encuesta de grupo registra votos y muestra resultados', async () => {
  const { sock, msg, sent } = mock();
  const chat = 'group@g.us';
  await handleGroupCommands(sock, chat, msg, '/encuesta', [], '¿Qué hacemos? | Jugar | Ver película');
  assert.match(sent[0].text, /ENCUESTA/);
  await handleGroupCommands(sock, chat, msg, '/votar', ['2'], '2');
  await handleGroupCommands(sock, chat, msg, '/resultados', [], '');
  assert.match(sent[2].text, /Ver película: \*1\*/);
});

test('herramientas de grupo no se ejecutan en chat privado', async () => {
  const { sock, msg, sent } = mock();
  await handleGroupCommands(sock, 'private@s.whatsapp.net', msg, '/sorteo', ['Ana,','Luis'], 'Ana, Luis');
  assert.match(sent[0].text, /disponible dentro de grupos/);
});
