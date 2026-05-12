import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '.dev.vars');
let CF_API_TOKEN = '';
let CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || '';

try {
  const envFile = readFileSync(envPath, 'utf-8');
  const match = envFile.match(/CF_API_TOKEN=["']?([^"'\n]+)["']?/);
  if (match) CF_API_TOKEN = match[1];
} catch(e) {}

if (!CF_ACCOUNT_ID) {
  try {
    const envFile = readFileSync(envPath, 'utf-8');
    const match = envFile.match(/(?:CF_ACCOUNT_ID|CLOUDFLARE_ACCOUNT_ID)=["']?([^"'\n]+)["']?/);
    if (match) CF_ACCOUNT_ID = match[1];
  } catch(e) {}
}

// If .dev.vars doesn't have it, try to read from wrangler config or assume user needs to provide it.
// Actually, I can just read it from the user's .dev.vars or environment.
console.log('Token starts with:', CF_API_TOKEN ? CF_API_TOKEN.substring(0, 5) : 'NONE');

// But wait, the token might be in .deploy.vps.env ? No, it's a secret.
// Where is CF_API_TOKEN? It's a secret in CF. 
