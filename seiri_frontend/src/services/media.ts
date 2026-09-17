import * as MediaLibrary from "expo-media-library";

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
  const permission = await MediaLibrary.requestPermissionsAsync();

  if (!permission.granted) {
    throw new Error("Gallery permission was not granted.");
  }

  // 2. Get REAL photos and videos from the phone
  const result = await MediaLibrary.getAssetsAsync({
  mediaType: ["photo", "video"],
  first: 1000,
});

  // 3. Convert Expo assets into our app's format
  return result.assets.map((asset) => ({
    id: asset.id,
    uri: asset.uri,
    filename: asset.filename,
    mediaType: asset.mediaType === "video" ? "video" : "photo",
    width: asset.width,
    height: asset.height,
    duration: asset.duration,
    creationTime: asset.creationTime,
  }));
}