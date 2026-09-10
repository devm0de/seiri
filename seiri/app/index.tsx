import { Redirect } from "expo-router";
import { router } from "expo-router";

// router.replace("/(tabs)/index");
export default function Index() {
  router.replace("/(tabs)");

  // return <Redirect href="/(tabs)" />;
}