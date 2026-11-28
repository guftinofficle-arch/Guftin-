import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const root = process.cwd();
const generator = path.join(root, 'scripts', 'prepare-chat-notification-sounds.js');
const assets = path.join(root, 'assets');
const filenames = [
  'guftin_chat_soft.wav',
  'guftin_chat_bright.wav',
  'guftin_chat_chime.wav'
];

describe('bundled per-chat notification sounds', () => {
  it('generates three distinct, valid WAV notification assets', () => {
    execFileSync(process.execPath, [generator], { cwd: root });
    const contents = filenames.map(filename => {
      const buffer = readFileSync(path.join(assets, filename));
      assert.equal(buffer.subarray(0, 4).toString('ascii'), 'RIFF');
      assert.equal(buffer.subarray(8, 12).toString('ascii'), 'WAVE');
      assert.equal(buffer.readUInt16LE(20), 1, 'expected PCM encoding');
      assert.equal(buffer.readUInt16LE(22), 1, 'expected mono audio');
      assert.equal(buffer.readUInt32LE(24), 22050, 'expected 22.05 kHz audio');
      assert.ok(statSync(path.join(assets, filename)).size > 1000);
      return buffer.toString('base64');
    });
    assert.equal(new Set(contents).size, 3, 'each chat sound preset must be different');
  });
});
