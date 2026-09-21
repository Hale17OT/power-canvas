# Authentication boundary

Interactive development authentication is implemented with `@azure/msal-node` and `@azure/msal-node-extensions`. Browser authorization code/PKCE uses an approved tenant-specific public-client registration and a `http://localhost` redirect under **Mobile and desktop applications**. A Web redirect causes AADSTS7000218 even if the browser callback says it is complete. MSAL/AADSTS error codes are allowlisted; raw token responses and callback URLs are not logged.

`auth add <alias> --tenant <id> --client-id <id>` signs in for Global Discovery. Optional `--url <Dataverse origin>` also acquires that audience interactively. `auth list/show` expose nonsecret profile metadata. `auth remove` removes that profile and its protected cache, without revoking tenant consent. `--non-interactive` never starts sign-in.

Each alias binds tenant/client/account and its own encrypted cache. Windows uses CurrentUser DPAPI; macOS Keychain and Linux Secret Service are configured through Microsoft's extension but have not been exercised locally. If protected persistence is unavailable, authentication fails. No plaintext fallback, copied PAC tokens, passwords, client secrets or environment-variable bearer tokens are used.

`env list --auth <alias>` uses Global Discovery v2.0 Instances. `env use <alias> --auth <profile> --id <discovered ID>` verifies discovery and Dataverse WhoAmI, then saves an immutable local binding. `env show` displays that binding and explicitly does not claim a fresh verification. Default IDs contain the `Default-` prefix; organization and metadata IDs are GUIDs rather than strictly versioned UUIDs.

Before each planned write, authenticated discovery and WhoAmI must agree on tenant, environment, organization and allowlisted Dataverse origin. The account cannot silently switch. Redirects and cross-origin pagination are rejected before credentials can leave the service boundary. Scope is the selected service origin's `/.default`; delegated Dataverse user_impersonation permission and tenant-approved consent are prerequisites.

Live `doctor` checks target identity, English base-language metadata, customization privilege presence, and discovery compatibility. Privilege presence is a bounded preflight, not proof of every effective authorization rule. The server still authorizes each operation. PowerCanvas never grants privileges automatically.

Workload federation, device code, national clouds and separate PAC authentication are not implemented. The credential contracts preserve those extension points without claiming working CI auth.

References: [MSAL protected persistence](https://learn.microsoft.com/en-us/entra/identity-platform/msal-node-extensions), [desktop configuration](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-configuration), [Global Discovery](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/discovery-service).
