const fs = require('node:fs');
const path = require('node:path');

const sampleRate = 22050;
const assetsDirectory = path.join(__dirname, '..', 'assets');

const profiles = {
  guftin_chat_soft: [
    { frequency: 587.33, durationMs: 105, gapMs: 55 },
    { frequency: 783.99, durationMs: 125, gapMs: 0 }
  ],
  guftin_chat_bright: [
    { frequency: 880, durationMs: 85, gapMs: 45 },
    { frequency: 1174.66, durationMs: 145, gapMs: 0 }
  ],
  guftin_chat_chime: [
    { frequency: 523.25, durationMs: 130, gapMs: 35 },
    { frequency: 659.25, durationMs: 150, gapMs: 35 },
    { frequency: 783.99, durationMs: 230, gapMs: 0 }
  ]
};

function createWave(segments) {
  const totalMs = segments.reduce((sum, segment) => sum + segment.durationMs + segment.gapMs, 0);
  const frameCount = Math.ceil(sampleRate * totalMs / 1000);
  const data = Buffer.alloc(frameCount * 2);
  let cursor = 0;

  for (const segment of segments) {
    const length = Math.floor(sampleRate * segment.durationMs / 1000);
    const attack = Math.max(1, Math.floor(sampleRate * 0.006));
    const release = Math.max(1, Math.floor(sampleRate * 0.035));
    for (let index = 0; index < length && cursor < frameCount; index += 1, cursor += 1) {
      const fadeIn = Math.min(1, index / attack);
      const fadeOut = Math.min(1, (length - index) / release);
      const envelope = Math.min(fadeIn, fadeOut);
      const phase = 2 * Math.PI * segment.frequency * index / sampleRate;
      const sample = Math.round(Math.sin(phase) * envelope * 0.18 * 32767);
      data.writeInt16LE(sample, cursor * 2);
    }
    cursor += Math.floor(sampleRate * segment.gapMs / 1000);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

fs.mkdirSync(assetsDirectory, { recursive: true });
for (const [name, segments] of Object.entries(profiles)) {
  const output = path.join(assetsDirectory, name + '.wav');
  fs.writeFileSync(output, createWave(segments));
}
