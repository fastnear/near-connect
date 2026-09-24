const assert = require("node:assert/strict");
const test = require("node:test");
const { nearActionsToConnectorActions } = require("../build");

// Hand-built objects with the shape near-api-js `actionCreators` produce: the
// chosen enum variant is an own property (possibly `null`) and is named in `enum`.
const PUBLIC_KEY = "ed25519:3ARMH9zfVCnU2TKiphU4xcEyWdA45fc1sjKEtYMdf3gr";
const pk = { toString: () => PUBLIC_KEY };
const convert = (action) => nearActionsToConnectorActions([action])[0];

test("connector actions pass through untouched", () => {
  const action = { type: "Transfer", params: { deposit: "1" } };
  assert.equal(convert(action), action);
});

test("functionCall: JSON args decode, gas/deposit stringify", () => {
  const args = new TextEncoder().encode(JSON.stringify({ greeting: "hello" }));
  assert.deepEqual(convert({ enum: "functionCall", functionCall: { methodName: "set_greeting", args, gas: 30000000000000n, deposit: 0n } }), {
    type: "FunctionCall",
    params: { methodName: "set_greeting", args: { greeting: "hello" }, gas: "30000000000000", deposit: "0" },
  });
});

test("addKey fullAccessKey maps to FullAccess", () => {
  const action = { enum: "addKey", addKey: { publicKey: pk, accessKey: { nonce: 0n, permission: { enum: "fullAccess", fullAccess: {} } } } };
  assert.deepEqual(convert(action), { type: "AddKey", params: { publicKey: PUBLIC_KEY, accessKey: { nonce: 0, permission: "FullAccess" } } });
});

test("addKey functionCallAccessKey keeps receiver, methods and a stringified allowance", () => {
  const permission = { enum: "functionCall", functionCall: { receiverId: "app.near", methodNames: ["foo"], allowance: 250000000000000000000000n } };
  assert.deepEqual(convert({ addKey: { publicKey: pk, accessKey: { nonce: 0n, permission } } }), {
    type: "AddKey",
    params: { publicKey: PUBLIC_KEY, accessKey: { nonce: 0, permission: { receiverId: "app.near", allowance: "250000000000000000000000", methodNames: ["foo"] } } },
  });
});

test("addKey functionCallAccessKey without allowance leaves it undefined", () => {
  const permission = { enum: "functionCall", functionCall: { receiverId: "app.near", methodNames: [], allowance: undefined } };
  const { params } = convert({ addKey: { publicKey: pk, accessKey: { nonce: 0n, permission } } });
  assert.deepEqual(params.accessKey.permission, { receiverId: "app.near", allowance: undefined, methodNames: [] });
});

test("addKey with an unknown permission throws instead of escalating to FullAccess", () => {
  for (const permission of [{}, { enum: "gasKeyFullAccess", gasKeyFullAccess: { balance: 0n, numNonces: 4 } }]) {
    assert.throws(() => convert({ addKey: { publicKey: pk, accessKey: { nonce: 0n, permission } } }), /Unsupported access-key permission/);
  }
});

test("deployGlobalContract: AccountId deploy mode (stored as null) maps to AccountId", () => {
  const code = new Uint8Array([1, 2, 3]);
  assert.equal(convert({ deployGlobalContract: { code, deployMode: { enum: "AccountId", AccountId: null } } }).params.deployMode, "AccountId");
  assert.equal(convert({ deployGlobalContract: { code, deployMode: { enum: "CodeHash", CodeHash: null } } }).params.deployMode, "CodeHash");
});

test("useGlobalContract: AccountId identifier vs CodeHash identifier", () => {
  assert.deepEqual(convert({ useGlobalContract: { contractIdentifier: { enum: "AccountId", AccountId: "lib.near" } } }).params.contractIdentifier, { accountId: "lib.near" });
  const { contractIdentifier } = convert({ useGlobalContract: { contractIdentifier: { enum: "CodeHash", CodeHash: new Uint8Array(32) } } }).params;
  assert.equal(typeof contractIdentifier.codeHash, "string");
});

test("signedDelegate throws a clear error", () => {
  assert.throws(() => convert({ enum: "signedDelegate", signedDelegate: {} }), /SignedDelegate actions cannot be sent through the wallet connector/);
});

test("unknown action shapes still throw", () => {
  assert.throws(() => convert({ enum: "mystery", mystery: {} }), /Unsupported action type/);
});
