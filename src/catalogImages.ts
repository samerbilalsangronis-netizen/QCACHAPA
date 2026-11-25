import type {SupabaseClient} from '@supabase/supabase-js';

const bucket = 'qcachapa-images';
const extensions:Record<string,string> = {
  'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/avif':'avif',
};
export const imageAccept = Object.keys(extensions).join(',');
type SaveResult = {error:{code?:string;message:string}|null};

export function imageProblem(file:File) {
  if (!Object.hasOwn(extensions,file.type)) return 'Elige una imagen JPG, PNG, WebP o AVIF.';
  if (!file.size) return 'El archivo está vacío. Elige otra imagen.';
  if (file.size > 5 * 1024 * 1024) return 'La imagen debe pesar como máximo 5 MB.';
  return '';
}

export async function saveCatalogImages<Key extends string>(
  db:SupabaseClient, data:FormData, keys:readonly Key[],
  save:(images:Partial<Record<Key,string|null>>)=>PromiseLike<SaveResult>,
) {
  const images:Partial<Record<Key,string|null>> = {};
  const uploaded:string[] = [];
  const storage = db.storage.from(bucket);
  let writingRecord = false;
  try {
    for (const key of keys) {
      const file = data.get(key);
      if (file instanceof File && file.name) {
        const problem = imageProblem(file);
        if (problem) throw new Error(problem);
        const {data:{session}} = await db.auth.getSession();
        if (!session) throw new Error('Tu sesión terminó. Vuelve a iniciar sesión para subir imágenes.');
        const path = session.user.id + '/' + crypto.randomUUID() + '.' + extensions[file.type];
        const {error} = await storage.upload(path,file,{contentType:file.type,cacheControl:'31536000',upsert:false});
        if (error) {
          if (/bucket not found|does not exist/i.test(error.message)) throw new Error('Falta habilitar la carga de imágenes en Supabase. Aplica la migración de imágenes del catálogo.');
          throw new Error('No se pudo subir la imagen. ' + error.message);
        }
        uploaded.push(path);
        images[key] = storage.getPublicUrl(path).data.publicUrl;
      } else if (data.get(key+'_remove') === 'yes') {
        images[key] = null;
      }
    }
    writingRecord = true;
    const result = await save(images);
    // Clean up if the database reported a definitive rejection. A lost response can
    // also mean the write succeeded, so leave its files available in that case.
    if (result.error?.code && /^(?:[\dA-Z]{5}|PGRST116)$/.test(result.error.code) && uploaded.length) {
      await storage.remove(uploaded).catch(() => {});
    }
    return result;
  } catch (error) {
    if (!writingRecord && uploaded.length) await storage.remove(uploaded).catch(() => {});
    throw error;
  }
}
