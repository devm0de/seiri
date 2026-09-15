// Media loading. Uses expo-media-library on native; falls back to seeded demo
// items on web/preview so the app is fully explorable there.
//
// IMPORTANT: this only talks to the *real* photo library on a native build
// (custom dev client / standalone app), not in a web preview and not fully
// inside plain Expo Go, because expo-media-library's write/delete APIs need
// native code.
 
import { Platform } from "react-native";
// SDK 52+ moved cacheDirectory/readAsStringAsync/copyAsync/getInfoAsync to
// the "legacy" entry point; the new top-level API uses File/Directory
// classes instead. Importing from /legacy keeps the rest of this file as-is.
import * as FileSystem from "expo-file-system/legacy";
 
// Plain-JS fingerprint (cyrb53-style) — no native module needed, unlike
// expo-crypto. Not cryptographically secure, which is fine: this is only
// used to spot duplicate photos/videos, not for anything security-sensitive.
function quickFingerprint(str: string): string {
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
}
 
// Lazy-load native-only module so web/preview builds don't crash.
type MediaLibraryModule = {
  requestPermissionsAsync: (writeOnly?: boolean) => Promise<{ status: string }>;
  getPermissionsAsync: () => Promise<{ status: string }>;
  getAssetsAsync: (options: {
    mediaType: string[];
    first: number;
    sortBy: unknown[];
    after?: string;
    album?: unknown;
  }) => Promise<{
    assets: Array<{
      id: string;
      uri: string;
      filename: string;
      mediaType: string;
      width: number;
      height: number;
      duration?: number;
      creationTime?: number;
    }>;
    hasNextPage: boolean;
    endCursor?: string;
  }>;
  getAssetInfoAsync: (id: string) => Promise<{ fileSize?: number; localUri?: string }>;
  getAlbumsAsync: () => Promise<Array<{ id: string; title: string }>>;
  deleteAssetsAsync: (ids: string[]) => Promise<boolean>;
  createAssetAsync: (uri: string) => Promise<{
    id: string;
    uri: string;
    filename: string;
    width: number;
    height: number;
    duration?: number;
    creationTime?: number;
  }>;
  SortBy: { creationTime: unknown };
};
 
let mediaLibrary: MediaLibraryModule | null = null;
function getMediaLibrary(): MediaLibraryModule | null {
  if (Platform.OS === "web") return null;
  if (mediaLibrary) return mediaLibrary;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mediaLibrary = require("expo-media-library") as MediaLibraryModule;
    return mediaLibrary;
  } catch {
    return null;
  }
}
 
export type MediaItem = {
  id: string;
  uri: string;
  filename: string;
  mediaType: "photo" | "video";
  width: number;
  height: number;
  duration: number; // seconds, 0 for photos
  fileSize: number; // bytes (best-effort)
  creationTime: number; // ms
  albumId?: string | null;
  isDemo?: boolean;
  // Populated lazily on native builds:
  localUri?: string; // real file:// path (iOS asset uris are ph://, not readable directly)
  isScreenshot?: boolean;
  contentHash?: string; // used for real duplicate detection
};
 
export type PermissionState = "granted" | "denied" | "undetermined" | "unavailable";
 
const DEMO_PHOTOS = [
  { url: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1200", name: "mountain-sunrise.jpg" },
  { url: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1200", name: "forest-trail.jpg" },
  { url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200", name: "lake-view.jpg" },
  { url: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200", name: "misty-peaks.jpg" },
  { url: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1200", name: "reflection.jpg" },
  { url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1200", name: "river-flow.jpg" },
  { url: "https://images.unsplash.com/photo-1494526585095-c41746248156?w=1200", name: "canyon.jpg" },
  { url: "https://images.unsplash.com/photo-1505765050516-f72dcac9c60e?w=1200", name: "hiker.jpg" },
  { url: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1200", name: "pine-forest.jpg" },
  { url: "https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=1200", name: "yellow-flowers.jpg" },
  { url: "https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=1200", name: "leaves.jpg" },
  { url: "https://images.unsplash.com/photo-1516466723877-e4ec1d736c8a?w=1200", name: "screenshot-1.jpg" },
  { url: "https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=1200", name: "cat.jpg" },
  { url: "https://images.unsplash.com/photo-1552053831-71594a27632d?w=1200", name: "dog.jpg" },
  { url: "https://images.unsplash.com/photo-1526336024174-e58f5cdd8e13?w=1200", name: "beach-day.jpg" },
  { url: "https://images.unsplash.com/photo-1519183071298-a2962be96f83?w=1200", name: "desert.jpg" },
  { url: "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?w=1200", name: "waterfall.jpg" },
  { url: "https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=1200", name: "sunset-lake.jpg" },
  { url: "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1200", name: "tall-tree.jpg" },
  { url: "https://images.unsplash.com/photo-1497436072909-60f360e1d4b1?w=1200", name: "mountain-lake.jpg" },
];
 
function seedDemo(): MediaItem[] {
  const now = Date.now();
  return DEMO_PHOTOS.map((p, i) => ({
    id: `demo-${i}`,
    uri: p.url,
    filename: p.name,
    mediaType: "photo" as const,
    width: 1200,
    height: 800,
    duration: 0,
    fileSize:
      p.name.includes("mountain") || p.name.includes("waterfall")
        ? 8_500_000 + i * 250_000
        : 1_200_000 + i * 120_000,
    creationTime: now - (i % 5 === 0 ? 400 : i * 3) * 24 * 60 * 60 * 1000,
    isDemo: true,
    isScreenshot: p.name.includes("screenshot"),
  }));
}
 
export function isMediaLibraryAvailable(): boolean {
  return (Platform.OS === "ios" || Platform.OS === "android") && !!getMediaLibrary();
}
 
export async function requestPermission(): Promise<PermissionState> {
  const ML = getMediaLibrary();
  if (!ML) return "unavailable";
  try {
    // false = request full read/write access (needed for delete + save/duplicate).
    const res = await ML.requestPermissionsAsync(false);
    if (res.status === "granted") return "granted";
    if (res.status === "denied") return "denied";
    return "undetermined";
  } catch {
    return "unavailable";
  }
}
 
export async function getCurrentPermission(): Promise<PermissionState> {
  const ML = getMediaLibrary();
  if (!ML) return "unavailable";
  try {
    const res = await ML.getPermissionsAsync();
    if (res.status === "granted") return "granted";
    if (res.status === "denied") return "denied";
    return "undetermined";
  } catch {
    return "unavailable";
  }
}
 
/** IDs of every asset (photo AND video) that live in the OS "Screenshots" album. */
export async function getScreenshotAssetIds(): Promise<Set<string>> {
  const ML = getMediaLibrary();
  if (!ML) return new Set();
  try {
    const albums = await ML.getAlbumsAsync();
    const shot = albums.find((a) => /screenshot/i.test(a.title));
    if (!shot) return new Set();
    const ids = new Set<string>();
    let after: string | undefined;
    for (;;) {
      const page = await ML.getAssetsAsync({
        mediaType: ["photo", "video"],
        first: 200,
        sortBy: [ML.SortBy.creationTime],
        after,
        album: shot,
      });
      page.assets.forEach((a) => ids.add(a.id));
      if (!page.hasNextPage) break;
      after = page.endCursor;
    }
    return ids;
  } catch {
    return new Set();
  }
}
 
export async function loadAllMedia(): Promise<MediaItem[]> {
  const ML = getMediaLibrary();
  if (!ML) return seedDemo();
  try {
    const perm = await getCurrentPermission();
    if (perm !== "granted") return seedDemo();
    const out: MediaItem[] = [];
    let after: string | undefined;
    while (out.length < 2000) {
      const page = await ML.getAssetsAsync({
        mediaType: ["photo", "video"],
        first: 100,
        sortBy: [ML.SortBy.creationTime],
        after,
      });
      for (const a of page.assets) {
        out.push({
          id: a.id,
          uri: a.uri,
          filename: a.filename,
          mediaType: a.mediaType === "video" ? "video" : "photo",
          width: a.width,
          height: a.height,
          duration: a.duration ?? 0,
          fileSize: 0,
          creationTime: a.creationTime ?? Date.now(),
        });
      }
      if (!page.hasNextPage) break;
      after = page.endCursor;
    }
    if (!out.length) return seedDemo();
 
    const screenshotIds = await getScreenshotAssetIds();
    out.forEach((m) => {
      m.isScreenshot = screenshotIds.has(m.id);
    });
    return out;
  } catch {
    return seedDemo();
  }
}
 
/** Fills in real file size + a readable local file path (needed on iOS, whose
 * asset `uri` is a ph:// reference that can't be read directly). */
export async function enrichMediaItem(item: MediaItem): Promise<MediaItem> {
  const ML = getMediaLibrary();
  if (item.isDemo || !ML) return item;
  if (item.fileSize > 0 && item.localUri) return item;
  try {
    const info = await ML.getAssetInfoAsync(item.id);
    return {
      ...item,
      fileSize: info.fileSize ?? item.fileSize,
      localUri: info.localUri ?? item.uri,
    };
  } catch {
    return item;
  }
}
// Backwards-compatible name used elsewhere in the app.
export const enrichFileSize = enrichMediaItem;
 
/** Cheap content fingerprint (first 64KB + size) so duplicate detection isn't
 * fooled by renamed files, and doesn't require reading whole videos. */
export async function computeQuickHash(item: MediaItem): Promise<string> {
  if (item.isDemo) return `${item.filename}|${item.fileSize}`;
  const readUri = item.localUri ?? item.uri;
  try {
    const info = await FileSystem.getInfoAsync(readUri, { size: true } as any);
    const size = (info as any).size ?? item.fileSize;
    const base64 = await FileSystem.readAsStringAsync(readUri, {
      encoding: FileSystem.EncodingType.Base64,
      length: 65536,
      position: 0,
    } as any);
    return quickFingerprint(`${base64}|${size}`);
  } catch {
    return `${item.filename}|${item.fileSize}`;
  }
}
 
/** Actually deletes assets from the phone. Triggers the OS's native confirm
 * dialog (cannot be skipped, by Apple/Google design). Approved items land in
 * the system's own Recently Deleted / trash for ~30 days as an extra safety
 * net on top of this app's own trash. Returns false if the user cancelled. */
export async function deleteAssetsFromDevice(ids: string[]): Promise<boolean> {
  const ML = getMediaLibrary();
  const realIds = ids.filter((id) => !id.startsWith("demo-"));
  if (!realIds.length) return true; // nothing real to delete (demo mode)
  if (!ML) return false;
  try {
    return await ML.deleteAssetsAsync(realIds);
  } catch {
    return false;
  }
}
 
/** Copies a photo/video and saves it back to the gallery as a new asset
 * ("duplicate" / "save a copy"). Returns the new MediaItem, or null on
 * failure / demo mode. */
export async function duplicateAssetToLibrary(item: MediaItem): Promise<MediaItem | null> {
  const ML = getMediaLibrary();
  if (!ML || item.isDemo) return null;
  try {
    const readUri = item.localUri ?? (await ML.getAssetInfoAsync(item.id)).localUri ?? item.uri;
    const ext = item.mediaType === "video" ? "mp4" : "jpg";
    const dest = `${FileSystem.cacheDirectory}swipeclean-copy-${Date.now()}.${ext}`;
    await FileSystem.copyAsync({ from: readUri, to: dest });
    const asset = await ML.createAssetAsync(dest);
    return {
      id: asset.id,
      uri: asset.uri,
      filename: asset.filename,
      mediaType: item.mediaType,
      width: asset.width ?? item.width,
      height: asset.height ?? item.height,
      duration: asset.duration ?? item.duration,
      fileSize: item.fileSize,
      creationTime: asset.creationTime ?? Date.now(),
    };
  } catch {
    return null;
  }
}
 