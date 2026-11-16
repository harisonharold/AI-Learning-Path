import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db/client.ts";
import * as schema from "../../../db/schema/index.ts";
import { audit, getEnv, githubEndpoints, log } from "../../platform/service.ts";
import { isAllowedGitHubId } from "./allowlist.ts";
import { exchangeCode, fetchAllowedUser, type GitHubOAuthConfig } from "./github-oauth.ts";

export const GITHUB_PROVIDER_ID = "github";

function build() {
  const env = getEnv();
  const ep = githubEndpoints(env);
  const configured = Boolean(env.GITHUB_APP_CLIENT_ID && env.GITHUB_APP_CLIENT_SECRET);
  const cfg: GitHubOAuthConfig = {
    clientId: env.GITHUB_APP_CLIENT_ID ?? "",
    clientSecret: env.GITHUB_APP_CLIENT_SECRET ?? "",
    tokenUrl: ep.token,
    apiUrl: ep.api,
    allowedId: env.ALLOWED_GITHUB_USER_ID,
    onRejected: async (githubId, login) => {
      log("warn", "sign-in refused: GitHub account not allowlisted", { githubId });
      await audit(null, "auth.signup_rejected", `github:${githubId}`, { login });
    },
  };

  /** Defence in depth: even if a row path bypassed getUserInfo, only the allowlisted GitHub account may exist or hold a session. */
  async function userHasAllowedAccount(userId: string): Promise<boolean> {
    const rows = await getDb()
      .select({ accountId: schema.account.accountId })
      .from(schema.account)
      .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, GITHUB_PROVIDER_ID)))
      .limit(1);
    return rows.length === 1 && isAllowedGitHubId(rows[0]!.accountId, env.ALLOWED_GITHUB_USER_ID);
  }

  return betterAuth({
    appName: "Systems Atlas",
    baseURL: env.APP_ORIGIN,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_ORIGIN],
    database: drizzleAdapter(getDb(), { provider: "mysql", schema }),
    emailAndPassword: { enabled: false },
    account: {
      encryptOAuthTokens: true,
      accountLinking: { enabled: false },
    },
    session: { expiresIn: 7 * 24 * 3600, updateAge: 24 * 3600 },
    // Better Auth also applies a stricter default to /sign-in/* (3 per 10 s); we state it explicitly so it is visible and tunable.
    rateLimit: {
      enabled: true,
      window: 60,
      max: env.AUTH_RATE_LIMIT_MAX,
      customRules: { "/sign-in/*": { window: 10, max: env.AUTH_SIGNIN_RATE_LIMIT_MAX } },
    },
    advanced: {
      useSecureCookies: env.ATLAS_ENV === "production",
      crossSubDomainCookies: { enabled: false }, // host-only cookies: never sent to SANDBOX_ORIGIN
      defaultCookieAttributes: { sameSite: "lax", httpOnly: true },
      database: { generateId: () => crypto.randomUUID() },
    },
    databaseHooks: {
      account: {
        create: {
          before: async (acc) => {
            if (acc.providerId !== GITHUB_PROVIDER_ID || !isAllowedGitHubId(acc.accountId, env.ALLOWED_GITHUB_USER_ID)) return false;
          },
        },
      },
      session: {
        create: {
          before: async (s) => {
            if (!(await userHasAllowedAccount(s.userId))) return false;
          },
        },
      },
    },
    plugins: configured
      ? [
          genericOAuth({
            config: [
              {
                providerId: GITHUB_PROVIDER_ID,
                name: "GitHub",
                clientId: cfg.clientId,
                clientSecret: cfg.clientSecret,
                authorizationUrl: ep.authorize,
                tokenUrl: ep.token,
                scopes: [],
                pkce: true,
                disableImplicitSignUp: false,
                getToken: (data) => exchangeCode(cfg, data),
                getUserInfo: async (tokens) => (tokens.accessToken ? fetchAllowedUser(cfg, tokens.accessToken) : null),
                accountSubject: ({ profile }) => String(profile.id),
              },
            ],
          }),
        ]
      : [],
  });
}

type Auth = ReturnType<typeof build>;
let instance: Auth | undefined;
export function getAuth(): Auth {
  instance ??= build();
  return instance;
}

export function githubLoginConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.GITHUB_APP_CLIENT_ID && env.GITHUB_APP_CLIENT_SECRET);
}
