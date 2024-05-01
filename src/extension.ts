import * as vscode from 'vscode';
import { IExtension, IExtensionPlugin, /*IDriverExtensionApi*/ } from '@sqltools/types';
import { ExtensionContext } from 'vscode';
import { DRIVER_ALIASES } from './constants';
const { publisher, name } = require('../package.json');

const driverName = 'InterSystems IRIS Driver';

export async function activate(extContext: ExtensionContext): Promise<any> {
  const sqltools = vscode.extensions.getExtension<IExtension>('mtxr.sqltools');
  if (!sqltools) {
    throw new Error('SQLTools not installed');
  }
  await sqltools.activate();

  const api = sqltools.exports;

  const extensionId = `${publisher}.${name}`;
  const plugin: IExtensionPlugin = {
    extensionId,
    name: `${driverName} Plugin`,
    type: 'driver',
    async register(extension) {
      // register ext part here
      extension.resourcesMap().set(`driver/${DRIVER_ALIASES[0].value}/icons`, {
        active: extContext.asAbsolutePath('icons/active.png'),
        default: extContext.asAbsolutePath('icons/default.png'),
        inactive: extContext.asAbsolutePath('icons/inactive.png'),
      });
      DRIVER_ALIASES.forEach(({ value }) => {
        extension.resourcesMap().set(`driver/${value}/extension-id`, extensionId);
        extension.resourcesMap().set(`driver/${value}/connection-schema`, extContext.asAbsolutePath('connection.schema.json'));
        extension.resourcesMap().set(`driver/${value}/ui-schema`, extContext.asAbsolutePath('ui.schema.json'));
      });
      await extension.client.sendRequest("ls/RegisterPlugin", {
        path: extContext.asAbsolutePath("dist/ls/plugin.js"),
      });
    }
  };
  api.registerPlugin(plugin);
  return {
    driverName,
    parseBeforeSaveConnection: ({ connInfo }) => {
      /**
       * This hook is called before saving the connection definition from the form
       */
      if (connInfo.connectionMethod === 'Server Manager') {
        // Remove properties set/defaulted by form for default connectionMethod
        connInfo.port = undefined;
        connInfo.askForPassword = undefined;
      }
      return connInfo;
    },
    parseBeforeEditConnection: ({ connInfo }) => {
      /**
       * This hook is called before editing the connection using form
       */
      if (connInfo.connectionMethod === 'Server Manager') {
        // Remove properties that may have been added by a resolve call (if we have connected)
        connInfo.https = undefined;
        connInfo.host = undefined;
        connInfo.port = undefined;
        connInfo.pathPrefix = undefined;
        connInfo.username = undefined;
        connInfo.password = undefined;
      }
      return connInfo;
    },
    resolveConnection: async ({ connInfo }) => {
      /**
       * This hook is called after a connection definition has been fetched
       * from settings and is about to be used to connect.
       */
       if (connInfo.connectionMethod === 'Server Manager' && connInfo.server && !connInfo.host) {
        const smExtension = vscode.extensions.getExtension('intersystems-community.servermanager');
        if (smExtension) {
          if (!smExtension.isActive) {
            await smExtension.activate();
          }
          const serverManagerApi = smExtension.exports;
          if (serverManagerApi && serverManagerApi.getServerSpec) {
            const serverSpec = await serverManagerApi.getServerSpec(connInfo.server)
      
            const scheme = serverSpec.webServer.scheme
            const host = serverSpec.webServer.host
            const port = serverSpec.webServer.port
            const pathPrefix = serverSpec.webServer.pathPrefix
      
            let username = serverSpec.username;
            let password = serverSpec.password;
      
            // This arises when Server Manager 3+ defers to authentication provider
            if (typeof password === 'undefined') {
              const AUTHENTICATION_PROVIDER = 'intersystems-server-credentials';
              const scopes = [serverSpec.name, username];
              let session = await vscode.authentication.getSession(AUTHENTICATION_PROVIDER, scopes, { silent: true });
              if (!session) {
                  session = await vscode.authentication.getSession(AUTHENTICATION_PROVIDER, scopes, { createIfNone: true });
              }
              if (session) {
                  username = username || session.scopes[1];
                  password = session.accessToken;
              }
            }
            connInfo = {...connInfo, https: scheme === 'https', host, port, pathPrefix, username, password}
          }
        }
        else {
          throw new Error('Server Manager extension not available');
        }
      }
        return connInfo;
    },
    driverAliases: DRIVER_ALIASES,
  }
}

export function deactivate() {}
