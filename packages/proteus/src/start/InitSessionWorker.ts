import {parentPort, workerData} from 'worker_threads';
import {Session} from '../session';
import {IdentityKeyPair, PreKeyBundle} from '../keys';
import {init} from '../index';

async function createSession({
  ownIdentity,
  preKeyBundles,
}: {
  ownIdentity: ArrayBuffer;
  preKeyBundles: ArrayBuffer[];
}): Promise<ArrayBuffer[]> {
  await init();
  const alice = IdentityKeyPair.deserialise(ownIdentity);
  return preKeyBundles.map(pkb => Session.init_from_prekey(alice, PreKeyBundle.deserialise(pkb)).serialise());
}

void (async () => {
  parentPort?.postMessage(await createSession(workerData));
})();
