import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "../../store/AppContext";
import { makeStyles, useTheme } from "../../theme";

export default function AlbumsScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { state, createAlbum } = useApp();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    createAlbum(trimmed);
    setName("");
    setCreating(false);
  };

  return (
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

      {state.albums.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="albums-outline" size={56} color={colors.muted} />
          <Text style={styles.emptyTitle}>No albums yet</Text>
          <Text style={styles.emptySub}>Tap + to create your first album.</Text>
        </View>
      ) : (
        <FlatList
          data={state.albums}
          keyExtractor={(a) => a.id}
          numColumns={2}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          columnWrapperStyle={{ gap: 12 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item }) => {
            const firstId = state.albumItems[item.id]?.[0];
            const first = state.media.find((m) => m.id === firstId);
            const cover = item.coverUri || first?.uri;
            return (
              <Pressable
                testID={`album-${item.id}`}
                style={styles.tile}
                onPress={() => router.push(`./albums/${item.id}`)}
              >
                <View style={styles.cover}>
                  {cover ? (
                    <Image source={{ uri: cover }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                  ) : (
                    <Ionicons name="folder" size={40} color={colors.muted} />
                  )}
                </View>
                <Text style={styles.tileName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.tileCount}>{item.count} items</Text>
              </Pressable>
            );
          }}
        />
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

  tile: {
    flex: 1,
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
