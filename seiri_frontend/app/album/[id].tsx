// app/album/[id].tsx
//
// PLACEMENT: this file goes at app/album/[id].tsx — a brand new "album"
// folder (singular — different from your existing "albums" tab) sitting
// right next to your (tabs) folder, NOT inside it. So the layout looks
// like:
//
//   app/
//     (tabs)/
//       ...your existing tab screens...
//     album/
//       [id].tsx   <-- this file
//
// Being outside the (tabs) group is exactly what makes it open as a
// screen that slides in on top of the tabs (like a normal "detail" page).

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "../../store/AppContext";
import { makeStyles, useTheme } from "../../theme";
import { loadMediaForAlbum, MediaItem } from "@/services/media";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

export default function AlbumDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useApp();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  const album = state.albums.find((a) => a.id === id);
  const [photos, setPhotos] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  // Reads straight from the phone rather than the app's in-memory list, so
  // this always matches what's really in the album, even for photos that
  // were added to it outside the app.
  useEffect(() => {
    if (!album) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const items = await loadMediaForAlbum(album.name);
      if (!cancelled) {
        setPhotos(items);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [album?.name]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="album-detail-screen">
      {/* Sets the native header title to the album's name. */}
      <Stack.Screen options={{ title: album?.name ?? "Album", headerBackTitle: "Albums" }} />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="album-back-btn">
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {album?.name ?? "Album"}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} size="large" />
        </View>
      ) : !album ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.muted} />
          <Text style={styles.emptyText}>Couldn't find this album.</Text>
        </View>
      ) : photos.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="images-outline" size={48} color={colors.muted} />
          <Text style={styles.emptyText}>No photos in this album yet.</Text>
        </View>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={(p) => p.id}
          numColumns={3}
          contentContainerStyle={{ padding: 8 }}
          columnWrapperStyle={{ gap: 4 }}
          ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
          renderItem={({ item, index }) => (
            <Pressable
              style={styles.thumbWrap}
              onPress={() => setViewerIndex(index)}
              testID={`album-photo-${item.id}`}
            >
              <Image source={{ uri: item.uri }} style={styles.thumb} contentFit="cover" transition={100} />
              {item.mediaType === "video" && (
                <View style={styles.videoDot}>
                  <Ionicons name="videocam" size={12} color="#FFF" />
                </View>
              )}
            </Pressable>
          )}
        />
      )}

      {/* Full-screen viewer — tap a thumbnail above to open it here. Swipe
          left/right to move between photos, pinch or double-tap a photo to
          zoom, videos get the phone's normal playback controls. */}
      <Modal
        visible={viewerIndex !== null}
        animationType="fade"
        onRequestClose={() => setViewerIndex(null)}
      >
        <View style={styles.viewerContainer}>
          <Pressable
            onPress={() => setViewerIndex(null)}
            style={[styles.viewerCloseBtn, { top: insets.top + 8 }]}
            testID="viewer-close-btn"
          >
            <Ionicons name="close" size={26} color="#FFF" />
          </Pressable>
          {viewerIndex !== null && (
            <FlatList
              data={photos}
              keyExtractor={(p) => p.id}
              horizontal
              pagingEnabled
              initialScrollIndex={viewerIndex}
              getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
                setViewerIndex(idx);
              }}
              renderItem={({ item, index }) => (
                <ViewerItem item={item} isActive={index === viewerIndex} />
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

// One full-screen page inside the viewer: a photo you can pinch/double-tap
// to zoom, or a video with the phone's normal built-in playback controls.
function ViewerItem({ item, isActive }: { item: MediaItem; isActive: boolean }) {
  const zoom = useSharedValue(1);

  const player = useVideoPlayer(item.mediaType === "video" ? item.uri : null, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    if (item.mediaType !== "video") return;
    if (isActive) player.play();
    else player.pause();
  }, [isActive, item.mediaType, player]);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      zoom.value = Math.max(1, Math.min(4, e.scale));
    })
    .onEnd(() => {
      zoom.value = withSpring(1);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      zoom.value = withSpring(zoom.value > 1.1 ? 1 : 2.5);
    });

  const composed = Gesture.Simultaneous(pinch, doubleTap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: zoom.value }],
  }));

  return (
    <View style={{ width: SCREEN_W, height: SCREEN_H, alignItems: "center", justifyContent: "center" }}>
      {item.mediaType === "video" ? (
        <VideoView
          player={player}
          style={{ width: SCREEN_W, height: SCREEN_H }}
          contentFit="contain"
          nativeControls
        />
      ) : (
        <GestureDetector gesture={composed}>
          <Animated.View style={[{ width: SCREEN_W, height: SCREEN_H }, animatedStyle]}>
            <Image source={{ uri: item.uri }} style={{ width: "100%", height: "100%" }} contentFit="contain" />
          </Animated.View>
        </GestureDetector>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: c.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyText: { fontSize: 14, color: c.muted },
  thumbWrap: { flex: 1, aspectRatio: 1, borderRadius: 8, overflow: "hidden" },
  thumb: { width: "100%", height: "100%" },
  videoDot: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 8,
    padding: 3,
  },
  viewerContainer: { flex: 1, backgroundColor: "#000" },
  viewerCloseBtn: {
    position: "absolute",
    right: 16,
    zIndex: 10,
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20,
  },
}));