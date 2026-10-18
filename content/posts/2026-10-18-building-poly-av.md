The first version of our Bay Area driving game had a problem: its Golden Gate Bridge was on land. It had a neat square grid, but not much of a Bay.

That was a useful correction. If the point is to drive a flying car around San Francisco, water and bridges are not decoration. They are the reason a shortcut is tempting in the first place.

Poly AV starts with a deliberately small premise: pick up food, deliver it, earn cash, and see what happens when the fastest route is above the road. It's an independent, open-source arcade game, currently in alpha. You can [play it in your browser](/), alone or in a room with friends.

## A delivery is a reason to explore

A sandbox is more fun when it gives you somewhere to go. In Poly AV, restaurants send you to fictional customers, and a quick pickup and an early arrival both pay bonuses. Take too long and the fare falls. The clock tracks active play, so leaving the game idle doesn't make a delivery late.

Those runs gradually open more of the map for the current session. You start in San Francisco, then earn your way toward Oakland, the Peninsula, Fremont and San Jose. This makes a longer drive feel like a little expedition instead of presenting the entire Bay as an empty checklist. Your money, unlocks and room leaderboard are session-only for now.

Some deliveries can land on rooftops. A rocket kit lets any vehicle fly, and a flying Tesla Roadster is available from the start. You can stay on the street, fly over the water, or try to land on a roof with dinner intact. The game recognizes small victories, including landing on a rooftop and flying across the Bay without landing on the bridge.

## A shortcut should have a tradeoff

Flight makes the map smaller in a good way, but it shouldn't erase every decision. Fly near a patrol car and police can chase you. A stop can turn into a ticket; longer flights, higher flights and repeat offenses make it more expensive. Getting away with the shortcut should feel different from paying for it.

Cash also gives you choices. Collect a purple rocket pickup, or visit a fictional SpaceX shop for upgrades, air and repairs. Blue sky lanes add speed and replenish air; golden thermals near landmarks such as Coit Tower and Salesforce Tower can lift you higher. These are arcade inventions, not real weather or a statement about what a real car can do.

The same goes for the geography. The Golden Gate crosses water toward Marin, and the Bay Bridge connects San Francisco and Oakland through Yerba Buena Island. Beyond those relationships, the world is compressed and remixed for driving. Some highway shapes use attributed OpenStreetMap data; the streets, coastlines, landmarks and distances are not navigation data. Real restaurant and Supercharger names appear in fictional locations, without any affiliation or real delivery or charging service.

## A small world worth sharing

You can choose a Tesla from the fleet, or get out and take an autonomous vehicle from the street. Cockpit view follows the car through rolls and flips, with a private dashboard and destination marker to help you keep your bearings. First-person time and completed runs appear on the room leaderboard; those camera stats are self-reported, not a verified competitive ranking.

Solo play runs the same game simulation locally. In a multiplayer room, a Cloudflare Durable Object runs the shared simulation and exchanges updates over WebSockets. Cars, traffic and deliveries belong to the room rather than to a permanent account. That gives us a playable base without pretending we've already built a persistent, massive online city.

The project is built in layers with coding agents, and its [source and contributor contracts](https://github.com/swyxio/TeslaRoadster6) are open. The alpha already has keyboard, touch and gamepad controls, synthesized music and a separate car-soccer Rocket Dome. There is still a lot to improve: the Bay is an approximation, vehicles and scenery are stylized, and progression resets with the session.

For now, the goal is simple: make the next delivery tempting enough that you take one more drive—and make the route interesting enough that you might not stay on the road.
