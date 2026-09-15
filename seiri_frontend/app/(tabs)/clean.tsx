import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MediaItem, requestPermission } from "@/services/media";
import { formatBytes, useApp } from "../../store/AppContext";
import { makeStyles, useTheme } from "../../theme";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const SWIPE_X = SCREEN_W * 0.28;
const SWIPE_Y = SCREEN_H * 0.15;

type Decision = "delete" | "keep" | "organize";

function haptic(kind: Decision | "undo") {
  if (Platform.OS === "web") return;
  try {
    if (kind === "delete") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else if (kind === "organize") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else if (kind === "keep") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else Haptics.selectionAsync();
  } catch {}
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ────────────────────────────────────────────────────────────────
// Swipe card
// ────────────────────────────────────────────────────────────────
type CardProps = {
  media: MediaItem;
  isTop: boolean;
  onSwipe: (d: Decision) => void;
  onOpenInfo: () => void;
  gesturesEnabled: boolean;
};

function Card({ media, isTop, onSwipe, onOpenInfo, gesturesEnabled }: CardProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(isTop ? 1 : 0.94);
  const zoom = useSharedValue(1);
  const zoomActive = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(isTop ? 1 : 0.94, { damping: 18 });
  }, [isTop, scale]);

  const player = useVideoPlayer(
    media.mediaType === "video" && !media.isDemo ? media.uri : null,
    (p) => {
      p.loop = true;
      if (isTop) p.play();
    },
  );

  const flyOff = useCallback(
    (dir: Decision) => {
      const toX = dir === "delete" ? -SCREEN_W * 1.4 : dir === "keep" ? SCREEN_W * 1.4 : 0;
      const toY = dir === "organize" ? -SCREEN_H : 0;
      tx.value = withTiming(toX, { duration: 220 });
      ty.value = withTiming(toY, { duration: 220 }, () => {
        runOnJS(onSwipe)(dir);
      });
    },
    [tx, ty, onSwipe],
  );

  // Programmatic button-triggered swipe (exposed via imperative call below).
  const triggerFromButton = useCallback(
    (dir: Decision) => {
      haptic(dir);
      flyOff(dir);
    },
    [flyOff],
  );

  // Attach a ref-like handle so parent can call this. We use a module-level
  // registry keyed by media id.
  useEffect(() => {
    if (!isTop) return;
    topCardTrigger = triggerFromButton;
    return () => {
      if (topCardTrigger === triggerFromButton) topCardTrigger = null;
    };
  }, [isTop, triggerFromButton]);

  const pan = Gesture.Pan()
    .enabled(gesturesEnabled && isTop)
    .onUpdate((e) => {
      if (zoomActive.value > 0) return;
      tx.value = e.translationX;
      ty.value = e.translationY;
    })
    .onEnd((e) => {
      const absX = Math.abs(e.translationX);
      const absY = Math.abs(e.translationY);
      if (e.translationY < -SWIPE_Y && absY > absX) {
        runOnJS(haptic)("organize");
        tx.value = withTiming(0);
        ty.value = withTiming(-SCREEN_H, { duration: 220 }, () => runOnJS(onSwipe)("organize"));
      } else if (e.translationX < -SWIPE_X) {
        runOnJS(haptic)("delete");
        ty.value = withTiming(0);
        tx.value = withTiming(-SCREEN_W * 1.4, { duration: 220 }, () => runOnJS(onSwipe)("delete"));
      } else if (e.translationX > SWIPE_X) {
        runOnJS(haptic)("keep");
        ty.value = withTiming(0);
        tx.value = withTiming(SCREEN_W * 1.4, { duration: 220 }, () => runOnJS(onSwipe)("keep"));
      } else {
        tx.value = withSpring(0);
        ty.value = withSpring(0);
      }
    });

  const pinch = Gesture.Pinch()
    .enabled(isTop)
    .onStart(() => {
      zoomActive.value = 1;
    })
    .onUpdate((e) => {
      zoom.value = Math.max(1, Math.min(4, e.scale));
    })
    .onEnd(() => {
      zoom.value = withSpring(1);
      zoomActive.value = 0;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .enabled(isTop)
    .onEnd(() => {
      zoom.value = withSpring(zoom.value > 1.1 ? 1 : 2.2);
    });

  const composed = Gesture.Simultaneous(pan, Gesture.Simultaneous(pinch, doubleTap));

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${interpolate(tx.value, [-SCREEN_W, 0, SCREEN_W], [-15, 0, 15])}deg` },
      { scale: scale.value },
    ],
  }));

  const imgStyle = useAnimatedStyle(() => ({
    transform: [{ scale: zoom.value }],
  }));

  const keepBadge = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [0, SWIPE_X], [0, 1], Extrapolation.CLAMP),
  }));
  const trashBadge = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [-SWIPE_X, 0], [1, 0], Extrapolation.CLAMP),
  }));
  const orgBadge = useAnimatedStyle(() => ({
    opacity: interpolate(ty.value, [-SWIPE_Y, 0], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.card, cardStyle]} testID={isTop ? "swipe-card-top" : undefined}>
        <Animated.View style={[styles.mediaWrap, imgStyle]}>
          {media.mediaType === "video" && !media.isDemo ? (
            <VideoView
              player={player}
              style={styles.media}
              contentFit="cover"
              nativeControls={false}
            />
          ) : (
            <Image
              source={{ uri: media.uri }}
              style={styles.media}
              contentFit="cover"
              transition={150}
              cachePolicy="memory-disk"
            />
          )}
        </Animated.View>

        {/* Bottom gradient scrim for legibility */}
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.5)", "rgba(0,0,0,0.85)"]}
          style={styles.scrimBottom}
          pointerEvents="none"
        />
        {/* Top gradient */}
        <LinearGradient
          colors={["rgba(0,0,0,0.6)", "rgba(0,0,0,0)"]}
          style={styles.scrimTop}
          pointerEvents="none"
        />

        {/* Info pill */}
        <Pressable
          onPress={onOpenInfo}
          style={styles.infoPill}
          testID={isTop ? "media-info-pill" : undefined}
        >
          <Ionicons name="information-circle-outline" size={16} color="#FFF" />
          <Text style={styles.infoPillText}>
            {formatDate(media.creationTime)} · {formatBytes(media.fileSize)}
          </Text>
        </Pressable>

        {/* Badge overlays */}
        <Animated.View style={[styles.badge, styles.badgeKeep, keepBadge]}>
          <Text style={styles.badgeText}>KEEP</Text>
        </Animated.View>
        <Animated.View style={[styles.badge, styles.badgeTrash, trashBadge]}>
          <Text style={styles.badgeText}>DELETE</Text>
        </Animated.View>
        <Animated.View style={[styles.badge, styles.badgeOrg, orgBadge]}>
          <Text style={styles.badgeText}>ORGANIZE</Text>
        </Animated.View>

        {media.mediaType === "video" && (
          <View style={styles.videoBadge}>
            <Ionicons name="videocam" size={14} color="#FFF" />
            <Text style={styles.videoBadgeText}>
              {media.duration > 0 ? `${Math.round(media.duration)}s` : "Video"}
            </Text>
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

// Module-level trigger for the currently-top card, used by action buttons.
let topCardTrigger: ((d: Decision) => void) | null = null;

// ────────────────────────────────────────────────────────────────
// Screen
// ────────────────────────────────────────────────────────────────
export default function CleanScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const app = useApp();
  const {
    state,
    currentMedia,
    progress,
    swipeDelete,
    swipeKeep,
    organize,
    undo,
    redo,
    reloadMedia,
    setPermission,
    createAlbum,
    patchSettings,
    duplicateMedia,
  } = app;

  const [organizeFor, setOrganizeFor] = useState<MediaItem | null>(null);
  const [infoFor, setInfoFor] = useState<MediaItem | null>(null);
  const [newAlbumInput, setNewAlbumInput] = useState("");
  const [duplicating, setDuplicating] = useState(false);

  // Ask permission on first entry (native only).
  const askedRef = useRef(false);
  useEffect(() => {
    if (askedRef.current) return;
    askedRef.current = true;
    (async () => {
      const p = await requestPermission();
      setPermission(p);
      if (p === "granted") await reloadMedia();
    })();
  }, [reloadMedia, setPermission]);

  const handleSwipe = useCallback(
    (media: MediaItem, d: Decision) => {
      if (d === "delete") swipeDelete(media);
      else if (d === "keep") {
        if (state.settings.askOrganizeOnKeep) {
          setOrganizeFor(media);
          // We still record it as "keep" so cursor advances via the action.
          swipeKeep(media);
        } else {
          swipeKeep(media);
        }
      } else {
        setOrganizeFor(media);
        // Do not advance cursor yet; wait for album pick or skip.
      }
    },
    [state.settings.askOrganizeOnKeep, swipeDelete, swipeKeep],
  );

  const next = state.media[state.cursor + 1];

  const done = state.ready && state.media.length > 0 && state.cursor >= state.media.length;
  const empty = state.ready && state.media.length === 0;

  const undoDisabled = state.undoStack.length === 0;
  const redoDisabled = state.redoStack.length === 0;

  const handleDuplicate = useCallback(
    async (media: MediaItem) => {
      setDuplicating(true);
      const copy = await duplicateMedia(media);
      setDuplicating(false);
      if (copy) haptic("keep");
    },
    [duplicateMedia],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="clean-screen">
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>SwipeClean</Text>
          <Text style={styles.headerSub}>
            {state.media.length > 0
              ? `${progress.index} of ${progress.total}`
              : "Loading gallery"}
          </Text>
        </View>
        <View style={styles.headerBadge}>
          <Ionicons name="trash-outline" size={14} color={colors.error} />
          <Text style={[styles.headerBadgeText, { color: colors.error }]} testID="trash-count">
            {state.trash.length}
          </Text>
        </View>
      </View>

      {/* Card stack */}
      <View style={styles.stack}>
        {!state.ready && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brandPrimary} size="large" />
            <Text style={styles.centerText}>Analyzing gallery…</Text>
          </View>
        )}
        {state.ready && empty && (
          <View style={styles.center}>
            <Ionicons name="images-outline" size={56} color={colors.muted} />
            <Text style={styles.centerText}>No media found</Text>
            <Text style={styles.centerSub}>
              Grant photo access to review your gallery.
            </Text>
          </View>
        )}
        {state.ready && done && (
          <View style={styles.center} testID="clean-done">
            <Ionicons name="checkmark-circle" size={72} color={colors.success} />
            <Text style={styles.centerText}>All caught up</Text>
            <Text style={styles.centerSub}>
              You reviewed every item. Restart to review again.
            </Text>
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: colors.brandPrimary }]}
              onPress={() => app.setCursor(0)}
              testID="restart-btn"
            >
              <Text style={{ color: colors.onBrandPrimary, fontWeight: "700" }}>
                Restart review
              </Text>
            </Pressable>
          </View>
        )}
        {next && (
          <Card
            key={next.id + "-next"}
            media={next}
            isTop={false}
            onSwipe={() => {}}
            onOpenInfo={() => {}}
            gesturesEnabled={false}
          />
        )}
        {currentMedia && (
          <Card
            key={currentMedia.id}
            media={currentMedia}
            isTop
            onSwipe={(d) => handleSwipe(currentMedia, d)}
            onOpenInfo={() => setInfoFor(currentMedia)}
            gesturesEnabled={state.settings.gesturesEnabled}
          />
        )}
      </View>

      {/* Action bar */}
      <View style={[styles.actionBar, { paddingBottom: insets.bottom > 0 ? 8 : 16 }]}>
        <ActionBtn
          icon="arrow-undo"
          disabled={undoDisabled}
          onPress={() => {
            haptic("undo");
            undo();
          }}
          testID="undo-btn"
          small
        />
        <ActionBtn
          icon="trash"
          onPress={() => topCardTrigger?.("delete")}
          bg={colors.error}
          fg="#FFF"
          disabled={!currentMedia}
          testID="delete-btn"
        />
        <ActionBtn
          icon="folder"
          onPress={() => topCardTrigger?.("organize")}
          bg={colors.brandPrimary}
          fg="#FFF"
          disabled={!currentMedia}
          testID="organize-btn"
        />
        <ActionBtn
          icon="heart"
          onPress={() => topCardTrigger?.("keep")}
          bg={colors.success}
          fg="#FFF"
          disabled={!currentMedia}
          testID="keep-btn"
        />
        <ActionBtn
          icon="arrow-redo"
          disabled={redoDisabled}
          onPress={() => {
            haptic("undo");
            redo();
          }}
          testID="redo-btn"
          small
        />
      </View>

      {/* Organize sheet */}
      {organizeFor && (
        <OrganizeSheet
          onClose={() => setOrganizeFor(null)}
          onKeepHere={() => setOrganizeFor(null)}
          onSkip={() => {
            patchSettings({ askOrganizeOnKeep: false });
            setOrganizeFor(null);
          }}
          onPickAlbum={(id) => {
            organize(organizeFor, id);
            setOrganizeFor(null);
          }}
          onCreateAndPick={(name) => {
            const a = createAlbum(name);
            organize(organizeFor, a.id);
            setOrganizeFor(null);
            setNewAlbumInput("");
          }}
          input={newAlbumInput}
          setInput={setNewAlbumInput}
        />
      )}

      {/* Info sheet */}
      {infoFor && (
        <InfoSheet
          media={infoFor}
          onClose={() => setInfoFor(null)}
          onDuplicate={() => handleDuplicate(infoFor)}
          duplicating={duplicating}
        />
      )}
    </View>
  );
}

function ActionBtn({
  icon,
  onPress,
  bg,
  fg,
  disabled,
  small,
  testID,
}: {
  icon: any;
  onPress: () => void;
  bg?: string;
  fg?: string;
  disabled?: boolean;
  small?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  const size = small ? 48 : 64;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg ?? colors.surfaceSecondary,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: bg ? 0 : 1,
          borderColor: colors.border,
          opacity: disabled ? 0.35 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={small ? 22 : 28} color={fg ?? colors.onSurface} />
    </Pressable>
  );
}

// ────────────────────────────────────────────────────────────────
// Organize sheet
// ────────────────────────────────────────────────────────────────
function OrganizeSheet({
  onClose,
  onKeepHere,
  onSkip,
  onPickAlbum,
  onCreateAndPick,
  input,
  setInput,
}: {
  onClose: () => void;
  onKeepHere: () => void;
  onSkip: () => void;
  onPickAlbum: (id: string) => void;
  onCreateAndPick: (name: string) => void;
  input: string;
  setInput: (v: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { state } = useApp();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.sheetOverlay} testID="organize-sheet">
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>What would you like to do?</Text>

        <Pressable style={styles.sheetRow} onPress={onKeepHere} testID="keep-here-btn">
          <Ionicons name="checkmark-circle" size={22} color={colors.success} />
          <Text style={styles.sheetRowText}>Keep in current location</Text>
        </Pressable>

        {state.albums.length > 0 && (
          <>
            <Text style={styles.sheetSection}>Move to album</Text>
            {state.albums.map((a) => (
              <Pressable
                key={a.id}
                style={styles.sheetRow}
                onPress={() => onPickAlbum(a.id)}
                testID={`album-pick-${a.id}`}
              >
                <Ionicons name="folder" size={22} color={colors.brandPrimary} />
                <Text style={styles.sheetRowText}>{a.name}</Text>
                <Text style={styles.sheetRowMeta}>{a.count}</Text>
              </Pressable>
            ))}
          </>
        )}

        <Text style={styles.sheetSection}>Create new album</Text>
        <View style={styles.sheetInputRow}>
          <TextInput
            style={styles.sheetInput}
            placeholder="Album name"
            placeholderTextColor={colors.muted}
            value={input}
            onChangeText={setInput}
            testID="new-album-input"
          />
          <Pressable
            disabled={!input.trim()}
            onPress={() => onCreateAndPick(input.trim())}
            style={[
              styles.sheetInputBtn,
              { backgroundColor: input.trim() ? colors.brandPrimary : colors.surfaceTertiary },
            ]}
            testID="create-album-and-move-btn"
          >
            <Ionicons
              name="add"
              size={22}
              color={input.trim() ? "#FFF" : colors.muted}
            />
          </Pressable>
        </View>

        <Pressable style={styles.sheetSkip} onPress={onSkip} testID="skip-organize-btn">
          <Text style={{ color: colors.muted }}>Don't ask again</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────
// Info sheet
// ────────────────────────────────────────────────────────────────
function InfoSheet({
  media,
  onClose,
  onDuplicate,
  duplicating,
}: {
  media: MediaItem;
  onClose: () => void;
  onDuplicate?: () => void;
  duplicating?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const rows = [
    ["File", media.filename],
    ["Type", media.mediaType === "video" ? "Video" : "Photo"],
    ["Size", formatBytes(media.fileSize)],
    ["Resolution", `${media.width} × ${media.height}`],
    ["Created", formatDate(media.creationTime)],
    ...(media.mediaType === "video" ? [["Duration", `${Math.round(media.duration)}s`]] : []),
    ...(media.isScreenshot ? [["Screenshot", "Yes"]] : []),
  ];
  return (
    <View style={styles.sheetOverlay} testID="info-sheet">
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Media info</Text>
        {rows.map(([k, v]) => (
          <View key={k} style={styles.infoRow}>
            <Text style={styles.infoKey}>{k}</Text>
            <Text style={styles.infoVal}>{v}</Text>
          </View>
        ))}
        {onDuplicate && !media.isDemo && (
          <Pressable
            style={[styles.dupBtn, { backgroundColor: colors.brandPrimary, opacity: duplicating ? 0.6 : 1 }]}
            onPress={onDuplicate}
            disabled={duplicating}
            testID="duplicate-media-btn"
          >
            <Ionicons name="copy" size={18} color={colors.onBrandPrimary} />
            <Text style={{ color: colors.onBrandPrimary, fontWeight: "700" }}>
              {duplicating ? "Duplicating…" : "Duplicate to gallery"}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────────
const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 24, fontWeight: "800", color: c.onSurface },
  headerSub: { fontSize: 13, color: c.muted, marginTop: 2 },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: c.surfaceSecondary,
  },
  headerBadgeText: { fontSize: 13, fontWeight: "700" },

  stack: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },

  card: {
    position: "absolute",
    width: SCREEN_W - 24,
    aspectRatio: 3 / 4,
    borderRadius: 24,
    backgroundColor: c.surfaceSecondary,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  mediaWrap: { ...({ position: "absolute" } as any), inset: 0 as any, width: "100%", height: "100%" },
  media: { width: "100%", height: "100%" },

  scrimBottom: { position: "absolute", left: 0, right: 0, bottom: 0, height: 140 },
  scrimTop: { position: "absolute", left: 0, right: 0, top: 0, height: 80 },

  infoPill: {
    position: "absolute",
    top: 16,
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  infoPillText: { color: "#FFF", fontSize: 12, fontWeight: "600" },

  badge: {
    position: "absolute",
    top: 24,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 3,
  },
  badgeKeep: { right: 24, borderColor: "#34C759", backgroundColor: "rgba(52,199,89,0.15)" },
  badgeTrash: { left: 24, borderColor: "#FF3B30", backgroundColor: "rgba(255,59,48,0.15)" },
  badgeOrg: {
    alignSelf: "center",
    top: 100,
    borderColor: "#007AFF",
    backgroundColor: "rgba(0,122,255,0.15)",
  },
  badgeText: { color: "#FFF", fontWeight: "900", fontSize: 18, letterSpacing: 1 },

  videoBadge: {
    position: "absolute",
    bottom: 16,
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  videoBadgeText: { color: "#FFF", fontSize: 12, fontWeight: "700" },

  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 20,
    paddingTop: 12,
  },

  center: { alignItems: "center", justifyContent: "center", gap: 8 },
  centerText: { fontSize: 18, fontWeight: "700", color: c.onSurface, marginTop: 8 },
  centerSub: { fontSize: 14, color: c.muted, textAlign: "center", marginHorizontal: 32 },
  primaryBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 12 },

  sheetOverlay: {
    ...({ position: "absolute" } as any),
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-end",
  },
  sheetBackdrop: {
    ...({ position: "absolute" } as any),
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.borderStrong,
    alignSelf: "center",
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: c.onSurface, marginBottom: 12 },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  sheetRowText: { flex: 1, fontSize: 16, color: c.onSurface },
  sheetRowMeta: { fontSize: 13, color: c.muted },
  sheetSection: {
    fontSize: 12,
    fontWeight: "700",
    color: c.muted,
    textTransform: "uppercase",
    marginTop: 12,
    marginBottom: 6,
  },
  sheetInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sheetInput: {
    flex: 1,
    backgroundColor: c.surfaceSecondary,
    color: c.onSurface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  sheetInputBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetSkip: { alignItems: "center", marginTop: 16 },

  dupBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 16,
  },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  infoKey: { fontSize: 14, color: c.muted },
  infoVal: { fontSize: 14, color: c.onSurface, fontWeight: "600", maxWidth: "70%", textAlign: "right" },
}));
