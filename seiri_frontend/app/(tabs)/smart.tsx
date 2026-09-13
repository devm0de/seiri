import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MediaItem } from "@/services/media";
import { formatBytes, useApp } from "../../store/AppContext";
import { makeStyles, useTheme } from "../../theme";

type Bucket = {
  key: string;
  label: string;
  icon: any;
  color: string;
  items: MediaItem[];
};

function detectDuplicates(list: MediaItem[]): MediaItem[] {
  // Exact duplicate by filename + size heuristic.
  const seen = new Map<string, MediaItem>();
  const dups: MediaItem[] = [];
  for (const m of list) {
    const k = `${m.filename}|${m.fileSize}`;
    const prev = seen.get(k);
    if (prev) dups.push(m);
    else seen.set(k, m);
  }
  return dups;
}

export default function SmartScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { state } = useApp();

  const totals = useMemo(() => {
    const total = state.media.reduce((a, m) => a + m.fileSize, 0);
    const photos = state.media.filter((m) => m.mediaType === "photo").reduce((a, m) => a + m.fileSize, 0);
    const videos = state.media.filter((m) => m.mediaType === "video").reduce((a, m) => a + m.fileSize, 0);
    return { total, photos, videos };
  }, [state.media]);

  const buckets: Bucket[] = useMemo(() => {
    const now = Date.now();
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const photos = state.media.filter((m) => m.mediaType === "photo");
    const videos = state.media.filter((m) => m.mediaType === "video");
    return [
      {
        key: "dup-photos",
        label: "Duplicate photos",
        icon: "copy",
        color: colors.brandPrimary,
        items: detectDuplicates(photos),
      },
      {
        key: "dup-videos",
        label: "Duplicate videos",
        icon: "copy-outline",
        color: colors.brandSecondary,
        items: detectDuplicates(videos),
      },
      {
        key: "similar",
        label: "Similar photos",
        icon: "images",
        color: colors.info,
        items: [], // placeholder; requires perceptual hashing (native)
      },
      {
        key: "screenshots",
        label: "Screenshots",
        icon: "phone-portrait",
        color: colors.warning,
        items: state.media.filter((m) => m.filename.toLowerCase().includes("screenshot")),
      },
      {
        key: "large-photos",
        label: "Large photos",
        icon: "expand",
        color: colors.success,
        items: photos.filter((m) => m.fileSize > 5_000_000),
      },
      {
        key: "large-videos",
        label: "Large videos",
        icon: "film",
        color: colors.error,
        items: videos.filter((m) => m.fileSize > 50_000_000),
      },
      {
        key: "old",
        label: "Old photos",
        icon: "time",
        color: colors.muted,
        items: state.media.filter((m) => now - m.creationTime > oneYearMs),
      },
      {
        key: "recent",
        label: "Recently added",
        icon: "sparkles",
        color: colors.brandPrimary,
        items: state.media.filter((m) => now - m.creationTime < thirtyDaysMs),
      },
      {
        key: "blurry",
        label: "Blurry photos",
        icon: "eye-off",
        color: colors.muted,
        items: [], // placeholder; needs on-device ML
      },
    ];
  }, [state.media, colors]);

  const potentialSavings = useMemo(() => {
    const dedupBytes = [...buckets.find((b) => b.key === "dup-photos")!.items, ...buckets.find((b) => b.key === "dup-videos")!.items]
      .reduce((a, m) => a + m.fileSize, 0);
    return dedupBytes;
  }, [buckets]);

  const photosPct = totals.total > 0 ? (totals.photos / totals.total) * 100 : 0;
  const videosPct = totals.total > 0 ? (totals.videos / totals.total) * 100 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="smart-screen">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Smart Clean</Text>

        {/* Storage analytics */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Storage overview</Text>
          <Text style={styles.storageBig}>{formatBytes(totals.total)}</Text>
          <Text style={styles.storageSub}>across {state.media.length} items</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${photosPct}%`, backgroundColor: colors.brandPrimary }]} />
            <View style={[styles.barFill, { width: `${videosPct}%`, backgroundColor: colors.brandSecondary }]} />
          </View>
          <View style={styles.legendRow}>
            <Legend color={colors.brandPrimary} label="Photos" value={formatBytes(totals.photos)} />
            <Legend color={colors.brandSecondary} label="Videos" value={formatBytes(totals.videos)} />
          </View>
          {potentialSavings > 0 && (
            <View style={[styles.savings, { backgroundColor: colors.brandTertiary }]}>
              <Ionicons name="sparkles" size={16} color={colors.onBrandTertiary} />
              <Text style={[styles.savingsText, { color: colors.onBrandTertiary }]}>
                Free up ~{formatBytes(potentialSavings)}
              </Text>
            </View>
          )}
        </View>

        {/* Category grid */}
        <Text style={styles.sectionLabel}>Cleanup categories</Text>
        <View style={styles.grid}>
          {buckets.map((b) => (
            <View key={b.key} style={styles.tile} testID={`bucket-${b.key}`}>
              <View style={[styles.tileIcon, { backgroundColor: b.color + "20" }]}>
                <Ionicons name={b.icon} size={22} color={b.color} />
              </View>
              <Text style={styles.tileLabel}>{b.label}</Text>
              <Text style={styles.tileCount}>{b.items.length} items</Text>
              <Text style={styles.tileSize}>
                {formatBytes(b.items.reduce((a, m) => a + m.fileSize, 0))}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
      <Text style={styles.legendValue}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  title: { fontSize: 28, fontWeight: "800", color: c.onSurface, marginTop: 8, marginBottom: 16 },
  card: {
    backgroundColor: c.surfaceSecondary,
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
  },
  cardTitle: { fontSize: 13, fontWeight: "700", color: c.muted, textTransform: "uppercase" },
  storageBig: { fontSize: 34, fontWeight: "800", color: c.onSurface, marginTop: 6 },
  storageSub: { fontSize: 13, color: c.muted, marginBottom: 12 },
  barTrack: {
    flexDirection: "row",
    height: 10,
    backgroundColor: c.surfaceTertiary,
    borderRadius: 5,
    overflow: "hidden",
  },
  barFill: { height: "100%" },
  legendRow: { flexDirection: "row", gap: 16, marginTop: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 13, color: c.muted },
  legendValue: { fontSize: 13, fontWeight: "700", color: c.onSurface },
  savings: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  savingsText: { fontSize: 13, fontWeight: "700" },
  sectionLabel: { fontSize: 13, fontWeight: "700", color: c.muted, textTransform: "uppercase", marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: {
    width: "48%",
    backgroundColor: c.surfaceSecondary,
    borderRadius: 16,
    padding: 14,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  tileLabel: { fontSize: 14, fontWeight: "700", color: c.onSurface },
  tileCount: { fontSize: 12, color: c.muted, marginTop: 2 },
  tileSize: { fontSize: 13, fontWeight: "700", color: c.brandPrimary, marginTop: 4 },
}));
