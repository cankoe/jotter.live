export default {
  async fetch(request: Request, env: { ASSETS: { fetch: typeof fetch } }): Promise<Response> {
    const response = await env.ASSETS.fetch(request);
    const newResponse = new Response(response.body, response);
    newResponse.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    return newResponse;
  },
};
