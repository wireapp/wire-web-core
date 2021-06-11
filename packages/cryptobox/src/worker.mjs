import { parentPort } from "worker_threads";
import * as Comlink from "comlink";
import nodeEndpoint from "comlink/dist/esm/node-adapter.mjs";

const api = {
  doMath() {
    return 4;
  }
};

Comlink.expose(api, nodeEndpoint(parentPort));
