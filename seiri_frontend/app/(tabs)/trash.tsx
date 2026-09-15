import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { formatBytes, useApp } from "../../store/AppContext";
import { makeStyles, useTheme } from "../../theme";

function daysLeft(deletedAt: number, days: number): number | null {
  if (!days) return null;
  const remaining = days * 24 * 60 * 60 * 1000 - (Date.now() - deletedAt);
  return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
}

export default function TrashScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { state, restoreFromTrash, permanentlyDelete, emptyTrash } = useApp();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<null | "some" | "all">(null);
  const [working, setWorking] = useState(false);

  const autoDays = state.settings.autoDeleteDays;
  const isEmpty = state.trash.length === 0;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const doRestore = () => {
    restoreFromTrash([...selected]);
    setSelected(new Set());
  };

  // Real, permanent deletion. This shows the OS's own confirm dialog on top
  // of ours; if the person backs out there, nothing changes here either.
  const doDelete = async () => {
    setWorking(true);
    await permanentlyDelete([...selected]);
    setWorking(false);
    setSelected(new Set());
    setConfirming(null);
  };
  const doEmpty = async () => {
    setWorking(true);
    await emptyTrash();
    setWorking(false);
    setSelected(new Set());
    setConfirming(null);
  };

  const anySelected = selected.size > 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="trash-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Recently Deleted</Text>
          <Text style={styles.sub}>
            {isEmpty
              ? "Trash is empty"
              : `${state.trash.length} items · ${autoDays > 0 ? `auto-delete in ${autoDays}d` : "kept forever"}`}
          </Text>
        </View>
        {!isEmpty && (
          <Pressable
            testID="empty-trash-btn"
            style={styles.emptyBtn}
            onPress={() => setConfirming("all")}
          >
            <Text style={{ color: colors.error, fontWeight: "700" }}>Empty</Text>
          </Pressable>
        )}
      </View>

      {isEmpty ? (
        <View style={styles.empty}>
          <Ionicons name="trash-outline" size={56} color={colors.muted} />
          <Text style={styles.emptyTitle}>Nothing to restore</Text>
          <Text style={styles.emptySub}>Deleted media appears here first.</Text>
        </View>
      ) : (
        <FlatList
          data={state.trash}
          keyExtractor={(t) => t.media.id}
          numColumns={3}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: anySelected ? 120 : 24 }}
          columnWrapperStyle={{ gap: 6 }}
          ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
          renderItem={({ item }) => {
            const isSel = selected.has(item.media.id);
            const days = daysLeft(item.deletedAt, autoDays);
            return (
              <Pressable
                testID={`trash-item-${item.media.id}`}
                onPress={() => toggle(item.media.id)}
                style={styles.thumbWrap}
              >
                <Image
                  source={{ uri: item.media.uri }}
                  style={styles.thumb}
                  contentFit="cover"
                  transition={100}
                />
                {days !== null && (
                  <View style={styles.dayPill}>
                    <Text style={styles.dayPillText}>{days}d</Text>
                  </View>
                )}
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

      {anySelected && (
        <View style={[styles.actionBar, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={styles.selCount}>{selected.size} selected</Text>
          <Pressable
            testID="restore-selected-btn"
            style={[styles.barBtn, { backgroundColor: colors.brandPrimary }]}
            onPress={doRestore}
          >
            <Ionicons name="refresh" size={18} color={colors.onBrandPrimary} />
            <Text style={{ color: colors.onBrandPrimary, fontWeight: "700" }}>Restore</Text>
          </Pressable>
          <Pressable
            testID="delete-selected-btn"
            style={[styles.barBtn, { backgroundColor: colors.error }]}
            onPress={() => setConfirming("some")}
          >
            <Ionicons name="trash" size={18} color={colors.onError} />
            <Text style={{ color: colors.onError, fontWeight: "700" }}>Delete</Text>
          </Pressable>
        </View>
      )}

      <Modal transparent animationType="fade" visible={confirming !== null}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Ionicons name="warning" size={28} color={colors.error} />
            <Text style={styles.modalTitle}>Permanently delete?</Text>
            <Text style={styles.modalBody}>
              {confirming === "all"
                ? `All ${state.trash.length} items in Recently Deleted will be removed from your phone. Your device may ask you to confirm once more. This cannot be undone from this app.`
                : `${selected.size} item${selected.size === 1 ? "" : "s"} will be removed from your phone. Your device may ask you to confirm once more. This cannot be undone from this app.`}
            </Text>
            <View style={styles.modalRow}>
              <Pressable
                style={styles.modalCancel}
                onPress={() => setConfirming(null)}
                disabled={working}
                testID="confirm-cancel-btn"
              >
                <Text style={{ color: colors.onSurface, fontWeight: "700" }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalConfirm, { backgroundColor: colors.error, opacity: working ? 0.6 : 1 }]}
                onPress={confirming === "all" ? doEmpty : doDelete}
                disabled={working}
                testID="confirm-delete-btn"
              >
                <Text style={{ color: colors.onError, fontWeight: "700" }}>
                  {working ? "Deleting…" : "Delete"}
                </Text>
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
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 8,
  },
  title: { fontSize: 24, fontWeight: "800", color: c.onSurface },
  sub: { fontSize: 13, color: c.muted, marginTop: 2 },
  emptyBtn: { paddingHorizontal: 12, paddingVertical: 8 },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: c.onSurface, marginTop: 8 },
  emptySub: { fontSize: 14, color: c.muted },

  thumbWrap: { flex: 1, aspectRatio: 1, borderRadius: 10, overflow: "hidden" },
  thumb: { width: "100%", height: "100%" },
  dayPill: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dayPillText: { color: "#FFF", fontSize: 11, fontWeight: "700" },
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
