import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "../../store/AppContext";
import { makeStyles, useTheme } from "../../theme";

export default function AlbumDetailScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { state, renameAlbum, removeAlbum, removeFromAlbum } = useApp();

  const album = state.albums.find((a) => a.id === id);
  const ids = state.albumItems[id ?? ""] ?? [];
  const items = ids.map((mid) => state.media.find((m) => m.id === mid)).filter(Boolean) as any[];

  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(album?.name ?? "");
  const [confirmDel, setConfirmDel] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (!album) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]} testID="album-not-found">
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.empty}>
          <Ionicons name="folder-open-outline" size={56} color={colors.muted} />
          <Text style={styles.emptyTitle}>Album not found</Text>
          <Pressable style={styles.backLink} onPress={() => router.back()}>
            <Text style={{ color: colors.brandPrimary }}>Back to albums</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const toggle = (mid: string) => {
    const next = new Set(selected);
    if (next.has(mid)) next.delete(mid);
    else next.add(mid);
    setSelected(next);
  };

  const doRemoveSelected = () => {
    selected.forEach((mid) => removeFromAlbum(mid, album.id));
    setSelected(new Set());
  };

  const handleRename = () => {
    const trimmed = newName.trim();
    if (trimmed) renameAlbum(album.id, trimmed);
    setRenaming(false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="album-detail">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="back-btn">
          <Ionicons name="chevron-back" size={26} color={colors.brandPrimary} />
        </Pressable>
        {renaming ? (
          <TextInput
            testID="rename-input"
            style={styles.renameInput}
            value={newName}
            autoFocus
            onChangeText={setNewName}
            onSubmitEditing={handleRename}
            onBlur={handleRename}
          />
        ) : (
          <View style={{ flex: 1, marginLeft: 4 }}>
            <Text style={styles.title} numberOfLines={1}>
              {album.name}
            </Text>
            <Text style={styles.sub}>{items.length} items</Text>
          </View>
        )}
        <Pressable onPress={() => setRenaming((v) => !v)} testID="rename-btn" style={styles.iconBtn}>
          <Ionicons name={renaming ? "checkmark" : "pencil"} size={20} color={colors.brandPrimary} />
        </Pressable>
        <Pressable onPress={() => setConfirmDel(true)} testID="delete-album-btn" style={styles.iconBtn}>
          <Ionicons name="trash" size={20} color={colors.error} />
        </Pressable>
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="images-outline" size={56} color={colors.muted} />
          <Text style={styles.emptyTitle}>Empty album</Text>
          <Text style={styles.emptySub}>Add items from the Clean tab by swiping up.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(m) => m.id}
          numColumns={3}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: selected.size ? 100 : 24 }}
          columnWrapperStyle={{ gap: 6 }}
          ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
          renderItem={({ item }) => {
            const isSel = selected.has(item.id);
            return (
              <Pressable
                testID={`album-item-${item.id}`}
                onPress={() => toggle(item.id)}
                style={styles.thumbWrap}
              >
                <Image source={{ uri: item.uri }} style={styles.thumb} contentFit="cover" />
                {isSel && (
                  <View style={styles.selOverlay}>
                    <Ionicons name="checkmark-circle" size={30} color={colors.brandPrimary} />
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      )}

      {selected.size > 0 && (
        <View style={[styles.actionBar, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={styles.selCount}>{selected.size} selected</Text>
          <Pressable
            testID="remove-from-album-btn"
            style={[styles.barBtn, { backgroundColor: colors.error }]}
            onPress={doRemoveSelected}
          >
            <Ionicons name="remove-circle" size={18} color={colors.onError} />
            <Text style={{ color: colors.onError, fontWeight: "700" }}>Remove from album</Text>
          </Pressable>
        </View>
      )}

      <Modal transparent animationType="fade" visible={confirmDel}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Ionicons name="warning" size={28} color={colors.warning} />
            <Text style={styles.modalTitle}>Delete album?</Text>
            <Text style={styles.modalBody}>
              The album will be removed. Your media stays safe in your library.
            </Text>
            <View style={styles.modalRow}>
              <Pressable
                style={styles.modalCancel}
                onPress={() => setConfirmDel(false)}
                testID="confirm-cancel-btn"
              >
                <Text style={{ color: colors.onSurface, fontWeight: "700" }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalConfirm, { backgroundColor: colors.error }]}
                onPress={() => {
                  removeAlbum(album.id);
                  setConfirmDel(false);
                  router.back();
                }}
                testID="confirm-delete-album-btn"
              >
                <Text style={{ color: colors.onError, fontWeight: "700" }}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  title: { fontSize: 20, fontWeight: "800", color: c.onSurface },
  sub: { fontSize: 12, color: c.muted },
  iconBtn: { padding: 6 },
  renameInput: {
    flex: 1,
    marginLeft: 6,
    backgroundColor: c.surfaceSecondary,
    color: c.onSurface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    fontWeight: "700",
  },

  thumbWrap: { flex: 1, aspectRatio: 1, borderRadius: 10, overflow: "hidden" },
  thumb: { width: "100%", height: "100%" },
  selOverlay: {
    ...({ position: "absolute" } as any),
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,122,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: c.onSurface, marginTop: 8 },
  emptySub: { fontSize: 14, color: c.muted, textAlign: "center", marginHorizontal: 32 },
  backLink: { marginTop: 8 },

  actionBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: c.surfaceSecondary,
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  selCount: { flex: 1, fontSize: 14, fontWeight: "700", color: c.onSurface },
  barBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: c.surface,
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    gap: 8,
    width: "100%",
    maxWidth: 360,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: c.onSurface },
  modalBody: { fontSize: 14, color: c.muted, textAlign: "center" },
  modalRow: { flexDirection: "row", gap: 8, marginTop: 12, width: "100%" },
  modalCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: c.surfaceSecondary,
    alignItems: "center",
  },
  modalConfirm: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
}));
