const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const PASSWORD = process.env.PAGES_CHAT_PASSWORD || process.env.AUTH_PASSWORD;
const INPUT_PATH = path.resolve(process.env.PAGES_CHAT_INPUT || '_chat.txt');
const OUTPUT_PATH = path.resolve(process.env.PAGES_CHAT_OUTPUT || 'docs/data/chat.enc.json');
const ITERATIONS = Number(process.env.PAGES_CHAT_ITERATIONS || 310000);

if (!PASSWORD) {
  console.error('Missing AUTH_PASSWORD or PAGES_CHAT_PASSWORD.');
  process.exit(1);
}

if (!fs.existsSync(INPUT_PATH)) {
  console.error(`Missing chat file: ${INPUT_PATH}`);
  process.exit(1);
}

const raw = fs.readFileSync(INPUT_PATH, 'utf8');
const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const key = crypto.pbkdf2Sync(PASSWORD, salt, ITERATIONS, 32, 'sha256');
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const encrypted = Buffer.concat([
  cipher.update(raw, 'utf8'),
  cipher.final(),
  cipher.getAuthTag(),
]);

const payload = {
  version: 1,
  algorithm: 'AES-256-GCM',
  kdf: 'PBKDF2-SHA256',
  iterations: ITERATIONS,
  salt: salt.toString('base64'),
  iv: iv.toString('base64'),
  data: encrypted.toString('base64'),
  generatedAt: new Date().toISOString(),
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload)}\n`);
console.log(`Encrypted ${Buffer.byteLength(raw, 'utf8')} bytes to ${OUTPUT_PATH}`);
