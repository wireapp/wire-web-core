import {parentPort, workerData} from 'worker_threads';
import {Session} from '../session';
import {IdentityKeyPair, PreKeyBundle} from '../keys';
import {init} from '../index';

async function createSession({
  ownIdentity,
  preKeyBundles,
}: {
  ownIdentity: IdentityKeyPair;
  preKeyBundles: PreKeyBundle[];
}): Promise<Session[]> {
  await init();
  return preKeyBundles.map(pkb => Session.init_from_prekey(ownIdentity, pkb));
}

void (async () => {
  parentPort?.postMessage(await createSession(workerData));
})();
