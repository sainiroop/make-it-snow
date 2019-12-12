/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { OidcFrontendClientConfiguration, IOidcFrontendClient, Config, UrlDiscoveryClient } from "@bentley/imodeljs-clients";
import { IModelApp, OidcBrowserClient, FrontendRequestContext } from "@bentley/imodeljs-frontend";
import { BentleyCloudRpcManager, BentleyCloudRpcParams } from "@bentley/imodeljs-common";
import { UiCore } from "@bentley/ui-core";
import { UiComponents } from "@bentley/ui-components";
import getSupportedRpcs from "../../common/rpcs";

/**
 * List of possible backends that basic-viewport-app can use
 */
export enum UseBackend {
  /** Use local simple-viewer-app backend */
  Local = 0,

  /** Use deployed general-purpose backend */
  GeneralPurpose = 1,
}

// Boiler plate code
export class BasicViewportApp {

  private static _isReady: Promise<void>;
  private static _oidcClient: IOidcFrontendClient;

  public static get oidcClient() { return this._oidcClient; }

  public static get ready(): Promise<void> { return this._isReady; }

  public static startup() {
    IModelApp.startup();

    // contains various initialization promises which need
    // to be fulfilled before the app is ready
    const initPromises = new Array<Promise<any>>();

    // initialize UiCore
    initPromises.push(UiCore.initialize(IModelApp.i18n));

    // initialize UiComponents
    initPromises.push(UiComponents.initialize(IModelApp.i18n));

    // initialize RPC communication
    initPromises.push(BasicViewportApp.initializeRpc());

    // initialize OIDC
    initPromises.push(BasicViewportApp.initializeOidc());

    // the app is ready when all initialization promises are fulfilled
    this._isReady = Promise.all(initPromises).then(() => { });
  }

  private static async initializeRpc(): Promise<void> {
    let rpcParams = await this.getConnectionInfo();
    const rpcInterfaces = getSupportedRpcs();
    // initialize RPC for web apps
    if (!rpcParams) rpcParams = { info: { title: "basic-viewport-app", version: "v1.0" }, uriPrefix: "http://localhost:3001" };
    BentleyCloudRpcManager.initializeClient(rpcParams, rpcInterfaces);
  }

  private static async initializeOidc() {
    const clientId = Config.App.getString("imjs_browser_test_client_id");
    const redirectUri = Config.App.getString("imjs_browser_test_redirect_uri");
    const scope = Config.App.getString("imjs_browser_test_scope");
    const oidcConfig: OidcFrontendClientConfiguration = { clientId, redirectUri, scope };

    this._oidcClient = new OidcBrowserClient(oidcConfig);

    const requestContext = new FrontendRequestContext();
    await this._oidcClient.initialize(requestContext);

    IModelApp.authorizationClient = this._oidcClient;

    // Forward url_arugments, client_id and redirect_uri to /signin-callback/index.html via cookies.
    window.document.cookie = "client_id=" + clientId + ";path=/signin-callback";
    window.document.cookie = "redirect_uri=" + redirectUri + ";path=/signin-callback";
    window.document.cookie = "url_arguments=" + window.location.search + ";path=/signin-callback";
  }

  private static async getConnectionInfo(): Promise<BentleyCloudRpcParams | undefined> {
    const usedBackend = Config.App.getNumber("imjs_backend", UseBackend.Local);

    if (usedBackend === UseBackend.GeneralPurpose) {
      const urlClient = new UrlDiscoveryClient();
      const requestContext = new FrontendRequestContext();
      const orchestratorUrl = await urlClient.discoverUrl(requestContext, "iModelJsOrchestrator.K8S", undefined);
      return { info: { title: "general-purpose-imodeljs-backend", version: "v1.0" }, uriPrefix: orchestratorUrl };
    }

    if (usedBackend === UseBackend.Local)
      return undefined;

    throw new Error(`Invalid backend "${usedBackend}" specified in configuration`);
  }

  public static shutdown() {
    this._oidcClient.dispose();
    IModelApp.shutdown();
  }
}
