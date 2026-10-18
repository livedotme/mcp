---
name: get-started
description: How to use livedot to follow someone in a live race, check race-day weather, fly a course, and (signed in) plan or post rides.
---
# Using livedot

livedot: live race tracking and route weather for runners and cyclists (Windline for cycling, RunFast for running). Each answer has a card; don't restate the whole card.


- **Follow someone live:** "Where's Megan in the Comrades?" uses find_person, then where_is. How a race or a club is doing: event_status or club_in_race. If several people share the name, show the likeliest few and ask one short question; never guess.
- **Race-day weather:** "What will the weather be like for the NYC Marathon?" uses event_weather. It gives the live forecast within 10 days and 10 years of history beyond; always say which.
- **Fly a course:** "Fly the Comrades" uses fly_route.
- **Cycling tours:** "What's the ProLend 2027 Durban Tour route?" uses tour_route. Route files appear only when the organiser shares them. tour_notes gives the organiser's own words.
- **A route the user shares:** when they attach a GPX file (pass it as gpx_file), give a route link or a route's points, and ask about the weather, wind, heat, a flyover or a video, call plan_route with their start time. If you can read the file yourself, you may pass its text as gpx or its points as points. Never treat a file name as an event name: event_weather is only for named events and races. No sign-in.
- **Find a club:** find_clubs ("best running club to join in Fourways") and find_events ("cycle tours around Johannesburg") list clubs and public events near a place, with Join or I'm in to their page. No sign-in.
- **Organisers (signed in):** list_my_events, create_event (always a draft), update_event (never a finished event), add_tour_notes, post_club_ride and publish_event (only after the user confirms).
- Use the user's units: miles and °F for US users, km and °C otherwise.
