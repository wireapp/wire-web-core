import * as sodium from "libsodium-wrappers-sumo";

export function initProteus(): Promise<void> {
  return sodium.ready;
}