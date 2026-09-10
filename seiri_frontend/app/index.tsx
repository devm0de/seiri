import { Redirect } from "expo-router";
import { router } from "expo-router";

export default function Index() {
  // router.replace("/(tabs)");

  return <Redirect href="/(tabs)" />;
}