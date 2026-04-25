import { WalletManifest, WalletPermissions, Network } from "../types";
import { NearConnector } from "../NearConnector";
import { parseUrl } from "../helpers/url";
import { uuid4 } from "../helpers/uuid";

import IframeExecutor from "./iframe";

const cacheId = uuid4();

const SUPPORTED_NETWORKS: ReadonlyArray<Network> = ["mainnet", "testnet"];
const LEGACY_MIGRATION_NETWORK: Network = "mainnet";
// Track manifest ids whose legacy unscoped keys have already been migrated this
// page load, so multiple SandboxExecutor instances (one per (wallet × network)
// pair when a page holds parallel-network connectors) don't repeat the work.
const migratedManifestIds = new Set<string>();

class SandboxExecutor {
  private activePanels: Record<string, Window> = {};

  constructor(readonly connector: NearConnector, readonly manifest: WalletManifest) {
    this.migrateLegacyStorage();
  }

  /**
   * Storage namespace for proxied iframe localStorage keys, scoped to
   * `${manifestId}:${network}`. Each network gets its own slot so signing
   * into mainnet and testnet on the same page doesn't collide.
   *
   * Reads `connector.network` live so that `connector.switchNetwork(...)`
   * (which mutates `connector.network`) immediately retargets storage to
   * the new network's slot for subsequent calls.
   */
  get storageSpace(): string {
    return `${this.manifest.id}:${this.connector.network}`;
  }

  private prefixForNetwork(network: Network): string {
    return `${this.manifest.id}:${network}:`;
  }

  /**
   * One-shot migration of pre-network-namespaced keys.
   *
   * Old shape: `${manifestId}:${key}` (single colon).
   * New shape: `${manifestId}:${network}:${key}` (network segment).
   *
   * Any legacy key (matches `${manifestId}:` but not `${manifestId}:mainnet:`
   * or `${manifestId}:testnet:`) is moved into the mainnet slot — that's the
   * only network the unscoped library could meaningfully have written for.
   */
  private migrateLegacyStorage() {
    if (typeof localStorage === "undefined") return;
    if (migratedManifestIds.has(this.manifest.id)) return;
    migratedManifestIds.add(this.manifest.id);

    const idColon = `${this.manifest.id}:`;
    const namespacedPrefixes = SUPPORTED_NETWORKS.map((n) => this.prefixForNetwork(n));
    const moves: Array<{ from: string; to: string }> = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(idColon)) continue;
      if (namespacedPrefixes.some((p) => key.startsWith(p))) continue;
      const tail = key.slice(idColon.length);
      moves.push({
        from: key,
        to: `${this.prefixForNetwork(LEGACY_MIGRATION_NETWORK)}${tail}`,
      });
    }

    for (const { from, to } of moves) {
      // Don't clobber a key that already exists at the target — assume the
      // newer write is more correct and drop the legacy one.
      if (localStorage.getItem(to) === null) {
        const value = localStorage.getItem(from);
        if (value !== null) localStorage.setItem(to, value);
      }
      localStorage.removeItem(from);
    }
  }

  checkPermissions(action: keyof WalletPermissions, params?: { url?: string; entity?: string }) {
    if (action === "walletConnect") {
      return !!this.manifest.permissions.walletConnect;
    }

    if (action === "external") {
      const external = this.manifest.permissions.external;
      if (!external || !params?.entity) return false;
      return external.includes(params.entity);
    }

    if (action === "allowsOpen") {
      const openUrl = parseUrl(params?.url || "");
      const allowsOpen = this.manifest.permissions.allowsOpen;

      if (!openUrl || !allowsOpen || !Array.isArray(allowsOpen) || allowsOpen.length === 0) return false;
      const isAllowed = allowsOpen.some((path) => {
        const url = parseUrl(path);
        if (!url) return false;

        if (openUrl.protocol !== url.protocol) return false;
        if (!!url.hostname && openUrl.hostname !== url.hostname) return false;
        if (!!url.pathname && url.pathname !== "/" && openUrl.pathname !== url.pathname) return false;
        return true;
      });

      return isAllowed;
    }

    return this.manifest.permissions[action];
  }

  assertPermissions(iframe: IframeExecutor, action: keyof WalletPermissions, event: MessageEvent) {
    if (!this.checkPermissions(action, event.data.params)) {
      iframe.postMessage({ ...event.data, status: "failed", result: "Permission denied" });
      throw new Error("Permission denied");
    }
  }

  _onMessage = async (iframe: IframeExecutor, event: MessageEvent) => {
    const success = (result: any) => {
      iframe.postMessage({ ...event.data, status: "success", result: result });
    };

    const failed = (error: any) => {
      iframe.postMessage({ ...event.data, status: "failed", result: error });
    };

    if (event.data.method === "ui.showIframe") {
      iframe.show();
      success(null);
      return;
    }

    if (event.data.method === "ui.hideIframe") {
      iframe.hide();
      success(null);
      return;
    }

    if (event.data.method === "storage.set") {
      this.assertPermissions(iframe, "storage", event);
      localStorage.setItem(`${this.storageSpace}:${event.data.params.key}`, event.data.params.value);
      success(null);
      return;
    }

    if (event.data.method === "storage.get") {
      this.assertPermissions(iframe, "storage", event);
      const value = localStorage.getItem(`${this.storageSpace}:${event.data.params.key}`);
      success(value);
      return;
    }

    if (event.data.method === "storage.keys") {
      this.assertPermissions(iframe, "storage", event);
      const prefix = `${this.storageSpace}:`;
      const keys = Object.keys(localStorage)
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length));
      success(keys);
      return;
    }

    if (event.data.method === "storage.remove") {
      this.assertPermissions(iframe, "storage", event);
      localStorage.removeItem(`${this.storageSpace}:${event.data.params.key}`);
      success(null);
      return;
    }

    if (event.data.method === "panel.focus") {
      const panel = this.activePanels[event.data.params.windowId];
      if (panel) panel.focus();
      success(null);
      return;
    }

    if (event.data.method === "panel.postMessage") {
      const panel = this.activePanels[event.data.params.windowId];
      if (panel) panel.postMessage(event.data.params.data, "*");
      success(null);
      return;
    }

    if (event.data.method === "panel.close") {
      const panel = this.activePanels[event.data.params.windowId];
      if (panel) panel.close();

      delete this.activePanels[event.data.params.windowId];
      success(null);
      return;
    }

    if (event.data.method === "walletConnect.getConfig") {
      this.assertPermissions(iframe, "walletConnect", event);
      try {
        if (!this.connector.walletConnect) throw new Error("WalletConnect is not configured");
        success(this.connector.walletConnect);
      } catch (e) {
        failed(e);
      }
      return;
    }

    if (event.data.method === "external") {
      this.assertPermissions(iframe, "external", event);
      try {
        const { entity, key, args } = event.data.params;
        const obj = entity.split(".").reduce((acc: any, key: string) => acc[key], window);

        // TODO: remove hack after Nightly fixes.
        // Their method wait near.Transaction and call encode() to get bytes.
        // External API should not require non-serializable data, this is unsafe from an isolation point of view.
        if (entity === "nightly.near" && key === "signTransaction") {
          args[0].encode = () => args[0];
        }

        const result = typeof obj[key] === "function" ? await obj[key](...(args || [])) : obj[key];
        success(result);
      } catch (e) {
        failed(e);
      }
      return;
    }

    if (event.data.method === "open") {
      this.assertPermissions(iframe, "allowsOpen", event);

      // Open in Telegram Mini App
      const tgapp = typeof window !== "undefined" ? (window as any)?.Telegram?.WebApp : null;
      if (tgapp && event.data.params.url.startsWith("https://t.me")) {
        tgapp.openTelegramLink(event.data.params.url);
        return;
      }

      const panel = window.open(event.data.params.url, "_blank", event.data.params.features);
      const panelId = panel ? uuid4() : null;

      const handler = (ev: MessageEvent) => {
        const url = parseUrl(event.data.params.url);
        if (url && url.origin === ev.origin) {
          iframe.postMessage(ev.data);
        }
      };

      success(panelId);
      window.addEventListener("message", handler);

      if (panel && panelId) {
        this.activePanels[panelId] = panel;
        const interval = setInterval(() => {
          if (!panel?.closed) return;

          window.removeEventListener("message", handler);
          const args = { method: "proxy-window:closed", windowId: panelId };
          delete this.activePanels[panelId];
          clearInterval(interval);

          try {
            iframe.postMessage(args);
          } catch {}
        }, 500);
      }

      return;
    }

    if (event.data.method === "open.nativeApp") {
      this.assertPermissions(iframe, "allowsOpen", event);

      const url = parseUrl(event.data.params.url);
      const invalid = ["https", "http", "javascript:", "file:", "data:", "blob:", "about:"];
      if (!url || invalid.includes(url.protocol)) {
        failed("Invalid URL");
        throw new Error("[open.nativeApp] Invalid URL");
      }

      const linkIframe = document.createElement("iframe");
      linkIframe.src = event.data.params.url;
      linkIframe.style.display = "none";
      document.body.appendChild(linkIframe);
      iframe.postMessage({ ...event.data, status: "success", result: null });
      return;
    }
  };

  private actualCode: string | null = null;
  async checkNewVersion(executor: SandboxExecutor, currentVersion: string | null) {
    if (this.actualCode) {
      this.connector.logger?.log(`New version of code already checked`);
      return this.actualCode;
    }

    let url = parseUrl(executor.manifest.executor);
    if (!url) url = parseUrl(location.origin + executor.manifest.executor); // relative url
    if (!url) throw new Error("Invalid executor URL");

    url.searchParams.set("nonce", cacheId);
    const newVersion = await fetch(url.toString()).then((res) => res.text());
    this.connector.logger?.log(`New version of code fetched`);
    this.actualCode = newVersion;

    if (newVersion === currentVersion) {
      this.connector.logger?.log(`New version of code is the same as the current version`);
      return this.actualCode;
    }

    await this.connector.db.setItem(`${this.manifest.id}:${this.manifest.version}`, newVersion);
    this.connector.logger?.log(`New version of code saved to cache`);
    return newVersion;
  }

  async loadCode(): Promise<string> {
    const cachedCode = await this.connector.db.getItem<string>(`${this.manifest.id}:${this.manifest.version}`).catch(() => null);
    this.connector.logger?.log(`Code loaded from cache`, cachedCode !== null);

    const task = this.checkNewVersion(this, cachedCode as string | null);
    if (cachedCode) return cachedCode;
    return await task;
  }

  async call<T>(method: string, params: any): Promise<T> {
    console.log(`[near-connect] call("${method}") on "${this.manifest.name}"`);

    // Inject signerId into storage so wallet executors find it in sandboxedLocalStorage.
    // Use the call's network (set by SandboxedWallet/index.ts methods) when available
    // so cross-network calls land in the right per-network slot.
    if (params?.signerId) {
      const callNetwork: Network = params?.network && SUPPORTED_NETWORKS.includes(params.network)
        ? params.network
        : this.connector.network;
      localStorage.setItem(`${this.prefixForNetwork(callNetwork)}signedAccountId`, params.signerId);
    }

    this.connector.logger?.log(`Add to queue`, method, params);

    // return this.queue.enqueue(async () => {
    this.connector.logger?.log(`Calling method`, method, params);

    const code = await this.loadCode();
    this.connector.logger?.log(`Code loaded, preparing (${code.length} bytes)`);

    // Maximum time to wait for a wallet executor to call window.selector.ready().
    // This is the *fallback* timeout — most crashes are caught much faster by the
    // in-iframe error reporter (wallet-error postMessage). The 5s ceiling covers
    // edge cases where the executor script itself fails to load (e.g., network
    // timeout on the raw.githubusercontent.com fetch) so neither ready() nor the
    // error reporter ever fire.
    const READY_TIMEOUT_MS = 5_000;

    const iframe = new IframeExecutor(this, code, this._onMessage);
    this.connector.logger?.log(`Code loaded, iframe initialized`);

    let timeoutId: ReturnType<typeof setTimeout>;
    try {
      await Promise.race([
        iframe.readyPromise,
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(
            `Wallet executor "${this.manifest.name}" did not initialize within ${READY_TIMEOUT_MS / 1000}s`
          )), READY_TIMEOUT_MS);
        }),
      ]);
    } catch (e) {
      iframe.dispose();
      throw e;
    } finally {
      clearTimeout(timeoutId!);
    }
    this.connector.logger?.log(`Iframe ready`);

    const id = uuid4();
    return new Promise<T>((resolve, reject) => {
      try {
        const handler = (event: MessageEvent) => {
          if (event.data.id !== id || event.data.origin !== iframe.origin) return;

          iframe.dispose();
          window.removeEventListener("message", handler);
          this.connector.logger?.log("postMessage", { result: event.data, request: { method, params } });

          if (event.data.status === "failed") {
            console.warn(`[near-connect] call("${method}") on "${this.manifest.name}" FAILED:`, event.data.result);
            reject(event.data.result);
          } else {
            console.log(`[near-connect] call("${method}") on "${this.manifest.name}" succeeded`);
            resolve(event.data.result);
          }
        };

        window.addEventListener("message", handler);
        iframe.postMessage({ method, params, id });
        iframe.on("close", () => reject(new Error("Wallet closed")));
      } catch (e) {
        this.connector.logger?.log(`Iframe error`, e);
        reject(e);
      }
    });
    // });
  }

  async getAllStorage(network?: Network) {
    const prefix = this.prefixForNetwork(network ?? this.connector.network);
    const keys = Object.keys(localStorage).filter((key) => key.startsWith(prefix));
    const storage: Record<string, any> = {};

    for (const key of keys) {
      storage[key.slice(prefix.length)] = localStorage.getItem(key);
    }

    return storage;
  }

  async clearStorage(network?: Network) {
    const prefix = this.prefixForNetwork(network ?? this.connector.network);
    const keys = Object.keys(localStorage).filter((key) => key.startsWith(prefix));
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  }
}

export default SandboxExecutor;
