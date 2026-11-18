# Dual Brainstorm relay (Cloudflare Worker)

IMDb won't let a web page read its list pages, so Dual Brainstorm asks this small Worker instead.
It takes an IMDb list ID, reads the list fresh from IMDb, and sends back the title IDs.
It stores nothing and only accepts list IDs, so nobody can use it as a general proxy.
The free Cloudflare plan covers it (100,000 requests a day).

## Set it up (about 5 minutes, no installs)

1. Sign up or log in at https://dash.cloudflare.com.
2. In the sidebar, open **Compute (Workers)** › **Workers & Pages**, then click **Create** › **Start with Hello World!**.
3. Name it something like `dual-brainstorm-relay` and click **Deploy**.
4. Click **Edit code**, delete everything in `worker.js`, paste in the contents of [`worker.js`](worker.js) from this folder, and click **Deploy**.
5. Copy the Worker's address. It looks like `https://dual-brainstorm-relay.<your-name>.workers.dev`.

## Check it works

Open this in your browser, with your own address:

```
https://dual-brainstorm-relay.<your-name>.workers.dev/?list=ls055592025
```

- A response like `{"list":"ls055592025","ids":["tt…",…]}` means it works.
- `"IMDb wouldn't give up this list"` means IMDb refused. Check the list is public. The `details` say which method failed.

## Connect it to the page

In `dual-brainstorm/index.html`, find this line and paste your address between the quotes:

```js
var WORKER_URL = "";
```

If the Worker ever fails, the page falls back to the public relays.
