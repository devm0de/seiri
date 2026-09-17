// src/services/media.ts

import * as MediaLibrary from "expo-media-library/legacy"; // <-- Changed this line

export type AppMedia = {
  // ... your existing type
};

export async function loadAllMedia(): Promise<AppMedia[]> {
  const permission = await MediaLibrary.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Gallery permission was not granted.");
  }

  const result = await MediaLibrary.getAssetsAsync({
    mediaType: ["photo", "video"],
    first: 1000,
  });

  return result.assets.map((asset) => ({
    // ... your existing mapping
  }));
}