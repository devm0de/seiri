// src/services/media.ts

import {
  requestPermissionsAsync,
  Query,
  AssetField,
  MediaType,
  deleteAssetsAsync,
  createAssetAsync,
  getAssetInfoAsync,
  // getAlbumAsync,
} from "expo-media-library";
import { File, Directory, Paths } from "expo-file-system";
import { Asset } from 'expo-media-library';
import * as LegacyMediaLibrary from 'expo-media-library/legacy';
import { Platform } from 'react-native';
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PermissionState = "undetermined" | "granted" | "denied";

export type MediaItem = {
  id: string;
  uri: string;
  filename: string;
  mediaType: "photo" | "video";
  width: number;
  height: number;
  duration?: number;
  creationTime: number;
  isDemo?: boolean;
  fileSize?: number;
  contentHash?: string;
  isScreenshot?: boolean;
};

// Kept for backwards compatibility with any file that imports AppMedia.
export type AppMedia = MediaItem;

// ---------------------------------------------------------------------------
// Loading media
// ---------------------------------------------------------------------------

/**
 * Loads only the assets inside a specific album, so the swipe queue (and
 * therefore every delete/keep/organize action) is scoped to that album.
 * Nothing outside the album can be touched.
 *
 * Returns an empty array if the album doesn't exist.
 */
export async function loadAlbumMedia(albumName: string): Promise<MediaItem[]> {
  const permission = await requestPermissionsAsync(true);
  if (!permission.granted) throw new Error("Gallery permission was not granted.");

  // Use the NEW API's album lookup, which returns the Album type that
  // Query.album(...) accepts. Do NOT use getAlbumAsync here — that's the
  // legacy API and returns an incompatible Album type.
  const { Album } = await import("expo-media-library");
  const album = await (Album as any).get(albumName);
  if (!album) return [];

  const assets = await new Query()
    .album(album)
    .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
    .limit(1000)
    .exe();

  const items: MediaItem[] = [];
  for (const asset of assets) {
    const [uri, filename, width, height, duration, creationTime, mediaType] =
      await Promise.all([
        asset.getUri(),
        asset.getFilename(),
        asset.getWidth(),
        asset.getHeight(),
        asset.getDuration(),
        asset.getCreationTime(),
        asset.getMediaType(),
      ]);

    items.push({
      id: asset.id,
      uri,
      filename,
      mediaType: mediaType === MediaType.VIDEO ? "video" : "photo",
      width,
      height,
      duration: duration ?? undefined,
      creationTime: creationTime ?? Date.now(),
    });
  }

  return items;
}

async function convertStoredIdToAsset(storedId: string): Promise<Asset> {
  console.log('Converting stored ID:', storedId);
  if (Platform.OS === 'ios') {
    // On iOS, the legacy ID just needs the ph:// prefix.
    // If your stored ID already has ph://, this will double it, so you may need a check.
    const uri = storedId.startsWith('ph://') ? storedId : `ph://${storedId}`;
    return new Asset(uri);
  } else {
    // On Android, we need to resolve the numeric MediaStore ID to a content:// URI.
    const contentUri = await LegacyMediaLibrary.getAssetContentUriAsync(storedId);
    return new Asset(contentUri);
  }
}

// ---------------------------------------------------------------------------
// Enrichment: file size + content hash
// ---------------------------------------------------------------------------

/**
 * Fills in the file size for a media item using the new File API.
 * Returns a new object (never mutates the input).
 */
export async function enrichMediaItem(m: MediaItem): Promise<MediaItem> {
  if (m.fileSize) return m;

  // Media library URIs are ph:// or content:// — `new File()` can't read them
  // directly, and trying to can hang the bridge. Go straight to the asset-info
  // fallback, which is fast and reliable.
  try {
    const info = await getAssetInfoAsync(m.id);
    const localUri = (info as any)?.localUri as string | undefined;
    if (localUri) {
      const file = new File(localUri);
      if (file.exists && typeof file.size === "number") {
        return { ...m, fileSize: file.size };
      }
    }
  } catch {
    // ignore
  }

  return m;
}

/**
 * Cheap content hash for duplicate detection.
 * Deliberately does NOT read file contents — reading full files blocks
 * the JS thread and freezes the UI. Size + dimensions is good enough to
 * catch obvious dupes; real content hashing can be done on-demand later.
 */
export async function computeQuickHash(m: MediaItem): Promise<string> {
  const parts = [
    m.fileSize ?? 0,
    m.width ?? 0,
    m.height ?? 0,
    Math.round(m.duration ?? 0),
  ];
  let h = 5381;
  const s = parts.join(":");
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return `qh_${(h >>> 0).toString(16)}`;
}

// ---------------------------------------------------------------------------
// Device deletion
// ---------------------------------------------------------------------------

/**
 * Deletes the given media assets from the device.
 * Shows the OS confirmation dialog; resolves `true` if the user confirmed
 * and the deletion succeeded, `false` if they cancelled or it failed.
 *
 * On Android, deleteAssetsAsync moves items into the system trash/recycle
 * bin (not a hard erase). On iOS, it puts them in the "Recently Deleted"
 * album. Either way, the OS owns the restore flow from here.
 *
 * Requires WRITE permission — see requestPermissionsAsync(true) above.
 */
// Make sure to import Asset from expo-media-library at the top

export async function deleteAssetsFromDevice(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    // 1. Convert all stored IDs to Asset instances
    const assets = await Promise.all(
      ids.map(id => convertStoredIdToAsset(id))
    );

    // 2. Delete the assets using the new static method
    await Asset.delete(assets);
    
    return true;
  } catch (e) {
    console.warn("deleteAssetsFromDevice failed:", e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Duplication
// ---------------------------------------------------------------------------

/**
 * Copies a photo/video into a new file in the app's cache directory, then
 * saves that copy back into the system gallery as a brand new asset.
 * Returns the new MediaItem (as loaded from the library), or null on failure.
 */
export async function duplicateAssetToLibrary(
  m: MediaItem,
): Promise<MediaItem | null> {
  try {
    // 1. Resolve a readable local URI for the source asset.
    const info = await getAssetInfoAsync(m.id);
    const localUri = (info as any)?.localUri as string | undefined;
    const sourceUri = localUri ?? m.uri;

    // 2. Copy into the app cache so we have a real file:// path to hand off.
    const cacheDir = new Directory(Paths.cache, "duplicates");
    if (!cacheDir.exists) cacheDir.create({ intermediates: true });

    const ext = sourceUri.includes(".")
      ? sourceUri.slice(sourceUri.lastIndexOf("."))
      : m.mediaType === "video"
        ? ".mp4"
        : ".jpg";

    const filename = `dup_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}${ext}`;
    const destFile = new File(cacheDir, filename);

    const sourceFile = new File(sourceUri);
    sourceFile.copy(destFile);

    // 3. Save the copy back into the system gallery.
    const newAsset = await createAssetAsync(destFile.uri);

    // 4. Build the MediaItem from the new asset's real data.
    const newFile = new File(destFile.uri);
    const copy: MediaItem = {
      id: newAsset.id,
      uri: newAsset.uri,
      filename: newAsset.filename ?? filename,
      mediaType: m.mediaType,
      width: newAsset.width ?? m.width,
      height: newAsset.height ?? m.height,
      duration: m.duration,
      creationTime: newAsset.creationTime ?? Date.now(),
      fileSize: newFile.exists ? newFile.size : undefined,
    };

    // Clean up the cache copy — the gallery now owns its own file.
    try {
      if (newFile.exists) newFile.delete();
    } catch {
      // non-fatal
    }

    return copy;
  } catch (e) {
    console.warn("duplicateAssetToLibrary failed:", e);
    return null;
  }
}