// SwipeClean iOS-Native Clean theme tokens.
// Light + dark, follows system by default.

import { useMemo } from "react";
import {
  Appearance,
  StyleSheet,
  useColorScheme,
} from "react-native";

export type AppColorScheme = "light" | "dark";

const light = {
  surface: "#FFFFFF",
  onSurface: "#000000",
  surfaceSecondary: "#F2F2F7",
  onSurfaceSecondary: "#000000",
  surfaceTertiary: "#E5E5EA",
  onSurfaceTertiary: "#000000",
  surfaceInverse: "#1C1C1E",
  onSurfaceInverse: "#FFFFFF",
  muted: "#8E8E93",

  brand: "#007AFF",
  onBrand: "#FFFFFF",
  brandPrimary: "#007AFF",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#5AC8FA",
  onBrandSecondary: "#000000",
  brandTertiary: "#E5F1FF",
  onBrandTertiary: "#007AFF",

  success: "#34C759",
  onSuccess: "#FFFFFF",
  warning: "#FFCC00",
  onWarning: "#000000",
  error: "#FF3B30",
  onError: "#FFFFFF",
  info: "#007AFF",
  onInfo: "#FFFFFF",

  border: "#C6C6C8",
  borderStrong: "#8E8E93",
  divider: "#E5E5EA",
};

const dark: typeof light = {
  surface: "#000000",
  onSurface: "#FFFFFF",
  surfaceSecondary: "#1C1C1E",
  onSurfaceSecondary: "#FFFFFF",
  surfaceTertiary: "#2C2C2E",
  onSurfaceTertiary: "#FFFFFF",
  surfaceInverse: "#F2F2F7",
  onSurfaceInverse: "#000000",
  muted: "#8E8E93",

  brand: "#0A84FF",
  onBrand: "#FFFFFF",
  brandPrimary: "#0A84FF",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#64D2FF",
  onBrandSecondary: "#000000",
  brandTertiary: "#0A2540",
  onBrandTertiary: "#64D2FF",

  success: "#30D158",
  onSuccess: "#FFFFFF",
  warning: "#FFD60A",
  onWarning: "#000000",
  error: "#FF453A",
  onError: "#FFFFFF",
  info: "#0A84FF",
  onInfo: "#FFFFFF",

  border: "#38383A",
  borderStrong: "#48484A",
  divider: "#2C2C2E",
};

export type ThemeColors = typeof light;

export const defaultScheme: AppColorScheme = "light";

/*
 * Make both themes required.
 * This prevents undefined/indexing TypeScript errors.
 */
export const themes: Record<AppColorScheme, ThemeColors> = {
  light,
  dark,
};

/*
 * React Native's setColorScheme does not accept null
 * in some versions/types.
 *
 * Use "unspecified" to return to following the system.
 */
export function setColorScheme(
  scheme: AppColorScheme | "unspecified",
) {
  Appearance.setColorScheme?.(scheme);
}

/*
 * Follow the system by default.
 */
setColorScheme("unspecified");

export function useTheme(): {
  scheme: AppColorScheme;
  colors: ThemeColors;
} {
  const systemScheme = useColorScheme();

  /*
   * React Native may return:
   * "light"
   * "dark"
   * null
   * "unspecified" (depending on version)
   *
   * Only accept light/dark for our theme object.
   */
  const scheme: AppColorScheme =
    systemScheme === "dark" || systemScheme === "light"
      ? systemScheme
      : defaultScheme;

  return {
    scheme,
    colors: themes[scheme],
  };
}

export function makeStyles<
  T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>
>(
  factory: (colors: ThemeColors) => T,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();

    return useMemo(
      () => StyleSheet.create(factory(colors)),
      [colors],
    );
  };
}

export const colors = light;