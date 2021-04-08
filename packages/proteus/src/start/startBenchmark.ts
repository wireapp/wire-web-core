import {IdentityKeyPair, PreKey, PreKeyBundle} from '../keys';
import {performance, PerformanceObserver} from 'perf_hooks';
import {Session} from '../session';
import {init} from '@wireapp/proteus';

async function main() {
  await init();

  const amountOfUsers = 500;
  const clientsPerUser = 8;
  const amountOfRemoteIdentities = amountOfUsers * clientsPerUser;

  function generatePreKeyBundle(): PreKeyBundle {
    const identity = IdentityKeyPair.new();
    const preKey = PreKey.last_resort();
    return new PreKeyBundle(identity.public_key, preKey);
  }

  const observer = new PerformanceObserver(items => items.getEntries().forEach(entry => console.info(entry)));
  observer.observe({buffered: true, entryTypes: ['measure', 'function']});

  performance.mark('bundlesStart');
  const preKeyBundles = Array.from({length: amountOfRemoteIdentities}, generatePreKeyBundle);
  performance.mark('bundlesStop');
  performance.measure(`Generating "${preKeyBundles.length}" pre-key bundles`, 'bundlesStart', 'bundlesStop');

  const ownIdentity = IdentityKeyPair.new();
  performance.mark('sessionsStart');
  const sessions = preKeyBundles.map(pkb => Session.init_from_prekey(ownIdentity, pkb));
  performance.mark('sessionsStop');
  performance.measure(`Initializing "${sessions.length}" sessions`, 'sessionsStart', 'sessionsStop');

  performance.mark('encryptStart');
  const encryptions = await Promise.all(sessions.map(session => session.encrypt('Hello, World!')));
  performance.mark('encryptStop');
  performance.measure(`Encrypting "${encryptions.length}" texts`, 'encryptStart', 'encryptStop');
}

main().catch(console.error);
