# PumpRoute UK: setup guide

PumpRoute is a UK sat-nav that runs on Android and iPhone from one web link.
It gives turn-by-turn voice directions, offers 2–3 alternative routes, and shows
the cheapest fuel within your chosen distance (1–5 miles) of the route. For any
station it tells you which exit to take and how to get back onto your route.

## 1. Put it online (free, about 2 minutes)

The app has to be on an https address so phones allow GPS. The easiest way:

1. Unzip `pumproute.zip`. You'll get a folder called `pumproute`.
2. On a computer, go to **https://app.netlify.com/drop** and create a free account.
3. Drag the whole `pumproute` folder onto the page.
4. Netlify gives you a link such as `https://something-random.netlify.app`.
   You can rename it under *Site configuration → Change site name*, e.g. `pumproute-max.netlify.app`.

Alternatives that work the same way: GitHub Pages and Cloudflare Pages.

To update the app later, drag the new folder onto the same site under *Deploys*.

## 2. Install it on a phone

**Android (Chrome):** open the link → menu ⋮ → **Install app** (or *Add to Home screen*).

**iPhone (Safari):** open the link → Share button → **Add to Home Screen**.

On first launch, allow **location** access. Share the link with friends and they do the same.
Each phone keeps its own settings (fuel type, last price paid, keys).

## 3. Using it

1. On the start screen, pick your fuel, optionally type the price you paid at your last fill,
   and choose how far off the route you're willing to go.
2. Type a destination (a postcode works best). Your GPS position is the starting point.
3. Choose one of the routes. The card at the bottom shows the cheapest station on that route.
4. Tap **Start**. While you drive, the card above the bar shows the cheapest station in the next 40 miles.
   Tap it (or the pump button) to see the exit you need, the extra time and distance,
   and the directions back to your route. Then tap **Go to this station**.

Keep the app open and the screen on while driving. The app asks the phone to keep the screen awake.

## 4. Live traffic (optional, free)

1. Sign up at **https://developer.tomtom.com** and copy your API key
   (the free tier allows about 2,500 route requests a day).
2. In the app: ⚙ Settings → *Live traffic: TomTom API key* → paste → Done.

With a key you get traffic-aware routes and arrival times, jams coloured on your route,
a traffic layer (traffic-light button), and a "faster route found" alert every 5 minutes.
Friends can use your key or their own. Without a key, routing still works but ignores traffic.

## 5. Live fuel prices

Prices come from the government's **Fuel Finder** scheme. A GitHub job (`.github/workflows/prices.yml`)
runs every 15 minutes, signs in with your Fuel Finder credentials and publishes the latest prices
as files on the site. The app reads those files, so no credentials ever reach a phone.

One-off setup in the GitHub repository:
1. **Settings → Secrets and variables → Actions → New repository secret**: add `FF_CLIENT_ID` and `FF_CLIENT_SECRET`.
2. **Settings → Pages → Source: GitHub Actions**.
3. **Actions → Update fuel prices and publish → Run workflow** to start the first run.

If live prices are unavailable, the app shows real stations with **sample** prices, clearly labelled.
⚙ Settings shows whether prices are live and when they were last refreshed.
GitHub pauses scheduled jobs if a repository has no activity for 60 days: re-enable it under **Actions**.

## 6. Test mode

⚙ Settings → *Test mode: simulate driving* moves the car along the route by itself
(1×–10× speed), so you can try routes, fuel stops and voice prompts from your sofa.
**Turn it off before a real drive.**

## Good to know

- **iPhone:** the app works only while it is open on screen. If you switch to another app, guidance pauses until you come back.
- Routing without a TomTom key uses the free public OSRM server, which is meant for light use.
  That's fine for you and some friends, but not for a commercial launch.
- Map © OpenStreetMap contributors and CARTO. Stations © OpenStreetMap contributors.
  Fuel Finder data is published under the Open Government Licence.
- Always follow road signs and the Highway Code, and set the destination before you set off.
