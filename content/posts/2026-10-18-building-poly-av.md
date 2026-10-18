I’ve never made a car game, and I’m not particularly a car-game person. I just wanted to drive a rocket-powered Tesla Roadster around San Francisco, jump out of traffic, and see what happened.

That idea became [Poly AV](/): an open-source Bay Area driving game where you deliver food, earn fictional cash, upgrade your car, and occasionally get chased by the police for flying it. You can play alone or share a room with friends in your browser.

![A red Roadster waits on a San Francisco street, with a Tartine Bakery pickup marked on the dashboard.](/blog/building-poly-av/street.jpg)

*A gameplay capture from the alpha: the next stop is Tartine, and the purple rocket collectible ahead can temporarily equip a car for flight.*

## From the Roadster to a food run

My original pitch was basically “GTA 6, but lite”: a place to drive around the Bay with other people, bump into each other, steal a car, and play with a Roadster that could jump and fly. I kept thinking about the possibilities: getting out of traffic, escaping a parking lot, finding a shortcut nobody on the road could take.

Tesla’s [announced Roadster Rocket](https://www.tesla.com/en_GB/roadster) describes cold-gas thrusters that can push and rotate the car. Poly AV takes that idea into arcade territory: the air tanks, repeated jumps, hover, boosts and long flights are game fiction, not a simulation of a car you can buy and drive on public roads.

A flying car is a toy. I wanted a reason to keep taking it somewhere. I like Uber Eats, and delivering dinner in a flying car sounded like a fun excuse to explore. So the sandbox became a delivery game.

The first run sends you to Tartine Bakery. Reach the pickup quickly and you earn a bonus. Then take the order to a fictional customer: arrive ahead of the estimate and the fare increases; arrive late and it falls. The timers follow active play, so walking away from the browser doesn’t keep making your order later indefinitely. You can ignore the order and explore, too.

![Diagram of the delivery loop: pick up a meal, deliver it for cash, and upgrade your ride; flight is an optional shortcut that uses air and may attract police.](/blog/building-poly-av/delivery-loop.svg)

The money makes the next decision interesting. Do I save it, repair my car, buy a better motor, or spend it on more air capacity so I can take a riskier route next time? The loop is intentionally small: get a job, go somewhere, get paid, and use the reward to make the next trip more fun.

## The Bay has to feel like the Bay

I wanted this to be a love letter to the Bay Area, not just a city grid with San Francisco names attached. The first version had a square map and a Golden Gate Bridge on land. That was an easy correction to articulate: if I’m making a Bay Area driving game, the bridge needs water underneath it, and Oakland needs to be on the other side of the Bay.

Now the Golden Gate heads toward Marin, and the Bay Bridge connects San Francisco and Oakland through Yerba Buena Island. The map extends down the Peninsula and East Bay toward San Jose. Completing deliveries and earning cash unlock more regions during a session, so a longer trip becomes a goal rather than a huge empty map you have to cross immediately.

The world is still a deliberately compressed, stylized remix, not an exact recreation or navigation map. It includes more than 100 low-poly landmarks, from Coit Tower and the Transamerica Pyramid to Salesforce Tower and SFO, along with fictional tech billboards. Some highway shapes use [OpenStreetMap data](https://www.openstreetmap.org/copyright); the game’s positions and distances are artistic choices. Restaurant and Tesla Supercharger identities are real, but their in-game placements and the compressed-air refill service are fictional. Poly AV isn’t affiliated with the named businesses.

## Flight needs both shortcuts and consequences

The Roadster Rocket starts with thrusters, but I didn’t want flight to be exclusive to one car. On a keyboard, tap E to jump, hold it to hover, and use the driving controls to move through the air. Find a purple rocket collectible and any vehicle can fly temporarily; fictional SpaceX shops also sell rocket kits that last for the session, along with upgrades, repairs and air. The shops are placed around the map as game locations, not real SpaceX services.

The sky has its own routes. Blue lanes give a flying car a speed boost and replenish air; golden thermals near landmarks lift it and replenish air. They make the skyline useful as well as recognizable. They’re arcade currents, not a model of actual Bay Area weather.

![The Roadster hovers above a San Francisco street near a blue sky lane.](/blog/building-poly-av/airborne.jpg)

*The Roadster hovers near a blue sky lane.*

Flight can also attract police. Fly low near a patrol car and it can chase you; if it gets close while you’re on the ground, it can slow and stop you. Then the game issues a ticket: longer or higher flights and repeat offenses increase the fine. I wanted a shortcut to feel tempting without always being free. You can make good money by delivering early, then lose some of it if you get caught.

![A police citation in the game shows a $68 fine and explains how flight time and repeat offenses affect it.](/blog/building-poly-av/citation.jpg)

*A citation from a play session. The amount is fictional game cash.*

## What you can do in the alpha

Those tradeoffs gave the game a direction. Around them, we added cars, places and ways to play. Here’s what is playable today:

- **Drive and swap cars.** Pick a Tesla to start. Waymo, Cruise and Zoox vehicles appear in traffic and parked around town; get out and take one. The handling is arcade tuning, and the vehicles are stylized interpretations.
- **Deliver and progress.** Pick up from named restaurants, deliver to fictional customers, earn bonuses for speed, and unlock more of the Bay. Some destinations are rooftops if your car can fly.
- **Upgrade and explore.** Collect rocket, air and repair pickups; spend delivery cash at workshops; use sky lanes and thermals to keep flying. Achievements recognize things like a rooftop landing or flying across the Bay without landing on the bridge or island.
- **Choose your view.** The cockpit camera follows the car through rolls and flips. It puts the current destination on a small dashboard and, when visible, a floating sign. The room leaderboard recognizes first-person driving time and qualifying deliveries; camera choice is self-reported, not a verified competitive ranking.
- **Make your own detour.** Free-roam, use autonomous cruise, ride the ferry to Rocket Island for races, or visit the fictional Rocket Dome for car soccer. There are parking challenges, synthesized music and sound effects, and keyboard, touch and gamepad controls.
- **Drive together.** Share a room code to see other drivers, traffic and collisions. The room leaderboard shows cash alongside active play time, so leaving the game idle is less useful than actually driving.

![The first-person view looks down a street with a small Tartine Bakery destination sign and dashboard.](/blog/building-poly-av/cockpit.jpg)

*Cockpit view keeps the pickup information in the scene while the camera follows the car.*

## A small multiplayer game on Cloudflare

I also wanted to see whether we could make the shared driving part work with Cloudflare and WebSockets. In solo mode, the simulation runs locally. In a multiplayer room, a Cloudflare Durable Object runs the shared simulation: players send controls over WebSockets, and the room sends the resulting world state back. That means the room, rather than each browser independently, decides where cars are and what happens when they collide or complete a delivery. Cloudflare documents the [Durable Object WebSocket model](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) behind this setup.

I’ve been building this in layers with coding agents: get a drive working, try it, then add the next mechanic. After trying the controls, I asked for sharper steering and a simpler way to fly. Now a tap of E jumps and holding the same key hovers. The code and [contributor contracts](https://github.com/swyxio/TeslaRoadster6) are public under MIT, so other coding agents and contributors can change the visuals or build on the gameplay without each inventing a different simulation.

This is an alpha, not a persistent MMO. Rooms and delivery progress are session-based and reset when the room ends or restarts. There’s no shooting or permanent game economy yet.

I started with a flying-car daydream. Now I can pick up dinner, chase a bonus across a condensed version of the Bay, and find out whether the shortcut was worth the ticket. If that sounds fun, [take a drive](/).
