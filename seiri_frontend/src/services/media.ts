// Media loading. Uses expo-media-library on native; falls back to seeded demo
// items on web/preview so the app is fully explorable there.

import { Platform } from "react-native";

// Lazy-load native-only module so web/preview builds don't crash.
// Keep the native module type local so TypeScript does not need to resolve
// expo-media-library in web/preview builds where it is not installed.

//////change
type MediaLibraryModule = {
  requestPermissionsAsync: () => Promise<{ status: string }>;
  getPermissionsAsync: () => Promise<{ status: string }>;
  getAssetsAsync: (options: {
    mediaType: string[];
    first: number;
    sortBy: unknown[];
    after?: string;
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
  getAssetInfoAsync: (id: string) => Promise<{ fileSize?: number }>;
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
  { url: "https://images.unsplash.com/photo-1516466723877-e4ec1d736c8a?w=1200", name: "screenshot-1.jpg" }, // treat as screenshot for demo
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
    // Vary file sizes so "Large photos" bucket has items.
    fileSize:
      p.name.includes("mountain") || p.name.includes("waterfall")
        ? 8_500_000 + i * 250_000
        : 1_200_000 + i * 120_000,
    // Vary time so "Old photos" and "Recently added" both have items.
    creationTime: now - (i % 5 === 0 ? 400 : i * 3) * 24 * 60 * 60 * 1000,
    isDemo: true,
  }));
}
export function isMediaLibraryAvailable(): boolean {
  return (Platform.OS === "ios" || Platform.OS === "android") && !!getMediaLibrary();
}

export async function requestPermission(): Promise<PermissionState> {
  const ML = getMediaLibrary();
  if (!ML) return "unavailable";
  try {
    const res = await ML.requestPermissionsAsync();
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

export async function loadAllMedia(): Promise<MediaItem[]> {
  const ML = getMediaLibrary();
  if (!ML) return seedDemo();
  try {
    const perm = await getCurrentPermission();
    if (perm !== "granted") return seedDemo();
    const out: MediaItem[] = [];
    let after: string | undefined;
    while (out.length < 500) {
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
    return out.length ? out : seedDemo();
  } catch {
    return seedDemo();
  }
}

export async function enrichFileSize(item: MediaItem): Promise<MediaItem> {
  const ML = getMediaLibrary();
  if (item.isDemo || !ML) return item;
  if (item.fileSize > 0) return item;
  try {
    const info = await ML.getAssetInfoAsync(item.id);
    const size = (info as any).fileSize as number | undefined;
    return { ...item, fileSize: size ?? 0 };
  } catch {
    return item;
  }
}