const path = require('node:path');
const dotenv = require('dotenv');

const appRoot = __dirname;

for (const filename of ['.env.production', '.env']) {
  dotenv.config({ path: path.join(appRoot, filename), quiet: true });
}

const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || 'production',
  HOST: process.env.HOST || '127.0.0.1',
  PORT: process.env.PORT || '3000',
  SQLITE_DB_PATH: process.env.SQLITE_DB_PATH || '/opt/expo-server/data/exhibition.sqlite',
  FILE_STORAGE_ROOT: process.env.FILE_STORAGE_ROOT || '/var/expo-files',
  PUBLIC_DIR: process.env.PUBLIC_DIR || '/var/www/expo-static',
  RUN_SCHEDULED_ON_START: process.env.RUN_SCHEDULED_ON_START || '0'
};

module.exports = {
  apps: [
    {
      name: process.env.PM2_APP_NAME || 'expo-server',
      cwd: appRoot,
      script: './server.mjs',
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '500M',
      env,
      time: true
    }
  ]
};
