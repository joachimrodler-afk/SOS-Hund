/**
 * Fotos für Anfragen: im Browser verkleinern, bevor sie hochgeladen werden.
 * Ein Handyfoto (4–8 MB) wird so zu einem JPG mit höchstens 1600 px Kantenlänge (meist 200–400 KB).
 */

export interface Foto {
  /** zum Anzeigen im Formular */
  vorschau: string;
  mime: 'image/jpeg';
  /** Base64 ohne „data:“-Vorspann – so erwartet es das Backend */
  data: string;
}

export const FOTO_MAX = 5;
const KANTE = 1600;

function ladeBild(datei: File): Promise<HTMLImageElement> {
  return new Promise((ok, fehler) => {
    const url = URL.createObjectURL(datei);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); fehler(new Error(`„${datei.name}“ kann nicht als Bild gelesen werden.`)); };
    img.src = url;
  });
}

export async function verkleinern(datei: File): Promise<Foto> {
  if (!datei.type.startsWith('image/')) throw new Error(`„${datei.name}“ ist kein Bild.`);
  const img = await ladeBild(datei);
  const faktor = Math.min(1, KANTE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * faktor);
  canvas.height = Math.round(img.naturalHeight * faktor);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Dieses Gerät kann keine Fotos verkleinern.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const vorschau = canvas.toDataURL('image/jpeg', 0.8);
  return { vorschau, mime: 'image/jpeg', data: vorschau.slice(vorschau.indexOf(',') + 1) };
}
