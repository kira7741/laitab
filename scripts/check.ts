import {
  binToHex,
  cashAddressToLockingBytecode,
  createVirtualMachineBCH,
  decodeTransaction,
  encodeCashAddress,
  encodeTransaction,
  hash160,
  hash256,
  hexToBin,
  instantiateSecp256k1,
} from '@bitauth/libauth';
import { applyEqualSplit, equalShares, fromSats, parseAmountToSats, subtotalSats, tipSats, toSats, totalSats } from '../src/lib/money.ts';
import { parseCashAddress } from '../src/lib/address.ts';
import { encryptSecret, decryptSecret } from '../src/lib/crypto-pass.ts';
import { generateP2pkh, keyFromWif } from '../src/lib/keys.ts';
import { buildP2pkhSend, explorerTxid, planP2pkhSend, planWalletPayment } from '../src/lib/sweep.ts';
import {
  CHIPNET_CHRONIK,
  CHIPNET_ESPLORA,
  MAINNET_CHRONIK,
  broadcastTx,
  chronikBases,
  fetchTransaction,
  fetchUtxos,
  parseBlockchairUtxos,
  parseChronikUtxos,
  parseEsploraUtxos,
  parseManualUtxos,
  setIndexerFetch,
  toUtxo,
  wireHashHex,
  type Utxo,
} from '../src/lib/indexer.ts';
import {
  chronikBytesFromDisplayTxid,
  decodeBroadcastTxResponse,
  decodeChronikTx,
  decodeScriptUtxos,
  displayTxidFromChronikBytes,
  encodeBroadcastTxRequest,
  encodeBroadcastTxResponse,
  encodeChronikError,
  encodeChronikTxFixture,
  encodeScriptUtxosFixture,
} from '../src/lib/chronik-proto.ts';
import {
  parseElectrumListUnspent,
  scriptHashFromAddress,
  setElectrumEnabled,
  setElectrumOpener,
} from '../src/lib/electrum.ts';
import { demoTab, DEMO_SUBTOTAL_SATS, DEMO_TOTAL_SATS } from '../src/lib/demo.ts';
import { decodeOpReturn, encodeOpReturn, encodePush, MAX_MEMO_BYTES, utf8Bytes, utf8Truncate } from '../src/lib/memo.ts';
import {
  acknowledgeOnTab,
  allocatedSatsForTxid,
  hasRecordedTxid,
  parsePaymentTxid,
  paymentLabel,
  recordAcknowledgement,
  verifyPaymentOnChain,
} from '../src/lib/payment.ts';
import { mergeClaimPacket } from '../src/lib/storage.ts';
import { payloadAfter } from '../src/lib/route.ts';
import type { LaiSeePacket } from '../src/lib/types.ts';
import { bannerIsComplete, contestBanner, setContestBanner } from '../src/lib/contest.ts';
import {
  buildWalletSignRequest,
  cashAddressFromPubkey,
  deriveReceiveAddress,
  requestWalletSignature,
  type WalletManagerView,
} from '../src/wallet/adapter.ts';
import type { Guest } from '../src/lib/types.ts';

type Result = { name: string; ok: boolean; detail?: string };

const results: Result[] = [];

// Unit tests must not open live WebSockets.
setElectrumEnabled(false);

function record(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  if (!ok) console.error(`FAIL ${name}${detail ? `: ${detail}` : ''}`);
}

function assert(name: string, cond: unknown, detail?: string) {
  record(name, Boolean(cond), cond ? undefined : detail ?? 'assertion failed');
}

function assertEq(name: string, actual: unknown, expected: unknown) {
  const ok = Object.is(actual, expected) || String(actual) === String(expected);
  record(name, ok, ok ? undefined : `expected ${expected}, got ${actual}`);
}

const DISPLAY_TXID = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const EXPECTED_WIRE = '1f1e1d1c1b1a191817161514131211100f0e0d0c0b0a09080706050403020100';
const PALINDROME_TXID = '11'.repeat(32);

const secp = await instantiateSecp256k1();
// Disposable synthetic key; NEVER FUND this fixture.
const privateKey = Uint8Array.from({ length: 32 }, () => 1);
const otherKey = Uint8Array.from({ length: 32 }, () => 2);

function addressFor(key: Uint8Array, prefix: 'bchtest' | 'bitcoincash' = 'bchtest') {
  const pub = secp.derivePublicKeyCompressed(key);
  if (typeof pub === 'string') throw new Error(pub);
  return encodeCashAddress({ prefix, type: 'p2pkh', payload: hash160(pub) }).address;
}

function lock(address: string) {
  const result = cashAddressToLockingBytecode(address);
  if (typeof result === 'string') throw new Error(result);
  return result.bytecode;
}

const source = addressFor(privateKey);
const destination = addressFor(otherKey);
const vm = createVirtualMachineBCH();

function coin(txid: string, vout: number, satoshis: bigint, address = source): Utxo {
  return { ...toUtxo(txid, vout, satoshis), lockingBytecode: lock(address) };
}

function wireOutpoint(hex: string): string {
  const tx = decodeTransaction(hexToBin(hex));
  if (typeof tx === 'string') throw new Error(tx);
  // version (4) + input count (1) = 5 bytes = 10 hex chars; next 32 bytes are the wire hash.
  return hex.slice(10, 74);
}

function sourceOutputs(utxos: Utxo[]) {
  return utxos.map((u) => ({ lockingBytecode: u.lockingBytecode ?? lock(source), valueSatoshis: u.satoshis }));
}

// --- Bill math (original checks) ---
{
  const sub = subtotalSats(demoTab().items);
  assertEq('demo-subtotal', sub, DEMO_SUBTOTAL_SATS);
  const tab = applyEqualSplit(demoTab());
  assertEq('demo-total', totalSats(tab), DEMO_TOTAL_SATS);
  assert(
    'demo-equal-shares',
    tab.guests.every((g) => g.shareSats === 2_337_500),
    tab.guests.map((g) => g.shareSats).join(','),
  );
  assertEq('tip-10-percent', tipSats(tab.items, 10), 850_000n);
  assertEq('fromSats-1', fromSats(100_000_000n), '1');
  assertEq('toSats-0.012', toSats('0.012'), 1_200_000n);
  assertEq('parse-0.01000000', parseAmountToSats('0.01000000'), 1_000_000n);
  assertEq('equal-remainder', equalShares(10n, 3).map(String).join(','), '4,3,3');
}

{
  const ok = parseCashAddress('bchtest:qzqxmu8z2c3tgtut8f5sw6t6fe92p87pccwre396hc', 'chipnet');
  assert('demo-address-parses', !('error' in ok));
  const badNet = parseCashAddress('bchtest:qzqxmu8z2c3tgtut8f5sw6t6fe92p87pccwre396hc', 'mainnet');
  assert('demo-address-rejects-mainnet', 'error' in badNet);
}

{
  const secret = await encryptSecret('hello-wif', 'prosperity');
  const plain = await decryptSecret(secret, 'prosperity');
  assertEq('passphrase-roundtrip', plain, 'hello-wif');
  try {
    await decryptSecret(secret, 'wrong');
    assert('passphrase-wrong-rejected', false, 'should have thrown');
  } catch (e) {
    assert('passphrase-wrong-rejected', e instanceof Error && e.message.includes('passphrase'), String(e));
  }
}

{
  const key = await generateP2pkh('chipnet');
  assert('generated-chipnet-prefix', key.address.startsWith('bchtest:'), key.address);
  const again = await keyFromWif(key.wif, 'chipnet');
  assertEq('wif-roundtrip', again.address, key.address);
}

// Palindrome fixture still works, but is not the endianness test.
{
  const utxos = parseManualUtxos(`${PALINDROME_TXID}:0:100000`);
  assert('manual-palindrome-parses', 'utxos' in utxos && 'utxos' in utxos && utxos.utxos[0]?.satoshis === 100000n);
  if ('utxos' in utxos) {
    const swept = buildP2pkhSend({ utxos: utxos.utxos.map((u) => ({ ...u, lockingBytecode: lock(source) })), privateKey, destination: source });
    assert('palindrome-sweep-hex', swept.hex.length > 200);
    assertEq('palindrome-txid-length', swept.txid.length, 64);
    assertEq('palindrome-value-conservation', swept.amount + swept.fee, 100000n);
    // A palindrome cannot detect a double reverse; only length/value are asserted here.
  }
}

// --- P0: outpoint byte order ---
{
  const parsed = parseManualUtxos(`${DISPLAY_TXID}:1:100000`);
  assert('non-palindromic-manual-parse', 'utxos' in parsed);
  if ('utxos' in parsed) {
    const u = parsed.utxos[0]!;
    assertEq('non-palindromic-display-txid', u.txid, DISPLAY_TXID);
    assertEq('libauth-hash-is-display-order', binToHex(u.outpointHash), DISPLAY_TXID);
    assertEq('wire-hash-is-reversed-display', wireHashHex(u), EXPECTED_WIRE);
    const swept = buildP2pkhSend({ utxos: [coin(DISPLAY_TXID, 1, 100000n)], privateKey, destination });
    assertEq('raw-input-outpoint-bytes', wireOutpoint(swept.hex), EXPECTED_WIRE);
    const tx = decodeTransaction(hexToBin(swept.hex));
    if (typeof tx === 'string') {
      assert('decode-signed-tx', false, tx);
    } else {
      assertEq('decoded-structured-hash-is-display-txid', binToHex(tx.inputs[0]!.outpointTransactionHash), DISPLAY_TXID);
      assertEq('reported-txid-matches-hash256', swept.txid, explorerTxid(hexToBin(swept.hex)));
      const verified = vm.verify({ transaction: tx, sourceOutputs: sourceOutputs([coin(DISPLAY_TXID, 1, 100000n)]) });
      assert('vm-verify-correct-outpoint', verified === true, String(verified));
    }
  }
}

{
  // Synthetic previous transaction: display txid is derived from a real hash256, not a hand-written palindrome.
  const prev = encodeTransaction({
    version: 1,
    locktime: 0,
    inputs: [
      {
        outpointIndex: 0,
        outpointTransactionHash: hexToBin('aa'.repeat(32)),
        sequenceNumber: 0xffffffff,
        unlockingBytecode: new Uint8Array(),
      },
    ],
    outputs: [{ lockingBytecode: lock(source), valueSatoshis: 50_000n }],
  });
  const prevDisplay = explorerTxid(prev);
  const prevWire = binToHex(hash256(prev));
  assert('synthetic-prev-txid-not-palindrome', prevDisplay !== [...prevDisplay].reverse().join(''));
  assertEq('synthetic-prev-wire-is-unreversed-hash256', prevWire, binToHex(hexToBin(prevDisplay).reverse()));
  const swept = buildP2pkhSend({ utxos: [coin(prevDisplay, 0, 50_000n)], privateKey, destination });
  assertEq('synthetic-prev-raw-outpoint', wireOutpoint(swept.hex), prevWire);
  const tx = decodeTransaction(hexToBin(swept.hex));
  if (typeof tx === 'string') assert('synthetic-prev-decode', false, tx);
  else {
    assertEq('synthetic-prev-decoded-hash', binToHex(tx.inputs[0]!.outpointTransactionHash), prevDisplay);
    assert('synthetic-prev-vm', vm.verify({ transaction: tx, sourceOutputs: sourceOutputs([coin(prevDisplay, 0, 50_000n)]) }) === true);
  }
}

// --- Memo / OP_RETURN ---
{
  assertEq('utf8-truncate-ascii-80', utf8Truncate('x'.repeat(100), 80).length, 80);
  assertEq('utf8-truncate-cjk-bytes', utf8Bytes(utf8Truncate('福'.repeat(40), 80)).length <= 80, true);
  // 26 福 is 78 bytes; cap 75 should yield 25 福 (75 bytes), not 25.something.
  const clipped = utf8Truncate('福'.repeat(26), 75);
  assertEq('utf8-truncate-cjk-boundary', clipped, '福'.repeat(25));
  assertEq('utf8-truncate-cjk-boundary-bytes', utf8Bytes(clipped).length, 75);
  const emoji = '😀'.repeat(30); // 4 bytes each
  const clippedEmoji = utf8Truncate(emoji, 21);
  assertEq('utf8-truncate-emoji-boundary-bytes', utf8Bytes(clippedEmoji).length, 20);
  assertEq('utf8-truncate-emoji-count', [...clippedEmoji].length, 5);
}

{
  const push75 = encodePush(utf8Bytes('x'.repeat(75)));
  assertEq('push-75-direct-opcode', push75[0], 75);
  assertEq('push-75-length', push75.length, 76);
  const push76 = encodePush(utf8Bytes('x'.repeat(76)));
  assertEq('push-76-pushdata1-opcode', push76[0], 0x4c);
  assertEq('push-76-declared-length', push76[1], 76);
  assertEq('push-76-total-length', push76.length, 78);
  const one = encodePush(utf8Bytes('1'));
  assertEq('push-ascii-1-is-not-op-1', binToHex(one), '0131');
}

function memoCase(name: string, memo: string, expectedBytes?: number) {
  const utxos = [coin(DISPLAY_TXID, 1, 100000n)];
  const swept = buildP2pkhSend({ utxos, privateKey, destination, memo });
  const tx = decodeTransaction(hexToBin(swept.hex));
  if (typeof tx === 'string') {
    assert(name, false, tx);
    return;
  }
  const script = tx.outputs[tx.outputs.length - 1]!.lockingBytecode;
  const decoded = decodeOpReturn(script);
  const expected = utf8Truncate(memo, MAX_MEMO_BYTES);
  const expectedLen = expectedBytes ?? utf8Bytes(expected).length;
  const payloadOk = !('error' in decoded) && new TextDecoder().decode(decoded.payload) === expected && decoded.payload.length === expectedLen;
  const standard = vm.verify({ transaction: tx, sourceOutputs: sourceOutputs(utxos) });
  assert(`${name}-roundtrip`, payloadOk, 'error' in decoded ? decoded.error : `payload ${'payload' in decoded ? decoded.payload.length : '?'}`);
  assert(`${name}-standard-vm`, standard === true, String(standard));
  if (!('error' in decoded)) {
    const push = decoded.push;
    if (expectedLen <= 75) assertEq(`${name}-direct-push`, push.opcode, expectedLen);
    else assertEq(`${name}-pushdata1`, push.opcode, 0x4c);
  }
}

memoCase('memo-empty-skipped-check', 'ignored');
{
  // empty / omitted memo: only the payment output
  const swept = buildP2pkhSend({ utxos: [coin(DISPLAY_TXID, 1, 100000n)], privateKey, destination });
  const tx = decodeTransaction(hexToBin(swept.hex));
  if (typeof tx === 'string') assert('memo-omitted-decode', false, tx);
  else {
    assertEq('memo-omitted-output-count', tx.outputs.length, 1);
    assert('memo-omitted-not-opreturn', tx.outputs[0]!.lockingBytecode[0] !== 0x6a);
  }
}

memoCase('memo-1-ascii', 'x', 1);
memoCase('memo-75-ascii', 'x'.repeat(75), 75);
memoCase('memo-76-ascii', 'x'.repeat(76), 76);
memoCase('memo-77-ascii', 'x'.repeat(77), 77);
memoCase('memo-80-ascii', 'x'.repeat(80), 80);
memoCase('memo-100-ascii-truncated', 'x'.repeat(100), 80);
memoCase('memo-25-cjk-75-bytes', '福'.repeat(25), 75);
memoCase('memo-26-cjk-truncated-to-75-if-capped-separately', '福'.repeat(26), 78); // 78 <= 80 cap
memoCase('memo-40-cjk-truncated-80-bytes', '福'.repeat(40)); // 120 bytes -> 26*3=78? 26*3=78, 27*3=81>80 so 26 福 = 78 bytes
memoCase('memo-claim-cjk-prefix', `LaiTab ${'福'.repeat(40)}`);
memoCase('memo-emoji-threshold', `${'😀'.repeat(19)}xx`); // 19*4=76, plus 2 = 78
memoCase('memo-chinese-blessing', '恭喜發財 利是來');

{
  // A 76-byte payload must not be encoded as `0x6a 0x4c <payload>` where 0x4c is mistaken for the length.
  const script = encodeOpReturn(utf8Bytes('x'.repeat(76)));
  assertEq('opreturn-76-starts-6a-4c', binToHex(script).slice(0, 6), '6a4c4c');
  const decoded = decodeOpReturn(script);
  assert('opreturn-76-decodes', !('error' in decoded) && !('error' in decoded) && decoded.payload.length === 76);
}

// --- UTXO validation ---
const invalidCases: [string, string][] = [
  ['negative-vout', `${DISPLAY_TXID}:-1:100000`],
  ['fractional-vout', `${DISPLAY_TXID}:1.5:100000`],
  ['negative-value', `${DISPLAY_TXID}:1:-20`],
  ['bad-sats-potato', `${DISPLAY_TXID}:1:potato`],
  ['duplicate-lines', `${DISPLAY_TXID}:1:100000\n${DISPLAY_TXID}:1:100000`],
  ['json-short-hash', JSON.stringify([{ txid: '11', vout: 0, satoshis: 100000 }])],
  ['json-missing-txid', JSON.stringify([{ vout: 0, satoshis: 100000 }])],
];
for (const [name, raw] of invalidCases) {
  try {
    const parsed = parseManualUtxos(raw);
    assert(`${name}-rejected`, 'error' in parsed, 'error' in parsed ? parsed.error : 'accepted');
  } catch (e) {
    assert(`${name}-returns-error-not-throw`, false, String(e));
  }
}

{
  const tokenJson = JSON.stringify([{ txid: DISPLAY_TXID, vout: 0, satoshis: 100000, token: { category: 'aa' } }]);
  const parsed = parseManualUtxos(tokenJson);
  assert('token-utxo-rejected', 'error' in parsed);
}

// --- Signing: multi-input, fees, negatives ---
{
  const first = coin(DISPLAY_TXID, 1, 100000n);
  const second = coin('202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f', 2, 12345n);
  const swept = buildP2pkhSend({ utxos: [first, second], privateKey, destination });
  const tx = decodeTransaction(hexToBin(swept.hex));
  if (typeof tx === 'string') assert('multi-input-decode', false, tx);
  else {
    const verified = vm.verify({ transaction: tx, sourceOutputs: sourceOutputs([first, second]) });
    assert('multi-input-vm', verified === true, String(verified));
    const actualFee = 112345n - tx.outputs.reduce((s, o) => s + o.valueSatoshis, 0n);
    assertEq('multi-input-reported-fee', swept.fee, actualFee);
    assertEq('multi-input-wire-first', wireOutpoint(swept.hex), EXPECTED_WIRE);
  }

  try {
    planP2pkhSend({ utxos: [first], destination, sendSats: 1000n, fee: 200n });
    assert('partial-change-rejected', false, 'should throw without change address');
  } catch (e) {
    assert('partial-change-rejected', e instanceof Error && /change/i.test(e.message), String(e));
  }

  const subdust = buildP2pkhSend({ utxos: [first], privateKey, destination, sendSats: 99700n });
  assertEq('partial-subdust-fee-includes-remainder', subdust.fee, 100000n - 99700n);
  assertEq('partial-subdust-amount', subdust.amount, 99700n);
  const subTx = decodeTransaction(hexToBin(subdust.hex));
  if (typeof subTx === 'string') assert('partial-subdust-decode', false, subTx);
  else {
    const actual = 100000n - subTx.outputs.reduce((s, o) => s + o.valueSatoshis, 0n);
    assertEq('partial-subdust-actual-fee', subdust.fee, actual);
    assert('partial-subdust-vm', vm.verify({ transaction: subTx, sourceOutputs: sourceOutputs([first]) }) === true);
  }

  const withChange = planWalletPayment({
    utxos: [first],
    destination,
    changeAddress: source,
    sendSats: 20_000n,
  });
  assert('wallet-plan-has-change', withChange.change >= 546n);
  assertEq('wallet-plan-send', withChange.send, 20_000n);
  assertEq('wallet-plan-conservation', withChange.send + withChange.change + withChange.fee, 100000n);

  try {
    buildP2pkhSend({ utxos: [first, first], privateKey, destination });
    assert('duplicate-inputs-rejected', false, 'should throw');
  } catch (e) {
    assert('duplicate-inputs-rejected', e instanceof Error && /duplicate/i.test(e.message), String(e));
  }

  const signed = buildP2pkhSend({ utxos: [first], privateKey, destination });
  const signedTx = decodeTransaction(hexToBin(signed.hex));
  if (typeof signedTx === 'string') assert('control-decode', false, signedTx);
  else {
    const wrongKey = vm.verify({ transaction: signedTx, sourceOutputs: [{ lockingBytecode: lock(destination), valueSatoshis: 100000n }] });
    const wrongAmt = vm.verify({ transaction: signedTx, sourceOutputs: [{ lockingBytecode: lock(source), valueSatoshis: 100001n }] });
    assert('wrong-prevout-key-rejected', wrongKey !== true, String(wrongKey));
    assert('wrong-prevout-amount-rejected', wrongAmt !== true, String(wrongAmt));
  }
}

// --- Indexer parsers and mock HTTP ---
{
  const chronik = parseChronikUtxos({
    utxos: [
      { outpoint: { txid: DISPLAY_TXID, outIdx: 3 }, sats: '2500' },
      { outpoint: { txid: PALINDROME_TXID, outIdx: 0 }, sats: '10', token: { tokenId: 'aa' } },
    ],
  });
  assert('chronik-parser-display-txid', !('error' in chronik) && chronik.utxos[0]?.txid === DISPLAY_TXID);
  assert('chronik-parser-skips-token', !('error' in chronik) && chronik.skippedTokens === 1 && chronik.utxos.length === 1);
  if (!('error' in chronik) && chronik.utxos[0]) {
    assertEq('chronik-parser-wire-hash', wireHashHex(chronik.utxos[0]), EXPECTED_WIRE);
  }

  const esplora = parseEsploraUtxos([{ txid: DISPLAY_TXID, vout: 4, value: 9000 }]);
  assert('esplora-parser', !('error' in esplora) && esplora.utxos[0]?.vout === 4);

  const chair = parseBlockchairUtxos({
    data: { [source]: { utxo: [{ transaction_hash: DISPLAY_TXID, index: 1, value: 100000 }] } },
  });
  assert('blockchair-parser', !('error' in chair) && chair.utxos[0]?.satoshis === 100000n);
}

{
  assert('no-ecash-xec-on-mainnet', MAINNET_CHRONIK.every((u) => !u.includes('/xec')));
  assert('no-ecash-xec-on-chipnet', CHIPNET_CHRONIK.every((u) => !u.includes('/xec')));
  assert('mainnet-includes-paybutton-bch', MAINNET_CHRONIK.includes('https://bch.paybutton.io'));
  assert('chipnet-has-no-invented-chronik-http', CHIPNET_CHRONIK.length === 0);
  assert('imaginary-cash-not-used-as-esplora', CHIPNET_ESPLORA.length === 0);
  assert('chipnet-chronik-bases-empty', chronikBases('chipnet').length === 0);
}

{
  const proto = encodeScriptUtxosFixture([
    { displayTxid: DISPLAY_TXID, vout: 3, sats: 2500n },
    { displayTxid: PALINDROME_TXID, vout: 0, sats: 10n, token: true },
  ]);
  const decoded = decodeScriptUtxos(proto);
  assert('chronik-proto-display-txid', !('error' in decoded) && decoded.utxos[0]?.displayTxid === DISPLAY_TXID);
  assert('chronik-proto-skips-token', !('error' in decoded) && decoded.skippedTokens === 1 && decoded.utxos.length === 1);
  assert('chronik-proto-sats-field-5', !('error' in decoded) && decoded.utxos[0]?.sats === 2500n && decoded.utxos[0]?.vout === 3);
  const wire = chronikBytesFromDisplayTxid(DISPLAY_TXID);
  assert('chronik-proto-txid-is-wire-order', binToHex(wire) === EXPECTED_WIRE);
  assert('chronik-proto-display-reverses-wire', displayTxidFromChronikBytes(wire) === DISPLAY_TXID);

  const txBody = encodeChronikTxFixture({
    displayTxid: DISPLAY_TXID,
    outputs: [{ sats: 2337500n, scriptHex: '76a91400' }],
  });
  const tx = decodeChronikTx(txBody);
  assert('chronik-proto-tx-id', !('error' in tx) && tx.txid === DISPLAY_TXID);
  assert('chronik-proto-tx-sats', !('error' in tx) && tx.outputs[0]?.satoshis === 2337500n);

  const req = encodeBroadcastTxRequest(hexToBin('00'.repeat(100)));
  assert('chronik-broadcast-request-starts-with-field-1', req[0] === 0x0a);
  const ok = decodeBroadcastTxResponse(encodeBroadcastTxResponse(DISPLAY_TXID));
  assert('chronik-broadcast-response', !('error' in ok) && ok.txid === DISPLAY_TXID);
  const err = decodeBroadcastTxResponse(encodeChronikError('bad-tx'));
  assert('chronik-broadcast-error', 'error' in err && err.error === 'bad-tx');
}

{
  const calls: string[] = [];
  setIndexerFetch(async (url) => {
    calls.push(url);
    if (url.includes('/script/p2pkh/')) {
      return new Response(
        encodeScriptUtxosFixture([{ displayTxid: DISPLAY_TXID, vout: 0, sats: 1234n }]),
        { status: 200, headers: { 'Content-Type': 'application/x-protobuf' } },
      );
    }
    return new Response('offline', { status: 404 });
  });
  // source is a chipnet CashAddr; the Chronik HTTP path is only configured for mainnet,
  // so call mainnet against a bitcoincash: address derived from the same pubkey.
  const mainAddr = addressFor(privateKey, 'bitcoincash');
  const main = await fetchUtxos(mainAddr, 'mainnet');
  assert('mainnet-chronik-proto-ok', main.status.ok && main.utxos.length === 1, JSON.stringify(main.status));
  assertEq('mainnet-chronik-proto-txid', main.utxos[0]?.txid, DISPLAY_TXID);
  assert('mainnet-chronik-hits-paybutton-script', calls.some((u) => u.startsWith('https://bch.paybutton.io/script/p2pkh/')), calls.join(','));
  assert('mainnet-chronik-wire-hash', main.utxos[0] ? wireHashHex(main.utxos[0]) === EXPECTED_WIRE : false);
  setIndexerFetch(null);
}

{
  setIndexerFetch(async () => new Response(new Uint8Array([0, 1, 2, 3]), { status: 200, headers: { 'Content-Type': 'application/x-protobuf' } }));
  const mainAddr = addressFor(privateKey, 'bitcoincash');
  const miss = await fetchUtxos(mainAddr, 'mainnet');
  assert('garbage-protobuf-not-parsed-as-success', !miss.status.ok && miss.utxos.length === 0);
  setIndexerFetch(null);
}

{
  setIndexerFetch(async (url) => {
    if (url.includes('/tx/')) {
      return new Response(encodeChronikTxFixture({ displayTxid: DISPLAY_TXID, outputs: [{ sats: 2337500n, scriptHex: '76a91400' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/x-protobuf' },
      });
    }
    return new Response('no', { status: 404 });
  });
  const found = await fetchTransaction(DISPLAY_TXID, 'mainnet');
  assert('fetch-tx-protobuf', !('error' in found) && found.outputs[0]?.satoshis === 2337500n && found.txid === DISPLAY_TXID);
  setIndexerFetch(null);
}

{
  setIndexerFetch(async (url) => {
    if (url.endsWith('/tx') || url.includes('/tx')) {
      return new Response(encodeBroadcastTxResponse(DISPLAY_TXID), {
        status: 200,
        headers: { 'Content-Type': 'application/x-protobuf' },
      });
    }
    return new Response('no', { status: 404 });
  });
  const pushed = await broadcastTx('ab'.repeat(120), 'mainnet');
  assert('broadcast-protobuf-accepted', pushed.accepted && pushed.txid === DISPLAY_TXID, JSON.stringify(pushed));
  setIndexerFetch(null);
}

{
  const listed = parseElectrumListUnspent([
    { tx_hash: DISPLAY_TXID, tx_pos: 2, value: 5000 },
    { tx_hash: PALINDROME_TXID, tx_pos: 0, value: 1, token_data: { category: 'aa' } },
  ]);
  assert('electrum-list-skips-token', !('error' in listed) && listed.coins.length === 1 && listed.skippedTokens === 1);
  assert('electrum-list-display-txid', !('error' in listed) && listed.coins[0]?.txid === DISPLAY_TXID && listed.coins[0]?.vout === 2);
  const sh = scriptHashFromAddress(source);
  assert('electrum-scripthash-length', typeof sh === 'string' && sh.length === 64);

  // Mock Electrum for chipnet now that there is no Chronik HTTP base.
  setElectrumEnabled(true);
  setElectrumOpener(async () => ({
    async request(method) {
      if (method === 'blockchain.scripthash.listunspent') {
        return [{ tx_hash: DISPLAY_TXID, tx_pos: 1, value: 7777 }];
      }
      throw new Error(`unexpected method ${method}`);
    },
    close() {},
  }));
  const chip = await fetchUtxos(source, 'chipnet');
  assert('chipnet-electrum-mock-ok', chip.status.ok && chip.utxos.length === 1, JSON.stringify(chip.status));
  assertEq('chipnet-electrum-mock-txid', chip.utxos[0]?.txid, DISPLAY_TXID);
  assert('chipnet-electrum-source', chip.status.source.startsWith('electrum:'), chip.status.source);
  setElectrumOpener(null);
  setElectrumEnabled(false);
}

// --- Payment acknowledgements ---
{
  const guest: Guest = { id: 'g1', name: 'Mina', note: '', shareSats: 1000, paidSats: 0, paidTxids: [] };
  const short = recordAcknowledgement(guest, 'abcd', 1000);
  assert('ack-rejects-short-txid', 'error' in short);
  const ok = recordAcknowledgement(guest, DISPLAY_TXID, 1000);
  assert('ack-accepts-64-hex', !('error' in ok) && !('error' in ok) && ok.ack.status === 'unverified');
  if (!('error' in ok)) {
    assertEq('ack-does-not-mark-paidSats-when-unverified', ok.guest.paidSats, 0);
    assert('ack-duplicate-rejected', 'error' in recordAcknowledgement(ok.guest, DISPLAY_TXID, 1000));
    assert('ack-has-recorded', hasRecordedTxid(ok.guest, DISPLAY_TXID));
    assertEq('ack-label-unverified', paymentLabel(ok.guest), 'unverified');
  }
  const parsed = parsePaymentTxid('  ' + DISPLAY_TXID.toUpperCase() + '  ');
  assert('ack-normalizes-txid', !('error' in parsed) && !('error' in parsed) && parsed.txid === DISPLAY_TXID);
}

// --- Hash-route payloads (claim link was previously sliced off-by-one) ---
{
  assertEq('claim-payload-keeps-first-char', payloadAfter('/claim/ABCDEFG', '/claim/'), 'ABCDEFG');
  assertEq('packet-payload-offset', payloadAfter('/packet/pid123', '/packet/'), 'pid123');
  assertEq('share-payload-offset', payloadAfter('/t/payload', '/t/'), 'payload');
  assertEq('tab-id-offset', payloadAfter('/tab/demo-yumcha', '/tab/'), 'demo-yumcha');
  assert('claim-prefix-miss-is-null', payloadAfter('/packet/x', '/claim/') === null);
  assertEq('payload-ignores-query', payloadAfter('/claim/abc?x=1', '/claim/'), 'abc');
}

// --- Remainder sats stay exact when suggested as a BCH amount ---
{
  assertEq('remainder-fromSats-7012500', fromSats(7_012_500n), '0.070125');
  assertEq('remainder-fromSats-1sat', fromSats(1n), '0.00000001');
  assertEq('parse-roundtrip-remainder', parseAmountToSats(fromSats(7_012_500n)), 7_012_500n);
}

// --- Claim-link merge must not strip a payload key or wipe a host backup ---
{
  const incoming: LaiSeePacket = {
    v: 1,
    kind: 'laisee',
    id: 'p-merge',
    createdAt: '2026-11-18T00:00:00+08:00',
    network: 'chipnet',
    fromName: 'Host',
    blessing: '利是',
    expectedSats: 1000,
    address: source,
    wif: 'cPayloadWif',
    locked: false,
  };
  const firstOpen = mergeClaimPacket(incoming);
  assertEq('claim-merge-keeps-payload-wif', firstOpen.wif, 'cPayloadWif');
  const hostSaved: LaiSeePacket = { ...incoming, wif: 'cHostBackupWif', enc: undefined, locked: false };
  const sharedLocked: LaiSeePacket = { ...incoming, wif: undefined, enc: { salt: 's', iv: 'i', ct: 'c' }, locked: true };
  const merged = mergeClaimPacket(sharedLocked, hostSaved);
  assertEq('claim-merge-prefers-host-wif', merged.wif, 'cHostBackupWif');
  assert('claim-merge-keeps-enc', merged.enc?.salt === 's');
}

// --- Payment allocation across shares of one tab ---
{
  const tabBase: ReturnType<typeof demoTab> = {
    ...applyEqualSplit(demoTab()),
    hostAddress: addressFor(privateKey, 'bitcoincash'),
    network: 'mainnet',
  };
  const share = 2_337_500;
  const mina = tabBase.guests[1]!;
  const ho = tabBase.guests[2]!;
  const recordedMina = recordAcknowledgement(mina, DISPLAY_TXID, share, 'verified');
  if ('error' in recordedMina) throw new Error(recordedMina.error);
  const afterMina = { ...tabBase, guests: tabBase.guests.map((g) => (g.id === mina.id ? recordedMina.guest : g)) };
  assertEq('allocated-after-one-share', allocatedSatsForTxid(afterMina, DISPLAY_TXID), BigInt(share));

  const mainHost = tabBase.hostAddress;
  const lockHex = binToHex(lock(mainHost));
  setIndexerFetch(async (url) => {
    if (url.includes('/tx/')) {
      return new Response(
        encodeChronikTxFixture({
          displayTxid: DISPLAY_TXID,
          outputs: [{ sats: BigInt(share), scriptHex: lockHex }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/x-protobuf' } },
      );
    }
    return new Response('no', { status: 404 });
  });
  const first = await acknowledgeOnTab(tabBase, mina.id, DISPLAY_TXID, share);
  assert('ack-on-tab-verifies-first-share', !('error' in first) && first.ack.status === 'verified');
  if (!('error' in first)) {
    const second = await acknowledgeOnTab(first.tab, ho.id, DISPLAY_TXID, share);
    assert('ack-on-tab-rejects-double-count', 'error' in second);
    if ('error' in second) {
      assert('ack-on-tab-double-count-message', second.error.includes('already fully allocated'));
    }
    assertEq('ack-on-tab-second-guest-unpaid', first.tab.guests.find((g) => g.id === ho.id)?.paidSats, 0);
  }

  // A larger payment can cover two equal shares.
  setIndexerFetch(async (url) => {
    if (url.includes('/tx/')) {
      return new Response(
        encodeChronikTxFixture({
          displayTxid: PALINDROME_TXID,
          outputs: [{ sats: BigInt(share) * 2n, scriptHex: lockHex }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/x-protobuf' } },
      );
    }
    return new Response('no', { status: 404 });
  });
  const twoA = await acknowledgeOnTab(tabBase, mina.id, PALINDROME_TXID, share);
  assert('ack-large-tx-first-ok', !('error' in twoA) && twoA.ack.status === 'verified');
  if (!('error' in twoA)) {
    const twoB = await acknowledgeOnTab(twoA.tab, ho.id, PALINDROME_TXID, share);
    assert('ack-large-tx-second-ok', !('error' in twoB) && twoB.ack.status === 'verified');
  }

  const mismatch = await verifyPaymentOnChain({
    txid: DISPLAY_TXID,
    network: 'mainnet',
    destination: mainHost,
    expectedSats: BigInt(share),
    alreadyAllocatedSats: 0n,
  });
  // DISPLAY_TXID fixture still returns only one share, so this should verify.
  assert('verify-single-share-still-ok', mismatch.status === 'verified');

  const wrongDest = await verifyPaymentOnChain({
    txid: DISPLAY_TXID,
    network: 'mainnet',
    destination: addressFor(otherKey, 'bitcoincash'),
    expectedSats: BigInt(share),
  });
  assert('verify-wrong-host-is-mismatch', wrongDest.status === 'mismatch');
  setIndexerFetch(null);
}

// --- WizardConnect adapter (mocked manager; no live wallet) ---
{
  const pub = secp.derivePublicKeyCompressed(privateKey);
  if (typeof pub === 'string') throw new Error(pub);
  const derivedAddr = cashAddressFromPubkey(pub, 'chipnet');
  assertEq('adapter-address-from-pubkey', derivedAddr, source);

  const manager: WalletManagerView = {
    getPubkey: (child, index) => (child === 0 && index === 0n ? pub : child === 1 && index === 0n ? pub : undefined),
    hasPath: (child) => child === 0 || child === 1,
    getSessionPaths: () => [
      { name: 'receive', xpub: 'xpub-test' },
      { name: 'change', xpub: 'xpub-test' },
    ],
    signTransaction: async () => ({
      action: 'sign_transaction_response' as never,
      time: 0,
      sequence: 1,
      signedTransaction: '00',
    }),
  };
  const account = deriveReceiveAddress(manager, 'chipnet');
  assert('adapter-derive-account', !('error' in account) && !('error' in account) && account.receiveAddress === source);

  const missing = deriveReceiveAddress({ getPubkey: () => undefined }, 'chipnet');
  assert('adapter-missing-key-error', 'error' in missing);

  const walletCoin: Utxo = {
    ...coin(DISPLAY_TXID, 1, 100000n),
    path: { name: 'receive', index: 0 },
  };
  const request = buildWalletSignRequest({
    utxos: [walletCoin],
    destination,
    changeAddress: source,
    sendSats: 20_000n,
    userPrompt: 'Pay share',
  });
  assert('adapter-sign-request-built', !('error' in request));
  if (!('error' in request)) {
    assertEq('adapter-input-path-index', request.inputPaths[0]?.[0], 0);
    assertEq('adapter-input-path-name', request.inputPaths[0]?.[1], 'receive');
    assert('adapter-source-outputs-present', request.transaction.sourceOutputs.length === 1);
    assert('adapter-does-not-ask-wallet-to-broadcast', request.transaction.broadcast === false);
  }

  const rejected = await requestWalletSignature(
    {
      getPubkey: () => pub,
      signTransaction: async () => {
        throw new Error('User rejected the request');
      },
    },
    !('error' in request)
      ? request
      : { transaction: { transaction: '00', sourceOutputs: [] }, inputPaths: [], planFee: 0n, planAmount: 0n, change: 0n },
  );
  assert('adapter-rejection-is-error', 'error' in rejected && rejected.cancelled === true, 'error' in rejected ? rejected.error : 'signed');

  const cancelled = await requestWalletSignature(
    {
      getPubkey: () => pub,
      signTransaction: async () => ({
        action: 'sign_transaction_response' as never,
        time: 0,
        sequence: 1,
        signedTransaction: '',
        error: 'cancelled by wallet',
      }),
    },
    !('error' in request)
      ? request
      : { transaction: { transaction: '00', sourceOutputs: [] }, inputPaths: [], planFee: 0n, planAmount: 0n, change: 0n },
  );
  assert('adapter-cancel-flag', 'error' in cancelled && cancelled.cancelled === true);
}

{
  const empty = contestBanner();
  assert('banner-empty-by-default', !bannerIsComplete(empty) && !empty.presentationUrl && !empty.sourceUrl && !empty.emberDonationAddress);
  setContestBanner({
    presentationUrl: 'https://example.invalid/deck',
    sourceUrl: 'https://example.invalid/repo',
    emberDonationAddress: 'bitcoincash:qpplaceholder',
  });
  assert('banner-complete-when-configured', bannerIsComplete());
  setContestBanner(null);
  assert('banner-reset-to-empty', !bannerIsComplete());
}

const failed = results.filter((r) => !r.ok);
const passed = results.filter((r) => r.ok);
console.log(`tests: ${passed.length} passed, ${failed.length} failed, ${results.length} total`);
if (failed.length) {
  console.error(failed);
  process.exitCode = 1;
} else {
  console.log('all checks passed');
}
