const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '../../app.log');
const IS_PROD = process.env.NODE_ENV === 'production';

function write(level, message) {
  const timestamp = new Date().toISOString();
  const line = `${timestamp} [${level}] ${message}\n`;

  // Siempre a consola
  if (level === 'ERROR') {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }

  // A archivo (no bloqueante)
  fs.appendFile(LOG_FILE, line, (err) => {
    if (err && !IS_PROD) process.stderr.write(`Logger write error: ${err.message}\n`);
  });
}

const logger = {
  info:  (msg) => write('INFO',  msg),
  warn:  (msg) => write('WARN',  msg),
  error: (msg) => write('ERROR', msg),
};

module.exports = logger;
