// app/dev.tsx
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { nukeAppTrash, wipeAllAppData } from "@/db";
import { useApp } from "../store/AppContext";
import { makeStyles, useTheme } from "../theme";

export default function DevScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { state, reloadMedia } = useApp();
  const [busy, setBusy] = useState(false);

  const onClearTrash = () => {
    Alert.alert(
      "Clear app trash?",
      `This removes ${state.trash.length} entries from the app's trash database. Photos stay on your phone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            await nukeAppTrash();
            await reloadMedia();
            setBusy(false);
            Alert.alert("Done", "App trash cleared. Gallery untouched.");
          },
        },
      ],
    );
  };

  const onWipeAll = () => {
    Alert.alert(
      "Wipe ALL app data?",
      "This deletes settings, albums, album items, and trash from this app. Photos stay on your phone. Restart the app after.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Wipe everything",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            await wipeAllAppData();
            setBusy(false);
            Alert.alert(
              "Wiped",
              "Database deleted. Close and reopen the app to start fresh.",
            );
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + 16 }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
    >
      <Text style={styles.title}>Dev tools</Text>
      <Text style={styles.sub}>
        These only touch this app's local database. They never delete photos
        from your device.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Current app state</Text>
        <Text style={styles.row}>
          Trash entries: <Text style={styles.value}>{state.trash.length}</Text>
        </Text>
        <Text style={styles.row}>
          Media in queue: <Text style={styles.value}>{state.media.length}</Text>
        </Text>
        <Text style={styles.row}>
          Albums: <Text style={styles.value}>{state.albums.length}</Text>
        </Text>
      </View>

      <Pressable
        onPress={onClearTrash}
        disabled={busy || state.trash.length === 0}
        style={[
          styles.btn,
          {
            backgroundColor: colors.brandPrimary,
            opacity: busy || state.trash.length === 0 ? 0.5 : 1,
          },
        ]}
      >
        <Text style={styles.btnText}>
          {busy ? "Working…" : "Clear app trash"}
        </Text>
      </Pressable>

      <Pressable
        onPress={onWipeAll}
        disabled={busy}
        style={[styles.btn, { backgroundColor: colors.error, opacity: busy ? 0.5 : 1 }]}
      >
        <Text style={[styles.btnText, { color: colors.onError }]}>
          Wipe ALL app data
        </Text>
      </Pressable>

      <Pressable
        onPress={reloadMedia}
        disabled={busy}
        style={[styles.btn, { backgroundColor: colors.surfaceSecondary }]}
      >
        <Text style={[styles.btnText, { color: colors.onSurface }]}>
          Reload media from gallery
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface, paddingHorizontal: 16 },
  title: { fontSize: 24, fontWeight: "800", color: c.onSurface },
  sub: { fontSize: 13, color: c.muted, marginTop: 4, marginBottom: 20 },
  card: {
    backgroundColor: c.surfaceSecondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    gap: 6,
  },
  cardTitle: { fontSize: 14, fontWeight: "700", color: c.onSurface, marginBottom: 6 },
  row: { fontSize: 14, color: c.muted },
  value: { fontWeight: "700", color: c.onSurface },
  btn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  btnText: { fontWeight: "700", color: c.onBrandPrimary, fontSize: 15 },
}));