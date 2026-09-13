import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Image,
  View,
  Text,
  StyleSheet,
  Dimensions,
} from "react-native";
import * as MediaLibrary from "expo-media-library/legacy";
const { width, height } = Dimensions.get("window");
type MediaAsset = Awaited<
  ReturnType<typeof MediaLibrary.getAssetsAsync>
>["assets"][number];

export default function GalleryScreen(): React.ReactElement {
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [currentUri, setCurrentUri] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Ask permission and load media
  const requestPermissionAndLoadMedia = async (): Promise<void> => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Please allow access to your photos and videos."
        );
        setLoading(false);
        return;
      }

      await loadMedia();
    } catch (error) {
      console.error("Permission error:", error);
      setLoading(false);
    }
  };

  // Load photos and videos using correct API
  const loadMedia = async (): Promise<void> => {
    try {
      const assets = await MediaLibrary.getAssetsAsync({
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        first: 1000,
        sortBy: "creationTime",
      });

      setMedia(assets.assets);
    } catch (error) {
      console.error("Load media error:", error);
      Alert.alert(
        "Error",
        "Could not load photos and videos."
      );
    } finally {
      setLoading(false);
    }
  };

  // Load the URI of the current media
  useEffect(() => {
    const loadCurrentMedia = async (): Promise<void> => {
      if (media.length === 0 || !media[currentIndex]) return;

      const asset = media[currentIndex];
      
      // Get the URI using the correct method
      const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.id);
      setCurrentUri(assetInfo.localUri || assetInfo.uri);
    };

    loadCurrentMedia();
  }, [currentIndex, media]);

  // Request permission when app opens
  useEffect(() => {
    requestPermissionAndLoadMedia();
  }, []);

  const nextMedia = (): void => {
    if (currentIndex < media.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const previousMedia = (): void => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <Text>Loading your gallery...</Text>
      </View>
    );
  }

  if (media.length === 0) {
    return (
      <View style={styles.center}>
        <Text>No photos or videos found.</Text>
        <Button
          title="Try Again"
          onPress={requestPermissionAndLoadMedia}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Counter */}
      <Text style={styles.counter}>
        {currentIndex + 1} / {media.length}
      </Text>

      {/* Current media */}
      {currentUri && (
        <Image
          source={{ uri: currentUri }}
          style={styles.media}
          resizeMode="contain"
        />
      )}

      {/* Navigation */}
      <View style={styles.buttons}>
        <Button
          title="Previous"
          onPress={previousMedia}
          disabled={currentIndex === 0}
        />

        <Button
          title="Next"
          onPress={nextMedia}
          disabled={currentIndex === media.length - 1}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingTop: 60,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  counter: {
    textAlign: "center",
    fontSize: 18,
    marginBottom: 20,
  },
  media: {
    width: width,
    height: height * 0.7,
  },
  buttons: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 20,
    paddingHorizontal: 20,
  },
});