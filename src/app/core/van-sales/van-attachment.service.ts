import { Injectable } from '@angular/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { uuidV4 } from './van-uuid';

const DIR = 'van-attachments';

/**
 * Photos and signatures, kept on the device until their upload (#38) posts.
 *
 * Filesystem, not localStorage: a cheque photo is a few hundred kilobytes and
 * localStorage's ~5 MB would be gone after a dozen. On web the Filesystem
 * plugin stores in IndexedDB, so one code path serves both.
 */
@Injectable({ providedIn: 'root' })
export class VanAttachmentService {
  /** Saves a data URL (or raw base64) and returns its id. */
  async save(dataUrl: string): Promise<string> {
    const id = uuidV4();
    await Filesystem.writeFile({
      path: `${DIR}/${id}.txt`,
      data: dataUrl,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    return id;
  }

  /** The stored data URL, or null when it is gone. */
  async read(id: string): Promise<string | null> {
    try {
      const file = await Filesystem.readFile({ path: `${DIR}/${id}.txt`, directory: Directory.Data, encoding: Encoding.UTF8 });
      return typeof file.data === 'string' ? file.data : null;
    } catch {
      return null;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await Filesystem.deleteFile({ path: `${DIR}/${id}.txt`, directory: Directory.Data });
    } catch {
      // Already gone.
    }
  }
}
