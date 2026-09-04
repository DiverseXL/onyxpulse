/** Thrown by serverless entrypoints when required env config is missing. */
export class ServerlessConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerlessConfigError";
  }
}

/** Alias kept readable at call sites. */
export const TokenIssuerError = ServerlessConfigError;