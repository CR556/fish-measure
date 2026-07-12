import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Per-catch files live at <documentDir>/catches/<catchId>/. The catch id is
 * generated BEFORE capture and passed to the native side as the output dir,
 * so there is never a move/rename step — Keep just adds a thumbnail and a DB
 * row; discard deletes the directory. DB stores paths RELATIVE to catches/.
 */

const THUMB_MAX = 400;

export function catchesDir(): Directory {
  const dir = new Directory(Paths.document, 'catches');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Absolute plain filesystem path (no file://) for the native output dir. */
export function catchOutputDir(catchId: string): string {
  const dir = new Directory(catchesDir(), catchId);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir.uri.replace(/^file:\/\//, '');
}

/** A native-returned absolute path → path relative to catches/ (for the DB). */
export function toRelative(absPath: string): string {
  const base = catchesDir().uri.replace(/^file:\/\//, '');
  const clean = absPath.replace(/^file:\/\//, '');
  const idx = clean.indexOf(base);
  return idx >= 0 ? clean.slice(idx + base.length).replace(/^\/+/, '') : clean;
}

/** A stored relative path → file:// URI for <Image>/sharing. */
export function resolveCatchUri(relPath: string): string {
  return new File(catchesDir(), relPath).uri;
}

/** Generates thumb.jpg next to the photo; returns its relative path. */
export async function makeThumbnail(catchId: string, photoAbsPath: string): Promise<string> {
  const srcUri = photoAbsPath.startsWith('file://') ? photoAbsPath : `file://${photoAbsPath}`;
  const context = ImageManipulator.manipulate(srcUri);
  context.resize({ width: THUMB_MAX });
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });

  const dest = new File(catchesDir(), `${catchId}/thumb.jpg`);
  if (dest.exists) dest.delete();
  new File(result.uri).move(dest);
  return `${catchId}/thumb.jpg`;
}

/** Writes contour.json (normalized upright-photo coords) for later re-draw. */
export function writeContourJson(
  catchId: string,
  data: { contour: number[]; noseNorm: [number, number]; tailNorm: [number, number] }
): string {
  const file = new File(catchesDir(), `${catchId}/contour.json`);
  file.write(JSON.stringify(data));
  return `${catchId}/contour.json`;
}

/** Deletes an entire catch directory (discard, or delete-from-log). */
export function deleteCatchDir(catchId: string): void {
  const dir = new Directory(catchesDir(), catchId);
  if (dir.exists) dir.delete();
}
