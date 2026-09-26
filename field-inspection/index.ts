import { registerRootComponent } from "expo";

// Defines the background task at module scope. It must run before the OS can
// launch the app headless for a background window.
import "./src/sync/background";
import App from "./App";

registerRootComponent(App);
