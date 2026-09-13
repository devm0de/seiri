import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/error-boundary";
import { queryClient } from "@/query-client";
import { AppProvider, useApp } from "../store/AppContext";
import { setColorScheme, useTheme } from "../theme";

LogBox.ignoreAllLogs(true);

// Applies user's theme preference. Rendered inside AppProvider.
function ThemeApplier() {
  const { state } = useApp();
  const pref = state.settings.themePref;

  useEffect(() => {
    if (pref === "system") {
      setColorScheme("unspecified");
    } else {
      setColorScheme(pref);
    }
  }, [pref]);

  return null;
}

function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === "dark" ? "light" : "dark"} />;
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <AppProvider>
              <ThemeApplier />
              <ThemedStatusBar />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="album/[id]" options={{ presentation: "card" }} />
              </Stack>
            </AppProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
