import { pathToFileURL } from 'node:url';

/** True when the calling module is the script Node was started with. */
export function isMain(importMetaUrl: string): boolean {
  return Boolean(process.argv[1]) && importMetaUrl === pathToFileURL(process.argv[1]!).href;
}
