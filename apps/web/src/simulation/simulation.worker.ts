import { SimController } from "./controller";
import type { FromWorker, ToWorker } from "./protocol";

/** The parts of the worker's global scope this file uses, typed with our messages. */
interface WorkerScope {
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
  postMessage(message: FromWorker): void;
}
// The app's TypeScript settings describe a page (DOM), not a worker, so `self` is typed by hand.
const scope = self as unknown as WorkerScope;

/** How often the simulation advances, in wall-clock milliseconds (about 60 times a second). */
const TICK_MS = 16;

const controller = new SimController(
  () => performance.now(),
  (message) => scope.postMessage(message),
);
scope.onmessage = (event) => controller.handle(event.data);
setInterval(() => controller.tick(), TICK_MS);
