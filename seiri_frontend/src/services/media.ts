// src/services/media.ts
//
// This file is the "bridge" between your app and the phone's real photo
// gallery.
//
// IMPORTANT: we import from "expo-media-library/legacy" and
// "expo-file-system/legacy", not the plain package names. Newer versions
// of both packages ship a new, class-based API by default (Asset with
// .getUri() instead of .uri, File/Directory/Paths instead of plain
// functions like getInfoAsync/cacheDirectory). The "/legacy" subpath on
// each package is the stable, classic, function-based API — the one
// almost all docs and tutorials assume — and it's what this whole file
// is written against.

import * as MediaLibrary from "expo-media-library/legacy";
import * as FileSystem from "expo-file-system/legacy";

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

function toMediaItem(asset: MediaLibrary.Asset): MediaItem {
  return {
    id: asset.id,
    uri: asset.uri,
    filename: asset.filename,
    mediaType: asset.mediaType === MediaLibrary.MediaType.video ? "video" : "photo",
    width: asset.width,
    height: asset.height,
    duration: asset.duration || undefined,
    creationTime: asset.creationTime,
    isScreenshot: (asset.filename || "").toLowerCase().includes("screenshot"),
  };
}

// ---------------------------------------------------------------------------
// Loading media
// ---------------------------------------------------------------------------

/**
 * Loads media from the device.
 *
 * If `albumName` matches a real album on the device, only that album's
 * photos/videos are loaded. If no album by that name exists (very likely
 * during development, since "testapp" won't exist on a real phone), this
 * falls back to loading the whole camera roll instead of silently
 * returning nothing — an empty screen with no error is confusing to debug.
 */
export async function loadAlbumMedia(albumName: string): Promise<MediaItem[]> {
  const permission = await MediaLibrary.requestPermissionsAsync();
  if (permission.status !== "granted") {
    throw new Error("Gallery permission was not granted.");
  }

  const album = await MediaLibrary.getAlbumAsync(albumName);
  if (!album) {
    console.warn(`Album "${albumName}" not found — loading entire camera roll instead.`);
  }

  const items: MediaItem[] = [];
  let after: string | undefined;
  let hasNextPage = true;

  // expo-media-library only returns one page of results at a time, like a
  // "load more" button. This loop keeps asking for the next page until
  // there isn't one, so we end up with everything.
  while (hasNextPage) {
    const page = await MediaLibrary.getAssetsAsync({
      first: 200,
      after,
      album: album ?? undefined,
      mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      sortBy: [MediaLibrary.SortBy.creationTime],
    });
    items.push(...page.assets.map(toMediaItem));
    hasNextPage = page.hasNextPage;
    after = page.endCursor;
  }

  return items;
}

// ---------------------------------------------------------------------------
// Enrichment: file size + content hash
// ---------------------------------------------------------------------------

/**
 * Fills in the file size for a media item.
 * Returns a new object (never mutates the input).
 */
export async function enrichMediaItem(m: MediaItem): Promise<MediaItem> {
  if (m.fileSize) return m;

  try {
    const info = await MediaLibrary.getAssetInfoAsync(m.id);
    const localUri = info.localUri;
    if (localUri) {
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      if (fileInfo.exists && "size" in fileInfo) {
        return { ...m, fileSize: fileInfo.size };
      }
    }
  } catch {
    // If we can't read it, just leave the item as it was.
  }

  return m;
}

/**
 * Cheap "fingerprint" for a media item, useful for spotting obvious
 * duplicates later. Deliberately does NOT read the actual file bytes —
 * that would be slow and could freeze the UI. Size + dimensions is good
 * enough to catch obvious dupes.
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
 * Shows the OS's own confirmation dialog; resolves `true` if the user
 * confirmed and deletion succeeded, `false` if they cancelled or it failed.
 *
 * On Android this moves items to the system trash/recycle bin (not a hard
 * erase). On iOS it puts them in "Recently Deleted." Either way, the OS
 * owns the restore flow from here — your app's own Trash screen is a
 * separate, app-level list on top of that.
 */
export async function deleteAssetsFromDevice(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    return await MediaLibrary.deleteAssetsAsync(ids);
  } catch (e) {
    console.warn("deleteAssetsFromDevice failed:", e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Duplication
// ---------------------------------------------------------------------------

/**
 * Copies a photo/video into a temp file, then saves that copy back into the
 * system gallery as a brand new asset. Returns the new MediaItem, or null
 * on failure.
 */
export async function duplicateAssetToLibrary(m: MediaItem): Promise<MediaItem | null> {
  try {
    // 1. Resolve a readable local URI for the source asset.
    const info = await MediaLibrary.getAssetInfoAsync(m.id);
    const sourceUri = info.localUri ?? m.uri;

    // 2. Copy into the app's cache directory so we have a plain file:// path.
    const ext = sourceUri.includes(".")
      ? sourceUri.slice(sourceUri.lastIndexOf("."))
      : m.mediaType === "video"
        ? ".mp4"
        : ".jpg";
    const destUri = `${FileSystem.cacheDirectory}dup_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}${ext}`;

    await FileSystem.copyAsync({ from: sourceUri, to: destUri });

    // 3. Save the copy back into the system gallery.
    const newAsset = await MediaLibrary.createAssetAsync(destUri);

    // 4. Build the MediaItem from the new asset's real data.
    const copy: MediaItem = {
      id: newAsset.id,
      uri: newAsset.uri,
      filename: newAsset.filename ?? destUri.split("/").pop() ?? "duplicate",
      mediaType: m.mediaType,
      width: newAsset.width ?? m.width,
      height: newAsset.height ?? m.height,
      duration: m.duration,
      creationTime: newAsset.creationTime ?? Date.now(),
    };

    // Clean up the temp cache file — the gallery keeps its own copy now.
    try {
      await FileSystem.deleteAsync(destUri, { idempotent: true });
    } catch {
      // non-fatal
    }

    return copy;
  } catch (e) {
    console.warn("duplicateAssetToLibrary failed:", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Real device albums
// ---------------------------------------------------------------------------
//
// Everything above this point can run without ever touching the phone's
// actual Photos/Gallery app's album list. These two functions are what
// make an album you create IN this app also show up as a real album
// when you open your phone's own gallery.

/**
 * Makes sure a real album with this name exists on the phone, and puts the
 * given photo/video inside it. If the album doesn't exist yet, this
 * creates it using that asset as the very first item — Android requires
 * a brand new album to be created with at least one photo already in it.
 */
export async function addAssetToDeviceAlbum(
  assetId: string,
  albumName: string,
): Promise<boolean> {
  try {
    const existing = await MediaLibrary.getAlbumAsync(albumName);
    if (!existing) {
      const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId);
      // `false` here means "don't duplicate the file" — just tag the
      // existing photo as belonging to this new album.
      await MediaLibrary.createAlbumAsync(albumName, assetInfo, false);
      return true;
    }
    return await MediaLibrary.addAssetsToAlbumAsync([assetId], existing, false);
  } catch (e) {
    console.warn("addAssetToDeviceAlbum failed:", e);
    return false;
  }
}

/**
 * Removes a photo/video from a real device album. The photo itself is NOT
 * deleted — it just stops showing up inside that one album. Some Android
 * versions don't support this and will fail silently (returns false);
 * that's fine, the app's own album list is still updated regardless.
 */
export async function removeAssetFromDeviceAlbum(
  assetId: string,
  albumName: string,
): Promise<boolean> {
  try {
    const album = await MediaLibrary.getAlbumAsync(albumName);
    if (!album) return true;
    return await MediaLibrary.removeAssetsFromAlbumAsync([assetId], album);
  } catch (e) {
    console.warn("removeAssetFromDeviceAlbum failed (this is OK on some Android versions):", e);
    return false;
  }
}

/** A lightweight summary of a real album that already exists on the phone. */
export type DeviceAlbum = { id: string; name: string; assetCount: number };

/**
 * Lists the albums that already exist on the phone's gallery — the ones
 * the user made themselves in their camera or gallery app, WhatsApp
 * folders, Screenshots, etc. `includeSmartAlbums: false` leaves out
 * auto-generated ones like "Recents"/"Favorites" so only real, user-facing
 * folders show up.
 */
export async function listDeviceAlbums(): Promise<DeviceAlbum[]> {
  try {
    const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: false });
    return albums.map((a) => ({ id: a.id, name: a.title, assetCount: a.assetCount }));
  } catch (e) {
    console.warn("listDeviceAlbums failed:", e);
    return [];
  }
}