import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "../../store/AppContext";
import { makeStyles, useTheme } from "../../theme";
import { getAlbumCoverUri } from "@/services/media";

type DisplayAlbum = {
  key: string; // lowercase name, used to dedupe app + device albums
  appId: string | null; // set once this album is tracked inside the app
  name: string;
  count: number;
  coverUri?: string;
  isDeviceOnly: boolean;
};

export default function AlbumsScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { state, createAlbum, loadDeviceAlbums } = useApp();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  // Covers fetched straight from the phone, keyed by lowercase album name.
  const [deviceCovers, setDeviceCovers] = useState<Record<string, string>>({});

  // Refresh the phone's real album list every time this screen is opened,
  // in case the user added a new album/photo from their camera app.
  useEffect(() => {
    loadDeviceAlbums();
  }, [loadDeviceAlbums]);

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    createAlbum(trimmed);
    setName("");
    setCreating(false);
  };

  // One single, merged list — an album made in the app and an album that
  // happens to already exist on the phone under the same name are treated
  // as the SAME album here, not two separate things in two sections. This
  // avoids the confusing "jumps to a different section" behavior.
  const albums: DisplayAlbum[] = useMemo(() => {
    const map = new Map<string, DisplayAlbum>();

    state.albums.forEach((a) => {
      const firstId = state.albumItems[a.id]?.[0];
      const first = state.media.find((m) => m.id === firstId);
      map.set(a.name.toLowerCase(), {
        key: a.name.toLowerCase(),
        appId: a.id,
        name: a.name,
        count: a.count,
        coverUri: a.coverUri || first?.uri,
        isDeviceOnly: false,
      });
    });

    state.deviceAlbums.forEach((d) => {
      const key = d.name.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          key,
          appId: null,
          name: d.name,
          count: d.assetCount,
          coverUri: undefined,
          isDeviceOnly: true,
        });
      } else {
        // App already tracks it, but the phone's own item count is the
        // more accurate one (the app's own count only reflects photos
        // moved in through this app).
        const existing = map.get(key)!;
        map.set(key, { ...existing, count: Math.max(existing.count, d.assetCount) });
      }
    });

    return Array.from(map.values());
  }, [state.albums, state.deviceAlbums, state.albumItems, state.media]);

  // Fetch a real cover photo for any album that doesn't already have one
  // (mainly the phone-only albums, but also covers the case where an app
  // album's own cover info is missing).
  useEffect(() => {
    const missing = albums.filter((a) => !a.coverUri && !deviceCovers[a.key]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const a of missing) {
        const uri = await getAlbumCoverUri(a.name);
        if (cancelled) return;
        if (uri) {
          setDeviceCovers((prev) => ({ ...prev, [a.key]: uri }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albums.map((a) => a.key).join(",")]);

  // Whichever album is tapped, make sure it has an app-tracked id before
  // navigating — the detail screen is looked up by that id.
  const openAlbum = (album: DisplayAlbum) => {
    const id = album.appId ?? createAlbum(album.name).id;
    router.push(`/album/${id}`);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={[styles.container, { paddingTop: insets.top }]} testID="albums-screen">
        <View style={styles.header}>
          <Text style={styles.title}>Albums</Text>
          <Pressable
            testID="new-album-btn"
            onPress={() => setCreating(true)}
            style={styles.addBtn}
          >
            <Ionicons name="add" size={22} color={colors.onBrandPrimary} />
          </Pressable>
        </View>

        {/* Pinned above the scrollable list, always visible, never
            scrolled out of view. */}
        {creating && (
          <View style={styles.createRow}>
            <TextInput
              testID="album-name-input"
              style={styles.input}
              placeholder="Album name"
              placeholderTextColor={colors.muted}
              value={name}
              autoFocus
              onChangeText={setName}
              onSubmitEditing={handleCreate}
            />
            <Pressable
              testID="album-create-confirm"
              style={[styles.saveBtn, { backgroundColor: name.trim() ? colors.brandPrimary : colors.surfaceTertiary }]}
              onPress={handleCreate}
              disabled={!name.trim()}
            >
              <Text style={{ color: name.trim() ? colors.onBrandPrimary : colors.muted, fontWeight: "700" }}>
                Create
              </Text>
            </Pressable>
            <Pressable
              testID="album-create-cancel"
              style={styles.cancelBtn}
              onPress={() => {
                setName("");
                setCreating(false);
              }}
            >
              <Text style={{ color: colors.muted }}>Cancel</Text>
            </Pressable>
          </View>
        )}

        {albums.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="albums-outline" size={56} color={colors.muted} />
            <Text style={styles.emptyTitle}>No albums yet</Text>
            <Text style={styles.emptySub}>Tap + to create your first album.</Text>
          </View>
        ) : (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          >
            <View style={styles.grid}>
              {albums.map((item) => {
                const cover = item.coverUri || deviceCovers[item.key];
                return (
                  <Pressable
                    key={item.key}
                    testID={`album-${item.key}`}
                    style={styles.tile}
                    onPress={() => openAlbum(item)}
                  >
                    <View style={styles.cover}>
                      {cover ? (
                        <Image source={{ uri: cover }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                      ) : (
                        <Ionicons
                          name={item.isDeviceOnly ? "phone-portrait-outline" : "folder"}
                          size={40}
                          color={colors.muted}
                        />
                      )}
                    </View>
                    <Text style={styles.tileName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.tileCount}>{item.count} items</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: { fontSize: 28, fontWeight: "800", color: c.onSurface },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  createRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    alignItems: "center",
  },
  input: {
    flex: 1,
    backgroundColor: c.surfaceSecondary,
    color: c.onSurface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  saveBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  cancelBtn: { paddingHorizontal: 8, paddingVertical: 10 },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: c.onSurface, marginTop: 8 },
  emptySub: { fontSize: 14, color: c.muted },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 8,
  },
  tile: {
    width: "47%",
    backgroundColor: c.surfaceSecondary,
    borderRadius: 16,
    padding: 10,
  },
  cover: {
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: c.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 8,
  },
  tileName: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  tileCount: { fontSize: 12, color: c.muted, marginTop: 2 },
}));