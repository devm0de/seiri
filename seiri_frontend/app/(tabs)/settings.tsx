import { Ionicons } from "@expo/vector-icons";
import { ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AutoDeleteDays, ThemePref, useApp } from "../../store/AppContext";
import { makeStyles, useTheme } from "../../theme";

export default function SettingsScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { state, patchSettings, setCursor, reloadMedia } = useApp();
  const s = state.settings;

  const themeOptions: { key: ThemePref; label: string; icon: any }[] = [
    { key: "system", label: "System", icon: "phone-portrait" },
    { key: "light", label: "Light", icon: "sunny" },
    { key: "dark", label: "Dark", icon: "moon" },
  ];

  const autoDeleteOptions: { key: AutoDeleteDays; label: string }[] = [
    { key: 7, label: "7 days" },
    { key: 30, label: "30 days" },
    { key: 90, label: "90 days" },
    { key: 0, label: "Never" },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="settings-screen">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Settings</Text>

        <Section title="Appearance">
          <View style={styles.segRow}>
            {themeOptions.map((o) => {
              const active = s.themePref === o.key;
              return (
                <Row
                  key={o.key}
                  onPress={() => patchSettings({ themePref: o.key })}
                  testID={`theme-${o.key}`}
                >
                  <Ionicons name={o.icon} size={20} color={active ? colors.brandPrimary : colors.onSurface} />
                  <Text style={[styles.rowText, active && { color: colors.brandPrimary, fontWeight: "700" }]}>
                    {o.label}
                  </Text>
                  {active && <Ionicons name="checkmark" size={20} color={colors.brandPrimary} />}
                </Row>
              );
            })}
          </View>
        </Section>

        <Section title="Cleaning">
          <Row testID="ask-organize-row">
            <Ionicons name="folder" size={20} color={colors.brandPrimary} />
            <Text style={styles.rowText}>Ask to organize on keep</Text>
            <Switch
              value={s.askOrganizeOnKeep}
              onValueChange={(v) => patchSettings({ askOrganizeOnKeep: v })}
              testID="ask-organize-switch"
            />
          </Row>
          <Row testID="gestures-row">
            <Ionicons name="hand-left" size={20} color={colors.brandPrimary} />
            <Text style={styles.rowText}>Swipe gestures</Text>
            <Switch
              value={s.gesturesEnabled}
              onValueChange={(v) => patchSettings({ gesturesEnabled: v })}
              testID="gestures-switch"
            />
          </Row>
        </Section>

        <Section title="Auto-delete window">
          {autoDeleteOptions.map((o) => {
            const active = s.autoDeleteDays === o.key;
            return (
              <Row
                key={o.key}
                onPress={() => patchSettings({ autoDeleteDays: o.key })}
                testID={`auto-delete-${o.key}`}
              >
                <Ionicons
                  name="timer-outline"
                  size={20}
                  color={active ? colors.brandPrimary : colors.onSurface}
                />
                <Text style={[styles.rowText, active && { color: colors.brandPrimary, fontWeight: "700" }]}>
                  {o.label}
                </Text>
                {active && <Ionicons name="checkmark" size={20} color={colors.brandPrimary} />}
              </Row>
            );
          })}
        </Section>

        <Section title="Library">
          <Row
            onPress={() => {
              setCursor(0);
              reloadMedia();
            }}
            testID="rescan-row"
          >
            <Ionicons name="refresh" size={20} color={colors.brandPrimary} />
            <Text style={styles.rowText}>Rescan gallery</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Row>
          <Row testID="permission-row">
            <Ionicons name="lock-closed" size={20} color={colors.brandPrimary} />
            <Text style={styles.rowText}>Photo access</Text>
            <Text style={styles.rowMeta}>
              {state.permission === "granted"
                ? "Granted"
                : state.permission === "denied"
                ? "Denied"
                : state.permission === "unavailable"
                ? "Preview mode"
                : "Not asked"}
            </Text>
          </Row>
        </Section>

        <Section title="About">
          <Row testID="about-row">
            <Ionicons name="information-circle" size={20} color={colors.brandPrimary} />
            <Text style={styles.rowText}>SwipeClean</Text>
            <Text style={styles.rowMeta}>v1.0.0</Text>
          </Row>
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

function Row({
  children,
  onPress,
  testID,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  testID?: string;
}) {
  const styles = useStyles();
  const Comp = onPress ? require("react-native").Pressable : View;
  return (
    <Comp onPress={onPress} style={styles.row} testID={testID}>
      {children}
    </Comp>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surfaceSecondary },
  title: { fontSize: 28, fontWeight: "800", color: c.onSurface, marginTop: 8, marginBottom: 16 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: c.muted,
    textTransform: "uppercase",
    marginBottom: 8,
    marginLeft: 4,
  },
  group: {
    backgroundColor: c.surface,
    borderRadius: 14,
    overflow: "hidden",
  },
  segRow: { backgroundColor: c.surface, borderRadius: 14, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  rowText: { flex: 1, fontSize: 15, color: c.onSurface },
  rowMeta: { fontSize: 13, color: c.muted },
}));
