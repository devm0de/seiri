// src/services/media.ts

import {
  requestPermissionsAsync,
  Query,
  AssetField,
  MediaType,
} from "expo-media-library";

export type AppMedia = {
  id: string;
  uri: string;
  filename: string;
  mediaType: "photo" | "video";
  width: number;
  height: number;
  duration?: number;
  creationTime: number;
};

export async function loadAllMedia(): Promise<AppMedia[]> {
  // 1. Ask for permission to access the phone gallery
  const permission = await requestPermissionsAsync();

  if (!permission.granted) {
    throw new Error("Gallery permission was not granted.");
  }

  // 2. Get REAL photos and videos from the phone using the new Query API
  const assets = await new Query()
    .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
    .limit(1000)
    .exe();

  // 3. Convert Expo assets into our app's format
  const mediaItems: AppMedia[] = [];

  for (const asset of assets) {
    const mediaType = await asset.getMediaType();

    // Only include photos and videos (skip audio/unknown)
    if (mediaType !== MediaType.IMAGE && mediaType !== MediaType.VIDEO) {
      continue;
    }

    const [uri, filename, width, height, duration, creationTime] = await Promise.all([
      asset.getUri(),
      asset.getFilename(),
      asset.getWidth(),
      asset.getHeight(),
      mediaType === MediaType.VIDEO ? asset.getDuration() : Promise.resolve(null),
      asset.getCreationTime(),
    ]);

    mediaItems.push({
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

  return mediaItems;
}