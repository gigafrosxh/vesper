'use strict';
// Save storage for the desktop build: one file per key in the user's save directory.
// Writes go to a temporary file, are flushed with fsync and then atomically renamed (NFR-02).
const fs = require('node:fs');
const path = require('node:path');

const KEY_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function assertValidKey(key) {
  // Same rule as the renderer: a key can never name a path outside the save directory (NFR-06).
  if (typeof key !== 'string' || !KEY_RE.test(key) || key.includes('..')) throw new Error(`invalid storage key: ${key}`);
}

function createFileStorage(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = (key) => path.join(dir, `${key}.json`);
  return {
    read(key) {
      assertValidKey(key);
      try {
        return fs.readFileSync(file(key), 'utf8');
      } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
      }
    },
    write(key, value) {
      assertValidKey(key);
      if (typeof value !== 'string') throw new Error('value must be a string');
      const target = file(key);
      const tmp = `${target}.${process.pid}.tmp`;
      const fd = fs.openSync(tmp, 'w');
      try {
        fs.writeFileSync(fd, value, 'utf8');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tmp, target);
    },
    remove(key) {
      assertValidKey(key);
      fs.rmSync(file(key), { force: true });
    },
    keys() {
      return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -5))
        .filter((k) => KEY_RE.test(k));
    },
  };
}

module.exports = { createFileStorage, assertValidKey };
