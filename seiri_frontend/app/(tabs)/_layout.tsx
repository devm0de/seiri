import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform } from "react-native";

import { useTheme } from "../../theme";

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.divider,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="clean"
        options={{
          title: "Clean",
          tabBarIcon: ({ color, size }) => <Ionicons name="sparkles" size={size} color={color} />,
          tabBarButtonTestID: "tab-clean",
        }}
      />
      <Tabs.Screen
        name="smart"
        options={{
          title: "Smart",
          tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} />,
          tabBarButtonTestID: "tab-smart",
        }}
      />
      <Tabs.Screen
        name="albums"
        options={{
          title: "Albums",
          tabBarIcon: ({ color, size }) => <Ionicons name="albums" size={size} color={color} />,
          tabBarButtonTestID: "tab-albums",
        }}
      />
      <Tabs.Screen
        name="trash"
        options={{
          title: "Deleted",
          tabBarIcon: ({ color, size }) => <Ionicons name="trash" size={size} color={color} />,
          tabBarButtonTestID: "tab-trash",
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} />,
          tabBarButtonTestID: "tab-settings",
        }}
      />
    </Tabs>
  );
}
