import { describe, expect, it, vi } from 'vitest';
import { uploadBlob, type UploadTransport, uploadTypeOf } from './client';

const coded = (code: string) => Object.assign(new Error(code), { code });

/** A server that keeps the bytes it receives, and a network that can drop requests. */
function fakeServer(totalBytes: number) {
  let received = new Uint8Array(0);
  const drops: Array<'before' | 'after'> = [];
  const t: UploadTransport = {
    create: vi.fn(async () => ({ id: 'u1', offset: 0, totalBytes })),
    offset: vi.fn(async () => received.length),
    send: vi.fn(async (_id: string, offset: number, chunk: Blob) => {
      const drop = drops.shift();
      if (drop === 'before') throw coded('network');
      if (offset !== received.length) throw coded('offset_mismatch');
      const bytes = new Uint8Array(await chunk.arrayBuffer());
      const next = new Uint8Array(received.length + bytes.length);
      next.set(received);
      next.set(bytes, received.length);
      received = next;
      // The server got it, but the reply never reached the phone.
      if (drop === 'after') throw coded('network');
      return { id: 'u1', offset: received.length, totalBytes };
    }),
  };
  return { t, drops, received: () => received };
}

const data = (n: number) => new Blob([Uint8Array.from({ length: n }, (_, i) => i % 251)]);
const noSleep = async () => {};

describe('resumable uploads', () => {
  it('sends the file in chunks and reports progress', async () => {
    const s = fakeServer(2500);
    const progress: number[] = [];
    const id = await uploadBlob(s.t, data(2500), 'image/jpeg', { chunkBytes: 1000, onProgress: (f) => progress.push(f), sleep: noSleep });
    expect(id).toBe('u1');
    expect(s.received()).toEqual(new Uint8Array(await data(2500).arrayBuffer()));
    expect(progress).toEqual([0, 0.4, 0.8, 1]);
  });

  it('resumes from what the server has after a dropped request or a lost reply', async () => {
    const s = fakeServer(3000);
    s.drops.push('before', 'after', 'before');
    await uploadBlob(s.t, data(3000), 'image/jpeg', { chunkBytes: 1000, sleep: noSleep });
    // Every byte exactly once, in order, despite the retries.
    expect(s.received()).toEqual(new Uint8Array(await data(3000).arrayBuffer()));
    expect(s.t.offset).toHaveBeenCalledTimes(3);
  });

  it('backs off between retries and gives up eventually', async () => {
    const s = fakeServer(1000);
    s.drops.push(...Array(10).fill('before'));
    const waits: number[] = [];
    await expect(
      uploadBlob(s.t, data(1000), 'image/jpeg', { retries: 3, sleep: async (ms) => void waits.push(ms) }),
    ).rejects.toMatchObject({ code: 'network' });
    expect(waits).toHaveLength(3);
    expect(waits[2]!).toBeGreaterThan(waits[0]!);
  });

  it("doesn't retry errors that retrying can't fix", async () => {
    const s = fakeServer(1000);
    vi.mocked(s.t.send).mockRejectedValueOnce(coded('unsupported_media'));
    await expect(uploadBlob(s.t, data(1000), 'image/jpeg', { sleep: noSleep })).rejects.toMatchObject({ code: 'unsupported_media' });
    expect(s.t.send).toHaveBeenCalledTimes(1);
  });

  it('only accepts JPEG, PNG and WebP', () => {
    expect(uploadTypeOf('image/jpg')).toBe('image/jpeg');
    expect(uploadTypeOf('image/heic')).toBeNull();
    expect(uploadTypeOf('image/svg+xml')).toBeNull();
  });
});
