import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type FetcherConfig, nexusFetch } from "./fetcher.js";

const mockFetch = vi.fn();

describe("nexusFetch", () => {
  const config: FetcherConfig = {
    baseUrl: "http://localhost:3000/api",
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("URL construction", () => {
    it("builds correct URL for GET", async () => {
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));
      await nexusFetch(config, "GET", "/users");
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:3000/api/users", expect.any(Object));
    });

    it("encodes query params for GET with body", async () => {
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
      await nexusFetch(config, "GET", "/users", { limit: 10 });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("limit=10");
    });
  });

  describe("auth token", () => {
    it("attaches Bearer token from getToken", async () => {
      const authConfig: FetcherConfig = {
        ...config,
        getToken: () => "my-token",
      };
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
      await nexusFetch(authConfig, "GET", "/users");
      const init = mockFetch.mock.calls[0][1] as RequestInit;
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer my-token");
    });

    it("does not attach header when getToken returns null", async () => {
      const authConfig: FetcherConfig = {
        ...config,
        getToken: () => null,
      };
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
      await nexusFetch(authConfig, "GET", "/users");
      const init = mockFetch.mock.calls[0][1] as RequestInit;
      expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    });
  });

  describe("error handling", () => {
    it("throws with error message from response body", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "User not found" } }), { status: 404 }),
      );
      await expect(nexusFetch(config, "GET", "/users/999")).rejects.toThrow("User not found");
    });

    it("throws generic message when response has no error body", async () => {
      mockFetch.mockResolvedValueOnce(new Response("", { status: 500 }));
      await expect(nexusFetch(config, "GET", "/users")).rejects.toThrow("Request failed: 500");
    });
  });

  describe("POST body", () => {
    it("sends JSON body for POST", async () => {
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 1 }), { status: 201 }));
      await nexusFetch(config, "POST", "/users", { name: "John" });
      const init = mockFetch.mock.calls[0][1] as RequestInit;
      expect(init.body).toBe(JSON.stringify({ name: "John" }));
    });
  });

  describe("GET deduplication", () => {
    it("deduplicates concurrent GET requests", async () => {
      let resolveFirst: ((value: Response) => void) | undefined;
      const promise = new Promise<Response>((resolve) => {
        resolveFirst = resolve;
      });
      mockFetch.mockReturnValueOnce(promise);

      const p1 = nexusFetch(config, "GET", "/users");
      const p2 = nexusFetch(config, "GET", "/users");

      resolveFirst?.(new Response(JSON.stringify([{ id: 1 }]), { status: 200 }));

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toEqual([{ id: 1 }]);
      expect(r2).toEqual([{ id: 1 }]);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("does not deduplicate POST requests", async () => {
      mockFetch
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: 1 }), { status: 201 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: 2 }), { status: 201 }));

      await Promise.all([
        nexusFetch(config, "POST", "/users", { name: "A" }),
        nexusFetch(config, "POST", "/users", { name: "A" }),
      ]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
