import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Local-disk storage for photos and upload staging. Every file name is a
 * random key: original filenames, which often contain names or dates, are
 * never kept.
 */
export function createStorage(root: string) {
  const tmpDir = join(root, 'tmp');
  const photoDir = join(root, 'photos');
  let ready: Promise<unknown> | null = null;
  const ensureDirs = () => (ready ??= Promise.all([mkdir(tmpDir, { recursive: true }), mkdir(photoDir, { recursive: true })]));

  const checked = (key: string) => {
    if (!/^[a-f0-9]{32}$/.test(key)) throw new Error('invalid storage key');
    return key;
  };
  const tmpPath = (key: string) => join(tmpDir, checked(key));
  const photoPath = (key: string) => join(photoDir, `${checked(key)}.webp`);

  return {
    newKey: () => randomBytes(16).toString('hex'),

    async createTmp(key: string) {
      await ensureDirs();
      await writeFile(tmpPath(key), new Uint8Array(), { flag: 'wx' });
    },
    /** Writes a chunk at `offset` (a retried chunk simply overwrites itself). */
    async writeTmp(key: string, offset: number, chunk: Uint8Array) {
      const fh = await open(tmpPath(key), 'r+');
      try {
        await fh.write(chunk, 0, chunk.length, offset);
      } finally {
        await fh.close();
      }
    },
    readTmp: (key: string) => readFile(tmpPath(key)),
    removeTmp: (key: string) => rm(tmpPath(key), { force: true }),

    async savePhoto(key: string, data: Uint8Array) {
      await ensureDirs();
      await writeFile(photoPath(key), data, { flag: 'wx' });
    },
    readPhoto: (key: string) => readFile(photoPath(key)),
    photoStream: (key: string) => createReadStream(photoPath(key)),
    removePhoto: (key: string) => rm(photoPath(key), { force: true }),
  };
}

export type Storage = ReturnType<typeof createStorage>;
