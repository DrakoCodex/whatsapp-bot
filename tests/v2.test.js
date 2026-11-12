import test from 'node:test';
import assert from 'node:assert/strict';
import { handleV2Command } from '../src/commands/v2.js';

function createMock() {
  const sent = [];
  return {
    sent,
    sock: {
      sendMessage: async (...args) => { sent.push(args); }
    },
    msg: { key: { remoteJid: 'test@s.whatsapp.net' }, message: {} }
  };
}

test('el router v2 importa y responde al menú principal', async () => {
  const { sock, msg, sent } = createMock();
  const handled = await handleV2Command(sock, 'test@s.whatsapp.net', msg, '/menu');
  assert.equal(handled, true);
  assert.match(sent[0][1].text, /DRAKO BOT 2\.0/);
});

test('el router v2 responde al menú de juegos', async () => {
  const { sock, msg, sent } = createMock();
  const handled = await handleV2Command(sock, 'test@s.whatsapp.net', msg, '/juegos');
  assert.equal(handled, true);
  assert.match(sent[0][1].text, /TATETI|ahorcado/i);
});
