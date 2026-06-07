// Test double for `next/navigation`. redirect()/notFound() throw tagged errors
// so tests can assert control-flow that the framework would normally handle.

export class RedirectError extends Error {
  constructor(public readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
    this.name = "RedirectError";
  }
}

export class NotFoundError extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export function redirect(url: string): never {
  throw new RedirectError(url);
}

export function notFound(): never {
  throw new NotFoundError();
}
