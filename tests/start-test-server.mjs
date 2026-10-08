// Starts the server on a fresh, throwaway data file.
import fs from 'node:fs';

fs.rmSync(process.env.DATA_FILE || 'data/test-db.json', { force: true });
await import('../server/index.js');
